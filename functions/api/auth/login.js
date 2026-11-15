import { json, hashPassword, sha256 } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!email || !password) return json({ error: "Введите email и пароль" }, 400);

  const user = await env.DB.prepare("SELECT id,password_hash,password_salt FROM users WHERE email=?").bind(email).first();
  if (!user) return json({ error: "Неверный email или пароль" }, 401);
  const candidate = await hashPassword(password, user.password_salt);
  if (candidate !== user.password_hash) return json({ error: "Неверный email или пароль" }, 401);

  const token = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, "0")).join("");
  const expires = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 19).replace("T", " ");
  await env.DB.prepare("INSERT INTO sessions (id_hash,user_id,expires_at) VALUES (?,?,?)").bind(await sha256(token), user.id, expires).run();
  return json({ ok: true }, 200, { "set-cookie": `sr_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1209600` });
}
