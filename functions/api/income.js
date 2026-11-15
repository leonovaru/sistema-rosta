import { json, requireUser, readJson, newId } from "../_lib/auth.js";
import { allocateIncome } from "../_lib/income-buckets.js";

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
  const { results } = await env.DB.prepare("SELECT i.*,d.title AS direction_title FROM income_entries i LEFT JOIN directions d ON d.id=i.direction_id WHERE i.user_id=? ORDER BY received_on DESC,created_at DESC LIMIT 200").bind(user.id).all();
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
  if (directionId) {
    const owns = await env.DB.prepare("SELECT id FROM directions WHERE id=? AND user_id=?").bind(directionId,user.id).first();
    if (!owns) return json({ error: "Направление не найдено" }, 404);
  }
  const clientId=body?.client_id?String(body.client_id):null,projectId=body?.project_id?String(body.project_id):null;
  if(clientId&&!await env.DB.prepare("SELECT id FROM clients WHERE id=? AND user_id=?").bind(clientId,user.id).first())return json({error:"Клиент не найден"},404);
  if(projectId){
    const project=await env.DB.prepare("SELECT id,client_id,direction_id FROM projects WHERE id=? AND user_id=?").bind(projectId,user.id).first();
    if(!project)return json({error:"Проект не найден"},404);
    if(clientId&&project.client_id!==clientId)return json({error:"Проект не относится к выбранному клиенту"},400);
    if(!clientId&&project.client_id) return json({error:"Выбери клиента, связанного с проектом"},400);
  }
  const buckets = await env.DB.prepare("SELECT id,percentage,active FROM income_buckets WHERE user_id=? AND active=1 ORDER BY sort_order").bind(user.id).all();
  let allocations;
  try { allocations = allocateIncome(amount, buckets.results); }
  catch { return json({ error: "Сначала настрой корзины так, чтобы распределение составляло 100%" }, 409); }
  const id = newId();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO income_entries (id,user_id,direction_id,amount,received_on,note,client_id,project_id) VALUES (?,?,?,?,?,?,?,?)").bind(id,user.id,directionId,amount,date,String(body?.note || "").slice(0,500),clientId,projectId),
    ...allocations.map(row => env.DB.prepare("INSERT INTO income_bucket_allocations (id,user_id,income_id,bucket_id,percentage,amount) VALUES (?,?,?,?,?,?)").bind(newId(),user.id,id,row.bucket_id,row.percentage,row.amount))
  ]);
  return json({ ok: true, id, allocations }, 201);
}
