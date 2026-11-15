import { json, requireUser } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ user: null }, 401);
  return json({ user });
}
