import { json, requireUser, readJson, newId } from "../_lib/auth.js";

function allowedEndpoint(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || (url.port && url.port !== "443")) return false;
    const host = url.hostname.toLowerCase();
    return host === "fcm.googleapis.com" || host.endsWith(".push.services.mozilla.com") ||
      host === "push.services.mozilla.com" || host === "web.push.apple.com";
  } catch { return false; }
}

function validKey(value, length) {
  try {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), c => c.charCodeAt(0));
    return bytes.length === length;
  } catch { return false; }
}

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const url = new URL(request.url);
  const endpoint = url.searchParams.get("endpoint");
  const row = endpoint
    ? await env.DB.prepare("SELECT id FROM push_subscriptions WHERE user_id=? AND endpoint=? LIMIT 1").bind(user.id, endpoint).first()
    : await env.DB.prepare("SELECT id FROM push_subscriptions WHERE user_id=? LIMIT 1").bind(user.id).first();
  return json({
    supported: Boolean(env.PUSH_VAPID_PUBLIC_KEY),
    public_key: env.PUSH_VAPID_PUBLIC_KEY || null,
    subscribed: Boolean(row)
  });
}

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  if (!env.PUSH_VAPID_PUBLIC_KEY) return json({ error: "Push-уведомления ещё не настроены на сервере" }, 503);
  const body = await readJson(request);
  const subscription = body?.subscription;
  if (!subscription || !allowedEndpoint(subscription.endpoint) ||
      !validKey(subscription.keys?.p256dh, 65) || !validKey(subscription.keys?.auth, 16)) {
    return json({ error: "Некорректная подписка на уведомления" }, 400);
  }
  await env.DB.prepare(`INSERT INTO push_subscriptions (id,user_id,endpoint,p256dh,auth,user_agent)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,
      auth=excluded.auth,user_agent=excluded.user_agent,updated_at=datetime('now')`)
    .bind(newId(), user.id, subscription.endpoint, subscription.keys.p256dh,
      subscription.keys.auth, String(request.headers.get("User-Agent") || "").slice(0, 500)).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request);
  const endpoint = String(body?.endpoint || "");
  if (!endpoint) return json({ error: "Подписка не выбрана" }, 400);
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?").bind(user.id, endpoint).run();
  return json({ ok: true });
}
