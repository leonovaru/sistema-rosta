import { json, requireUser, readJson } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const settings = await env.DB.prepare("SELECT monthly_target,timezone,daily_capacity_minutes FROM settings WHERE user_id=?").bind(user.id).first();
  return json({ settings });
}

export async function onRequestPut({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request);
  const target = Number(body?.monthly_target);
  const timezone = String(body?.timezone || "Europe/Moscow");
  const capacity = Math.round(Number(body?.daily_capacity_minutes ?? 360));
  if (!Number.isInteger(capacity) || capacity < 30 || capacity > 960) return json({ error: "Доступное время должно быть от 30 до 960 минут" }, 400);
  if (!Number.isFinite(target) || target < 0 || target > 100000000) return json({ error: "Некорректная цель" }, 400);
  try { new Intl.DateTimeFormat("ru-RU", { timeZone: timezone }); } catch { return json({ error: "Некорректный часовой пояс" }, 400); }
  await env.DB.prepare("UPDATE settings SET monthly_target=?,timezone=?,daily_capacity_minutes=?,updated_at=datetime('now') WHERE user_id=?").bind(target,timezone,capacity,user.id).run();
  return json({ ok: true });
}
