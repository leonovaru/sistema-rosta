import { json, requireUser, readJson } from "../../_lib/auth.js";
import { isTaskAvailableForPlanning } from "../../_lib/task-planning-availability.js";

export async function onRequestPatch({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request);
  const id = String(body?.id || "");
  const status = String(body?.status || "");
  if (!id || !["todo","done"].includes(status)) return json({ error: "Некорректные данные" }, 400);
  const step=await env.DB.prepare("SELECT s.id,t.project_id,t.client_id,p.status AS project_status,c.status AS client_status,pc.status AS project_client_status FROM task_steps s JOIN tasks t ON t.id=s.task_id AND t.user_id=s.user_id LEFT JOIN projects p ON p.id=t.project_id AND p.user_id=t.user_id LEFT JOIN clients c ON c.id=t.client_id AND c.user_id=t.user_id LEFT JOIN clients pc ON pc.id=p.client_id AND pc.user_id=p.user_id WHERE s.id=? AND s.user_id=?").bind(id,user.id).first();
  if(!step)return json({error:"Шаг не найден"},404);
  if(!isTaskAvailableForPlanning(step))return json({error:"Шаг архивной задачи доступен только для просмотра"},409);
  const result = await env.DB.prepare("UPDATE task_steps SET status=? WHERE id=? AND user_id=?").bind(status,id,user.id).run();
  if (!result.meta.changes) return json({ error: "Шаг не найден" }, 404);
  return json({ ok: true });
}
