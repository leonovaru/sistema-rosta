import { json, requireUser, readJson, newId } from "../_lib/auth.js";
import { allocateIncome } from "../_lib/income-buckets.js";
import { buildFinancialAttributionSnapshot } from "../_lib/financial-attribution.js";
import { isClientSelectable, isProjectSelectable } from "../_lib/workspace-entity-availability.js";

function dateInZone(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const settings = await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
  const today = dateInZone(settings?.timezone || "Europe/Moscow");
  const monthStart = today.slice(0,7) + "-01";
  const { results } = await env.DB.prepare("SELECT i.*,COALESCE(i.direction_title_snapshot,d.title) AS direction_title FROM income_entries i LEFT JOIN directions d ON d.id=COALESCE(i.direction_id_snapshot,i.direction_id) AND d.user_id=i.user_id WHERE i.user_id=? ORDER BY received_on DESC,created_at DESC LIMIT 200").bind(user.id).all();
  const total = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM income_entries WHERE user_id=? AND received_on>=? AND received_on<=?").bind(user.id,monthStart,today).first();
  return json({ entries: results, month_total: total?.total || 0, today, month_start: monthStart });
}

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request);
  const amount = Number(body?.amount);
  const date = String(body?.received_on || new Date().toISOString().slice(0,10));
  const directionId = body?.direction_id ? String(body.direction_id) : null;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) return json({ error: "Укажите корректную сумму" }, 400);
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) return json({ error: "Некорректная дата" }, 400);
  const clientId=body?.client_id?String(body.client_id):null,projectId=body?.project_id?String(body.project_id):null;
  const client=clientId?await env.DB.prepare("SELECT id,name,direction_id,status FROM clients WHERE id=? AND user_id=?").bind(clientId,user.id).first():null;
  if(clientId&&!client)return json({error:"Клиент не найден"},404);
  if(clientId&&!isClientSelectable(client))return json({error:"Нельзя привязать доход к закрытому клиенту"},409);
  const project=projectId?await env.DB.prepare("SELECT id,client_id,direction_id,title,status FROM projects WHERE id=? AND user_id=?").bind(projectId,user.id).first():null;
  if(projectId&&!project)return json({error:"Проект не найден"},404);
  if(projectId&&!isProjectSelectable(project))return json({error:"Нельзя привязать доход к архивному проекту"},409);
  if(project?.client_id&&!clientId){const linkedClient=await env.DB.prepare("SELECT status FROM clients WHERE id=? AND user_id=?").bind(project.client_id,user.id).first();if(!isClientSelectable(linkedClient))return json({error:"Нельзя привязать доход к проекту закрытого клиента"},409);}
  if(project&&clientId&&project.client_id!==clientId)return json({error:"Проект не относится к выбранному клиенту"},400);
  if(project&&!clientId&&project.client_id)return json({error:"Выбери клиента, связанного с проектом"},400);
  if(project&&directionId&&project.direction_id&&directionId!==project.direction_id)return json({error:"Направление должно соответствовать выбранному проекту"},400);
  if(!project&&client?.direction_id&&directionId&&directionId!==client.direction_id)return json({error:"Направление должно соответствовать выбранному клиенту"},400);
  const effectiveDirectionId=directionId||project?.direction_id||client?.direction_id||null;
  const direction=effectiveDirectionId?await env.DB.prepare("SELECT id,title FROM directions WHERE id=? AND user_id=?").bind(effectiveDirectionId,user.id).first():null;
  if(effectiveDirectionId&&!direction)return json({error:"Направление не найдено"},404);
  const snapshot=buildFinancialAttributionSnapshot({direction,client,project});
  const buckets = await env.DB.prepare("SELECT id,percentage,active FROM income_buckets WHERE user_id=? AND active=1 ORDER BY sort_order").bind(user.id).all();
  let allocations;
  try { allocations = allocateIncome(amount, buckets.results); }
  catch { return json({ error: "Сначала настрой корзины так, чтобы распределение составляло 100%" }, 409); }
  const id = newId();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO income_entries (id,user_id,direction_id,amount,received_on,note,client_id,project_id,direction_id_snapshot,direction_title_snapshot,client_id_snapshot,client_name_snapshot,project_id_snapshot,project_title_snapshot) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,user.id,effectiveDirectionId,amount,date,String(body?.note || "").slice(0,500),clientId,projectId,snapshot.direction_id_snapshot,snapshot.direction_title_snapshot,snapshot.client_id_snapshot,snapshot.client_name_snapshot,snapshot.project_id_snapshot,snapshot.project_title_snapshot),
    ...allocations.map(row => env.DB.prepare("INSERT INTO income_bucket_allocations (id,user_id,income_id,bucket_id,percentage,amount) VALUES (?,?,?,?,?,?)").bind(newId(),user.id,id,row.bucket_id,row.percentage,row.amount))
  ]);
  return json({ ok: true, id, allocations }, 201);
}

export async function onRequestDelete({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request);
  const id = String(body?.id || "").trim();
  if (!id) return json({ error: "Не выбрано поступление" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM income_entries WHERE id=? AND user_id=?").bind(id,user.id).first();
  if (!existing) return json({ error: "Поступление не найдено" }, 404);
  try {
    const result = await env.DB.prepare("DELETE FROM income_entries WHERE id=? AND user_id=?").bind(id,user.id).run();
    if (!result.meta?.changes) return json({ error: "Поступление не найдено" }, 404);
    return json({ ok: true, id });
  } catch (error) {
    const message = String(error?.message || "");
    if (/Нельзя удалить распределение|Нельзя изменить распределение|FOREIGN KEY constraint failed/i.test(message)) {
      return json({ error: "Нельзя удалить поступление: распределённые деньги уже обеспечивают сохранённые расходы или платежи. Сначала исправь связанные операции." }, 409);
    }
    throw error;
  }
}
