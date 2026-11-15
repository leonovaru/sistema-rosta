import { json, newId, hashPassword } from "../../_lib/auth.js";

const DIRECTIONS = [
  "Операционный аудит бизнеса",
  "Google Таблицы и автоматизация",
  "Репетиторство и Решай360",
  "Коучинг и стратегические сессии",
  "Бизнес-аналитика",
  "Обучение Google Таблицам",
  "AI и автоматизация процессов",
  "Внешнее операционное управление"
];

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: "Проверьте email" }, 400);
  if (password.length < 10 || password.length > 200) return json({ error: "Пароль должен содержать от 10 до 200 символов" }, 400);

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
  if (existing) return json({ error: "Аккаунт с таким email уже существует" }, 409);

  const id = newId();
  const salt = crypto.randomUUID() + crypto.randomUUID();
  const passwordHash = await hashPassword(password, salt);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id,email,password_hash,password_salt) VALUES (?,?,?,?)").bind(id, email, passwordHash, salt),
      env.DB.prepare("INSERT INTO settings (user_id,monthly_target,timezone) VALUES (?,300000,'Europe/Moscow')").bind(id),
      ...DIRECTIONS.map((title, i) => env.DB.prepare("INSERT INTO directions (id,user_id,title,sort_order) VALUES (?,?,?,?)").bind(newId(), id, title, i))
    ]);
  } catch {
    return json({ error: "Не удалось создать аккаунт. Возможно, email уже зарегистрирован." }, 400);
  }
  return json({ ok: true, message: "Аккаунт создан. Теперь войдите." }, 201);
}
