import { json, requireUser, readJson, newId } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const { results } = await env.DB.prepare("SELECT * FROM tasks WHERE user_id=? ORDER BY CASE status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END, due_date IS NULL, due_date").bind(user.id).all();
  return json({ tasks: results });
}

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request);
  const title = String(body?.title || "").trim();
  if (!title || title.length > 240) return json({ error: "Введите название задачи (до 240 символов)" }, 400);
  const directionId = body?.direction_id ? String(body.direction_id) : null;
  if (directionId) {
    const owns = await env.DB.prepare("SELECT id FROM directions WHERE id=? AND user_id=?").bind(directionId, user.id).first();
    if (!owns) return json({ error: "Направление не найдено" }, 404);
  }
  const id = newId();
  await env.DB.prepare("INSERT INTO tasks (id,user_id,direction_id,title,description,due_date,priority) VALUES (?,?,?,?,?,?,?)")
    .bind(id, user.id, directionId, title, String(body?.description || "").slice(0,2000), body?.due_date || null, ["low","medium","high"].includes(body?.priority) ? body.priority : "medium").run();
  return json({ ok: true, id }, 201);
}

export async function onRequestPatch({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request);
  const id = String(body?.id || "");
  const status = String(body?.status || "");
  if (!id || !["todo","doing","waiting","done"].includes(status)) return json({ error: "Некорректные данные" }, 400);
  const result = await env.DB.prepare("UPDATE tasks SET status=?,completed_at=CASE WHEN ?='done' THEN datetime('now') ELSE NULL END WHERE id=? AND user_id=?")
    .bind(status,status,id,user.id).run();
  if (!result.meta.changes) return json({ error: "Задача не найдена" }, 404);
  return json({ ok: true });
}
