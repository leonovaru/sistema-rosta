import { json, newId, hashPassword } from "../../_lib/auth.js";

const INCOME_BUCKETS = [
  ["Жильё",30,"spending"],["Питание",20,"spending"],["Долги и обязательства",20,"spending"],["Капитал",10,"capital"],["Коты",5,"spending"],["Транспорт",5,"spending"],["Здоровье и уход",5,"spending"],["Свободные расходы",5,"spending"]
];

export function isValidRegistrationEmail(value) {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

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
  if (!isValidRegistrationEmail(email)) return json({ error: "Проверьте email" }, 400);
  if (password.length < 10 || password.length > 200) return json({ error: "Пароль должен содержать от 10 до 200 символов" }, 400);

  // By default, only the first account can be created. Enable open registration
  // deliberately for a future beta via the ALLOW_REGISTRATION Pages variable.
  if (env.ALLOW_REGISTRATION !== "true") {
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first();
    if (Number(count?.count || 0) > 0) return json({ error: "Регистрация закрыта. Это личная версия приложения." }, 403);
  }

  const id = newId();
  const salt = crypto.randomUUID() + crypto.randomUUID();
  const passwordHash = await hashPassword(password, salt);
  try {
    if (env.ALLOW_REGISTRATION === "true") {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO users (id,email,password_hash,password_salt) VALUES (?,?,?,?)").bind(id, email, passwordHash, salt),
        env.DB.prepare("INSERT INTO settings (user_id,monthly_target,timezone) VALUES (?,300000,'Europe/Moscow')").bind(id),
        ...DIRECTIONS.map((title, i) => env.DB.prepare("INSERT INTO directions (id,user_id,title,sort_order) VALUES (?,?,?,?)").bind(newId(), id, title, i)),
        ...INCOME_BUCKETS.map(([title, percentage, type], i) => env.DB.prepare("INSERT INTO income_buckets (id,user_id,title,percentage,bucket_type,sort_order) VALUES (?,?,?,?,?,?)").bind(newId(), id, title, percentage, type, i))
      ]);
    } else {
      const results = await env.DB.batch([
        env.DB.prepare("INSERT INTO users (id,email,password_hash,password_salt) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM users)").bind(id, email, passwordHash, salt),
        env.DB.prepare("INSERT INTO settings (user_id,monthly_target,timezone) VALUES (?,300000,'Europe/Moscow')").bind(id),
        ...DIRECTIONS.map((title, i) => env.DB.prepare("INSERT INTO directions (id,user_id,title,sort_order) VALUES (?,?,?,?)").bind(newId(), id, title, i)),
        ...INCOME_BUCKETS.map(([title, percentage, type], i) => env.DB.prepare("INSERT INTO income_buckets (id,user_id,title,percentage,bucket_type,sort_order) VALUES (?,?,?,?,?,?)").bind(newId(), id, title, percentage, type, i))
      ]);
      if (!results[0]?.meta?.changes) return json({ error: "Личный аккаунт уже создан. Регистрация закрыта." }, 403);
    }
  } catch {
    return json({ error: "Не удалось создать аккаунт. Возможно, email уже зарегистрирован." }, 400);
  }
  return json({ ok: true, message: "Аккаунт создан. Теперь войдите." }, 201);
}
