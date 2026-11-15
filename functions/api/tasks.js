import { json, requireUser, readJson, newId } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const { results } = await env.DB.prepare("SELECT t.*, d.title AS direction_title FROM tasks t LEFT JOIN directions d ON d.id=t.direction_id WHERE t.user_id=? ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END, t.due_date IS NULL, t.due_date, t.created_at DESC").bind(user.id).all();
  const { results: steps } = await env.DB.prepare("SELECT id,task_id,title,estimated_minutes,status,sort_order FROM task_steps WHERE user_id=? ORDER BY task_id,sort_order").bind(user.id).all();
  const byTask = new Map();
  for (const step of steps) {
    if (!byTask.has(step.task_id)) byTask.set(step.task_id, []);
    byTask.get(step.task_id).push(step);
  }
  return json({ tasks: results.map(task => ({ ...task, steps: byTask.get(task.id) || [] })) });
}

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request);
  const title = String(body?.title || "").trim();
  const description = String(body?.description || "").trim().slice(0,2000);
  if (!title || title.length > 240) return json({ error: "Введите название задачи (до 240 символов)" }, 400);
  const directionId = body?.direction_id ? String(body.direction_id) : null;
  const dueDate = body?.due_date ? String(body.due_date) : null;
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return json({ error: "Проверьте срок задачи" }, 400);
  const estimated = body?.estimated_minutes == null ? null : Math.round(Number(body.estimated_minutes));
  if (estimated !== null && (!Number.isInteger(estimated) || estimated < 5 || estimated > 10000)) return json({ error: "Проверьте оценку времени" }, 400);
  if (directionId) {
    const owns = await env.DB.prepare("SELECT id FROM directions WHERE id=? AND user_id=?").bind(directionId, user.id).first();
    if (!owns) return json({ error: "Направление не найдено" }, 404);
  }
  const id = newId();
  await env.DB.prepare("INSERT INTO tasks (id,user_id,direction_id,title,description,due_date,priority,estimated_minutes,ai_plan) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(id, user.id, directionId, title, description, dueDate, ["low","medium","high"].includes(body?.priority) ? body.priority : "medium", estimated, String(body?.ai_plan || "").slice(0,3000)).run();
  return json({ ok: true, id }, 201);
}

export async function onRequestPatch({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request);
  const id = String(body?.id || "");
  if (!id) return json({ error: "Некорректные данные" }, 400);
  if (body?.actual_minutes !== undefined) {
    const actual = body.actual_minutes === null || body.actual_minutes === "" ? null : Math.round(Number(body.actual_minutes));
    if (actual !== null && (!Number.isInteger(actual) || actual < 0 || actual > 10000)) return json({ error: "Укажите фактическое время в минутах" }, 400);
    const result = await env.DB.prepare("UPDATE tasks SET actual_minutes=? WHERE id=? AND user_id=?").bind(actual,id,user.id).run();
    if (!result.meta.changes) return json({ error: "Задача не найдена" }, 404);
    return json({ ok: true });
  }
  const status = String(body?.status || "");
  if (!["todo","doing","waiting","done"].includes(status)) return json({ error: "Некорректные данные" }, 400);
  const result = await env.DB.prepare("UPDATE tasks SET status=?,completed_at=CASE WHEN ?='done' THEN datetime('now') ELSE NULL END WHERE id=? AND user_id=?").bind(status,status,id,user.id).run();
  if (!result.meta.changes) return json({ error: "Задача не найдена" }, 404);
  return json({ ok: true });
}
