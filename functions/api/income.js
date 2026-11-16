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
  if (body?.action === "update") {
    const id=String(body.id||"").trim(),amount=Number(body.amount),date=String(body.received_on||""),note=String(body.note||"").slice(0,500);
    if(!id||!Number.isFinite(amount)||amount<=0||amount>100000000||!/^\d{4}-\d{2}-\d{2}$/.test(date)){return json({error:"Проверь сумму и дату поступления"},400);}
    const existing=await env.DB.prepare("SELECT id,amount FROM income_entries WHERE id=? AND user_id=?").bind(id,user.id).first();
    if(!existing)return json({error:"Поступление не найдено"},404);
    const allocations=await env.DB.prepare("SELECT id,bucket_id,percentage,amount FROM income_bucket_allocations WHERE income_id=? AND user_id=? ORDER BY created_at,id").bind(id,user.id).all();
    const rows=allocations.results||[];
    if(Math.abs(Number(existing.amount)-amount)>0.0001&&!rows.length)return json({error:"У этого поступления нет сохранённого распределения. Сумму нельзя менять автоматически."},409);
    let next=[];
    if(rows.length){
      try{next=allocateIncome(amount,rows.map(row=>({id:row.bucket_id,percentage:Number(row.percentage)})));}
      catch{return json({error:"Сохранённые доли распределения некорректны. Сумму нельзя изменить автоматически."},409);}
    }
    const updateIncome=env.DB.prepare("UPDATE income_entries SET amount=?,received_on=?,note=? WHERE id=? AND user_id=?").bind(amount,date,note,id,user.id);
    const updateAllocations=rows.map((row,index)=>env.DB.prepare("UPDATE income_bucket_allocations SET amount=? WHERE id=? AND user_id=? AND income_id=?").bind(next[index].amount,row.id,user.id,id));
    try{
      const statements=amount<Number(existing.amount)-0.0001?[...updateAllocations,updateIncome]:[updateIncome,...updateAllocations];
      await env.DB.batch(statements);
    }catch(error){
      const message=String(error?.message||error);
      if(/Нельзя изменить распределение|Средства уже переведены из корзины|Сумма дохода меньше уже распределенных средств|FOREIGN KEY constraint failed/i.test(message))return json({error:"Нельзя уменьшить или перераспределить поступление: часть этих денег уже использована. Сумма и распределение оставлены без изменений."},409);
      throw error;
    }
    return json({ok:true,id,allocations:next});
  }
  const amount = Number(body?.amount);
  const date = String(body?.received_on || new Date().toISOString().slice(0,10));
  const directionId = body?.direction_id ? String(body.direction_id) : null;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) return json({ error: "Укажите корректную сумму" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Некорректная дата" }, 400);
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
  const note=String(body?.note||"").slice(0,500),requestId=String(body?.request_id||"");
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId))return json({error:"Не удалось подтвердить запрос поступления"},400);
  const matches=row=>row&&Math.abs(Number(row.amount)-amount)<0.0001&&row.received_on===date&&String(row.note||"")===note&&row.direction_id===(effectiveDirectionId||null)&&row.client_id===(clientId||null)&&row.project_id===(projectId||null);
  const prior=await env.DB.prepare("SELECT id,amount,received_on,note,direction_id,client_id,project_id FROM income_entries WHERE user_id=? AND request_id=?").bind(user.id,requestId).first();
  if(prior){
   if(!matches(prior))return json({error:"Идентификатор запроса уже использован для другого поступления"},409);
   const savedAllocations=await env.DB.prepare("SELECT bucket_id,percentage,amount FROM income_bucket_allocations WHERE income_id=? AND user_id=? ORDER BY created_at,id").bind(prior.id,user.id).all();
   return json({ok:true,id:prior.id,allocations:savedAllocations.results,idempotent:true});
  }
  const buckets = await env.DB.prepare("SELECT id,percentage,active FROM income_buckets WHERE user_id=? AND active=1 ORDER BY sort_order").bind(user.id).all();
  let allocations;
  try { allocations = allocateIncome(amount, buckets.results); }
  catch { return json({ error: "Сначала настрой корзины так, чтобы распределение составляло 100%" }, 409); }
  const id = newId();
  try{
   await env.DB.batch([
    env.DB.prepare("INSERT INTO income_entries (id,user_id,direction_id,amount,received_on,note,client_id,project_id,direction_id_snapshot,direction_title_snapshot,client_id_snapshot,client_name_snapshot,project_id_snapshot,project_title_snapshot,request_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,user.id,effectiveDirectionId,amount,date,note,clientId,projectId,snapshot.direction_id_snapshot,snapshot.direction_title_snapshot,snapshot.client_id_snapshot,snapshot.client_name_snapshot,snapshot.project_id_snapshot,snapshot.project_title_snapshot,requestId),
    ...allocations.map(row => env.DB.prepare("INSERT INTO income_bucket_allocations (id,user_id,income_id,bucket_id,percentage,amount) VALUES (?,?,?,?,?,?)").bind(newId(),user.id,id,row.bucket_id,row.percentage,row.amount))
   ]);
  }catch(error){
   if(/UNIQUE constraint failed.*income_entries\.user_id, income_entries\.request_id/.test(String(error?.message||error))){
    const existing=await env.DB.prepare("SELECT id,amount,received_on,note,direction_id,client_id,project_id FROM income_entries WHERE user_id=? AND request_id=?").bind(user.id,requestId).first();
    if(matches(existing)){
     const savedAllocations=await env.DB.prepare("SELECT bucket_id,percentage,amount FROM income_bucket_allocations WHERE income_id=? AND user_id=? ORDER BY created_at,id").bind(existing.id,user.id).all();
     return json({ok:true,id:existing.id,allocations:savedAllocations.results,idempotent:true});
    }
    return json({error:"Идентификатор запроса уже использован"},409);
   }
   throw error;
  }
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
    if (/Нельзя удалить распределение|Нельзя изменить распределение|Средства уже переведены из корзины|FOREIGN KEY constraint failed/i.test(message)) {
      return json({ error: "Нельзя удалить поступление: распределённые деньги уже обеспечивают сохранённые расходы или платежи. Сначала исправь связанные операции." }, 409);
    }
    throw error;
  }
}
