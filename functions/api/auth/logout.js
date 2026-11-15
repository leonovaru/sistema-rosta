import { json, getCookie, sha256, cookieOptions } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const token = getCookie(request);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id_hash=?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "set-cookie": cookieOptions(0) });
}
