import { json, requireUser, readJson, newId } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const { results } = await env.DB.prepare("SELECT * FROM directions WHERE user_id=? ORDER BY sort_order,id").bind(user.id).all();
  return json({ directions: results });
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
