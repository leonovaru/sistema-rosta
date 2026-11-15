import { json, requireUser, readJson } from "../../_lib/auth.js";

export async function onRequestPatch({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request);
  const id = String(body?.id || "");
  const status = String(body?.status || "");
  if (!id || !["todo","done"].includes(status)) return json({ error: "Некорректные данные" }, 400);
  const result = await env.DB.prepare("UPDATE task_steps SET status=? WHERE id=? AND user_id=?").bind(status,id,user.id).run();
  if (!result.meta.changes) return json({ error: "Шаг не найден" }, 404);
  return json({ ok: true });
}
