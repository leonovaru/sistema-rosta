import { json, requireUser, readJson } from "../_lib/auth.js";

function monthContext(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { start: `${values.year}-${values.month}-01`, day: Number(values.day), days: new Date(Number(values.year), Number(values.month), 0).getDate() };
}

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const settings = await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
  const timeZone = settings?.timezone || "Europe/Moscow";
  const month = monthContext(timeZone);
  const { results } = await env.DB.prepare(`
    SELECT d.*,
      COALESCE(SUM(CASE WHEN i.received_on >= ? THEN i.amount ELSE 0 END),0) AS actual_month
    FROM directions d
    LEFT JOIN income_entries i ON i.direction_id=d.id AND i.user_id=d.user_id
    WHERE d.user_id=?
    GROUP BY d.id
    ORDER BY d.sort_order,d.id
  `).bind(month.start,user.id).all();
  const directions = results.map(item => ({
    ...item,
    forecast_month: month.day ? Number(item.actual_month || 0) / month.day * month.days : 0
  }));
  return json({ directions, month: { start: month.start, day: month.day, days: month.days, timezone: timeZone } });
}

export async function onRequestPut({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request);
  const target = Number(body?.monthly_target);
  if (!Number.isFinite(target) || target < 0 || target > 100000000) return json({ error: "Некорректная цель" }, 400);
  const id = String(body?.id || "");
  const title = String(body?.title || "").trim();
  if (!id || !title || title.length > 120) return json({ error: "Проверьте название направления" }, 400);
  const result = await env.DB.prepare("UPDATE directions SET title=?,target_month=? WHERE id=? AND user_id=?").bind(title, target, id, user.id).run();
  if (!result.meta.changes) return json({ error: "Направление не найдено" }, 404);
  return json({ ok: true });
}
