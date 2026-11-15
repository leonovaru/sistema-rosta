import { json, requireUser, readJson, newId } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const { results } = await env.DB.prepare("SELECT i.*,d.title AS direction_title FROM income_entries i LEFT JOIN directions d ON d.id=i.direction_id WHERE i.user_id=? ORDER BY received_on DESC,created_at DESC LIMIT 200").bind(user.id).all();
  const total = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM income_entries WHERE user_id=? AND received_on>=date('now','start of month')").bind(user.id).first();
  return json({ entries: results, month_total: total?.total || 0 });
}

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request);
  const amount = Number(body?.amount);
  const date = String(body?.received_on || new Date().toISOString().slice(0,10));
  const directionId = body?.direction_id ? String(body.direction_id) : null;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) return json({ error: "Укажите корректную сумму" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Некорректная дата" }, 400);
  if (directionId) {
    const owns = await env.DB.prepare("SELECT id FROM directions WHERE id=? AND user_id=?").bind(directionId,user.id).first();
    if (!owns) return json({ error: "Направление не найдено" }, 404);
  }
  const id = newId();
  await env.DB.prepare("INSERT INTO income_entries (id,user_id,direction_id,amount,received_on,note) VALUES (?,?,?,?,?,?)")
    .bind(id,user.id,directionId,amount,date,String(body?.note || "").slice(0,500)).run();
  return json({ ok: true, id }, 201);
}
