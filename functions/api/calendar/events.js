import { json, requireUser, readJson, newId } from "../../_lib/auth.js";
import { expandRecurringEvents } from "../../_lib/calendar.js";

const TYPES = ["meeting","travel","hobby","sleep","work","personal","other"];
const MODES = ["none","online","offline"];
const STATUSES = ["planned","completed","cancelled"];
const REPEATS = ["none","daily","weekly"];
async function invalidateTodayPlan(env,userId) {
  const settings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(userId).first();
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:settings?.timezone||"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  const today=values.year+"-"+values.month+"-"+values.day;
  await env.DB.prepare("DELETE FROM daily_plans WHERE user_id=? AND plan_date=?").bind(userId,today).run();
}
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanEvent(body) {
  const title = String(body?.title || "").trim();
  const event_type = String(body?.event_type || "other");
  const mode = String(body?.mode || "none");
  const start_at = String(body?.start_at || "");
  const end_at = String(body?.end_at || "");
  const actual_start_at = body?.actual_start_at ? String(body.actual_start_at) : null;
  const actual_end_at = body?.actual_end_at ? String(body.actual_end_at) : null;
  const status = String(body?.status || "planned");
  const repeat_rule = String(body?.repeat_rule || "none");
  const repeat_until = body?.repeat_until ? String(body.repeat_until) : null;
  if (!title || title.length > 180) return { error:"Укажи название события (до 180 символов)" };
  if (!TYPES.includes(event_type) || !MODES.includes(mode) || !STATUSES.includes(status) || !REPEATS.includes(repeat_rule)) return { error:"Некорректный тип, повторение или статус события" };
  if (!DATE_TIME.test(start_at) || !DATE_TIME.test(end_at) || end_at <= start_at) return { error:"Проверь дату и время начала и окончания" };
  if ((actual_start_at && !DATE_TIME.test(actual_start_at)) || (actual_end_at && !DATE_TIME.test(actual_end_at)) || (actual_start_at && actual_end_at && actual_end_at <= actual_start_at)) return { error:"Проверь фактическое время" };
  if (repeat_rule !== "none" && (!repeat_until || !DATE.test(repeat_until) || repeat_until < start_at.slice(0,10))) return { error:"Для повторяющегося события укажи дату окончания повторения не раньше первого события" };
  if (repeat_rule !== "none" && status !== "planned") return { error:"Серию событий можно оставить запланированной. Фактическое время фиксируй отдельным событием на конкретную дату." };
  if (repeat_rule !== "none" && (actual_start_at || actual_end_at)) return { error:"Фактическое время фиксируй отдельным событием на конкретную дату, не в шаблоне серии." };
  return { value:{
    title,event_type,mode,start_at,end_at,actual_start_at,actual_end_at,status,repeat_rule,repeat_until,
    location:String(body?.location || "").trim().slice(0,240),
    notes:String(body?.notes || "").trim().slice(0,2000)
  }};
}

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request,env);
  if (!user) return json({ error:"Необходим вход" },401);
  const url = new URL(request.url);
  const from = String(url.searchParams.get("from") || "");
  const to = String(url.searchParams.get("to") || "");
  if (!DATE_TIME.test(from) || !DATE_TIME.test(to) || to <= from) return json({ error:"Укажи корректный период календаря" },400);
  const { results } = await env.DB.prepare(`
    SELECT * FROM calendar_events
    WHERE user_id=? AND status!='cancelled'
      AND ((start_at < ? AND end_at > ?) OR (repeat_rule!='none' AND start_at < ? AND repeat_until >= ?))
    ORDER BY start_at
  `).bind(user.id,to,from,to,from.slice(0,10)).all();
  return json({ events:expandRecurringEvents(results,from,to) });
}

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request,env);
  if (!user) return json({ error:"Необходим вход" },401);
  const body = await readJson(request);
  const parsed = cleanEvent(body);
  if (parsed.error) return json({ error:parsed.error },400);
  const e = parsed.value, id = newId();
  await env.DB.prepare(`
    INSERT INTO calendar_events (id,user_id,title,event_type,mode,start_at,end_at,actual_start_at,actual_end_at,location,notes,status,repeat_rule,repeat_until)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(id,user.id,e.title,e.event_type,e.mode,e.start_at,e.end_at,e.actual_start_at,e.actual_end_at,e.location,e.notes,e.status,e.repeat_rule,e.repeat_until).run();
  await invalidateTodayPlan(env,user.id);
  return json({ ok:true,id },201);
}

export async function onRequestPatch({ request, env }) {
  const user = await requireUser(request,env);
  if (!user) return json({ error:"Необходим вход" },401);
  const body = await readJson(request);
  const id = String(body?.id || "");
  if (!id) return json({ error:"Событие не выбрано" },400);
  const parsed = cleanEvent(body);
  if (parsed.error) return json({ error:parsed.error },400);
  const e = parsed.value;
  const result = await env.DB.prepare(`
    UPDATE calendar_events SET title=?,event_type=?,mode=?,start_at=?,end_at=?,actual_start_at=?,actual_end_at=?,location=?,notes=?,status=?,repeat_rule=?,repeat_until=?,updated_at=datetime('now')
    WHERE id=? AND user_id=?
  `).bind(e.title,e.event_type,e.mode,e.start_at,e.end_at,e.actual_start_at,e.actual_end_at,e.location,e.notes,e.status,e.repeat_rule,e.repeat_until,id,user.id).run();
  if (!result.meta.changes) return json({ error:"Событие не найдено" },404);
  await invalidateTodayPlan(env,user.id);
  return json({ ok:true });
}

export async function onRequestDelete({ request, env }) {
  const user = await requireUser(request,env);
  if (!user) return json({ error:"Необходим вход" },401);
  const body = await readJson(request);
  const id = String(body?.id || "");
  if (!id) return json({ error:"Событие не выбрано" },400);
  const result = await env.DB.prepare("DELETE FROM calendar_events WHERE id=? AND user_id=?").bind(id,user.id).run();
  if (!result.meta.changes) return json({ error:"Событие не найдено" },404);
  await invalidateTodayPlan(env,user.id);
  return json({ ok:true });
}
