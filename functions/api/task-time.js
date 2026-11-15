import { json, requireUser, readJson, newId } from "../_lib/auth.js";
import { elapsedMinutes } from "../_lib/time-tracking.js";

async function invalidateTodayPlan(env,userId) {
  const settings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(userId).first();
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:settings?.timezone||"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  await env.DB.prepare("DELETE FROM daily_plans WHERE user_id=? AND plan_date=?").bind(userId,values.year+"-"+values.month+"-"+values.day).run();
}

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error:"Необходим вход" },401);
  const active = await env.DB.prepare(`
    SELECT e.id,e.task_id,e.started_at,t.title
    FROM task_time_entries e JOIN tasks t ON t.id=e.task_id AND t.user_id=e.user_id
    WHERE e.user_id=? AND e.ended_at IS NULL LIMIT 1
  `).bind(user.id).first();
  const { results } = await env.DB.prepare(`
    SELECT task_id,COUNT(*) AS sessions,COALESCE(SUM(duration_minutes),0) AS tracked_minutes
    FROM task_time_entries WHERE user_id=? AND ended_at IS NOT NULL GROUP BY task_id
  `).bind(user.id).all();
  return json({ active_timer:active || null, totals:results });
}

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error:"Необходим вход" },401);
  const body = await readJson(request) || {};
  const action = String(body.action || "");
  if (action === "start") {
    const taskId = String(body.task_id || "");
    if (!taskId) return json({ error:"Выберите задачу" },400);
    const task = await env.DB.prepare("SELECT id,status FROM tasks WHERE id=? AND user_id=?").bind(taskId,user.id).first();
    if (!task) return json({ error:"Задача не найдена" },404);
    if (task.status==="done") return json({ error:"Нельзя запустить таймер завершённой задачи" },400);
    const active = await env.DB.prepare("SELECT id,task_id FROM task_time_entries WHERE user_id=? AND ended_at IS NULL").bind(user.id).first();
    if (active) return json({ error:active.task_id===taskId?"Таймер этой задачи уже запущен":"Сначала остановите таймер другой задачи" },409);
    const id = newId();
    const now = new Date().toISOString();
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO task_time_entries(id,user_id,task_id,started_at) VALUES(?,?,?,?)").bind(id,user.id,taskId,now),
        env.DB.prepare("UPDATE tasks SET status='doing' WHERE id=? AND user_id=? AND status!='done'").bind(taskId,user.id)
      ]);
    } catch {
      return json({ error:"Уже запущен другой таймер. Обновите страницу." },409);
    }
    await invalidateTodayPlan(env,user.id);
    return json({ ok:true,active_timer:{id,task_id:taskId,started_at:now} },201);
  }
  if (action === "stop" || action === "pause") {
    const active = await env.DB.prepare("SELECT id,task_id,started_at FROM task_time_entries WHERE user_id=? AND ended_at IS NULL").bind(user.id).first();
    if (!active) return json({ error:"Активный таймер не найден" },404);
    const endedAt = new Date().toISOString();
    const minutes = elapsedMinutes(active.started_at,endedAt);
    if (minutes===null) return json({ error:"Не удалось рассчитать время таймера" },500);
    const [update] = await env.DB.batch([
      env.DB.prepare("UPDATE task_time_entries SET ended_at=?,duration_minutes=? WHERE id=? AND user_id=? AND ended_at IS NULL").bind(endedAt,minutes,active.id,user.id),
      env.DB.prepare("UPDATE tasks SET actual_minutes=COALESCE(actual_minutes,0)+? WHERE id=? AND user_id=? AND changes()=1 AND EXISTS (SELECT 1 FROM task_time_entries WHERE id=? AND user_id=? AND ended_at=? AND duration_minutes=?)").bind(minutes,active.task_id,user.id,active.id,user.id,endedAt,minutes)
    ]);
    if (!update.meta.changes) return json({ error:"Таймер уже остановлен" },409);
    await invalidateTodayPlan(env,user.id);
    return json({ ok:true,task_id:active.task_id,tracked_minutes:minutes,ended_at:endedAt });
  }
  return json({ error:"Неизвестное действие" },400);
}
