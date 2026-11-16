import { json, requireUser, readJson, newId } from "../_lib/auth.js";
import { validateGoalFundingBucket } from "../_lib/goal-funding.js";
import { isValidCalendarDate } from "../_lib/calendar.js";
const categories=new Set(["home","travel","business","health","learning","experience","help","purchase","other"]);
const priorities=new Set(["low","medium","high"]);
const statuses=new Set(["dream","considering","paused","completed"]);
export const isValidDreamDate=v=>!v||isValidCalendarDate(v);
const dateOk=isValidDreamDate;
const clean=(v,n)=>String(v||"").trim().slice(0,n);
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const [dreams,goals]=await Promise.all([
  env.DB.prepare("SELECT d.*,g.id AS goal_id,g.target_amount AS goal_target,g.status AS goal_status FROM dreams d LEFT JOIN financial_goals g ON g.dream_id=d.id AND g.user_id=d.user_id WHERE d.user_id=? ORDER BY CASE d.status WHEN 'dream' THEN 0 WHEN 'considering' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,CASE d.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,d.created_at DESC").bind(user.id).all(),
  env.DB.prepare(`SELECT g.*, b.title AS funding_bucket_title, b.active AS funding_bucket_active,
 COALESCE((SELECT SUM(t.amount-COALESCE((SELECT SUM(r.amount) FROM bucket_funding_transfer_reversals r WHERE r.transfer_id=t.id AND r.user_id=t.user_id),0)) FROM bucket_funding_transfers t WHERE t.user_id=g.user_id AND t.target_type='goal' AND t.target_id=g.id),0) AS transferred_amount,
 g.saved_amount+COALESCE((SELECT SUM(t.amount-COALESCE((SELECT SUM(r.amount) FROM bucket_funding_transfer_reversals r WHERE r.transfer_id=t.id AND r.user_id=t.user_id),0)) FROM bucket_funding_transfers t WHERE t.user_id=g.user_id AND t.target_type='goal' AND t.target_id=g.id),0) AS effective_saved_amount,
CASE WHEN b.id IS NULL THEN NULL ELSE
 COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=g.user_id AND a.bucket_id=b.id),0)
 - COALESCE((SELECT SUM(e.amount-COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r WHERE r.expense_id=e.id AND r.user_id=e.user_id),0)) FROM expenses e WHERE e.user_id=g.user_id AND e.bucket_id=b.id),0)
 - COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.user_id=g.user_id AND p.bucket_id=b.id),0)
 + COALESCE((SELECT SUM(r.amount) FROM debt_payment_reversals r JOIN debt_payments p ON p.id=r.debt_payment_id WHERE p.user_id=g.user_id AND p.bucket_id=b.id),0)
 - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=g.user_id AND p.bucket_id=b.id),0)
 + COALESCE((SELECT SUM(r.amount) FROM obligation_payment_reversals r JOIN obligation_payments p ON p.id=r.obligation_payment_id WHERE p.user_id=g.user_id AND p.bucket_id=b.id),0)
 - COALESCE((SELECT SUM(t.amount-COALESCE((SELECT SUM(r.amount) FROM bucket_funding_transfer_reversals r WHERE r.transfer_id=t.id AND r.user_id=t.user_id),0)) FROM bucket_funding_transfers t WHERE t.user_id=g.user_id AND t.source_bucket_id=b.id),0)
END AS funding_bucket_available
FROM financial_goals g LEFT JOIN income_buckets b ON b.id=g.funding_bucket_id AND b.user_id=g.user_id
WHERE g.user_id=? ORDER BY CASE g.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, CASE g.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, g.target_date`).bind(user.id).all()
 ]);
 return json({dreams:dreams.results,goals:goals.results});
}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request)||{},id=newId();
 if(b.action==="dream"){
  const title=clean(b.title,180),cost=b.estimated_cost===""||b.estimated_cost==null?null:Number(b.estimated_cost);
  if(!title||title.length>180||cost!==null&&(!Number.isFinite(cost)||cost<0||cost>100000000000)||!dateOk(b.desired_date))return json({error:"Проверь название, стоимость и желаемую дату"},400);
  await env.DB.prepare("INSERT INTO dreams (id,user_id,title,description,reason,image_url,reference_url,estimated_cost,desired_date,category,priority) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id,user.id,title,clean(b.description,3000),clean(b.reason,1000),clean(b.image_url,1000),clean(b.reference_url,1000),cost,b.desired_date||null,categories.has(b.category)?b.category:"other",priorities.has(b.priority)?b.priority:"medium").run();
  return json({ok:true,id},201);
 }
 if(b.action==="goal"){
  const title=clean(b.title,180),target=Number(b.target_amount),saved=Number(b.saved_amount||0),monthly=Number(b.monthly_contribution||0);
  if(!title||!Number.isFinite(target)||target<=0||target>100000000000||!Number.isFinite(saved)||saved<0||saved>target||!Number.isFinite(monthly)||monthly<0||!dateOk(b.target_date))return json({error:"Проверь название, сумму, накопления, взнос и срок"},400);
  let fundingBucketId=null;
  if(b.funding_bucket_id){
   const bucketRows=await env.DB.prepare("SELECT id,active FROM income_buckets WHERE id=? AND user_id=?").bind(String(b.funding_bucket_id),user.id).all();
   try{fundingBucketId=validateGoalFundingBucket(b.funding_bucket_id,bucketRows.results);}catch(error){return json({error:error.message},400);}
  }
  const dreamId=b.dream_id?String(b.dream_id):null;
  if(dreamId){const d=await env.DB.prepare("SELECT id,status FROM dreams WHERE id=? AND user_id=?").bind(dreamId,user.id).first();if(!d)return json({error:"Мечта не найдена"},404);if(d.status==="converted")return json({error:"Для этой мечты цель уже создана"},409);}
  await env.DB.prepare("INSERT INTO financial_goals (id,user_id,dream_id,title,description,target_amount,saved_amount,monthly_contribution,target_date,priority,funding_bucket_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id,user.id,dreamId,title,clean(b.description,3000),target,saved,monthly,b.target_date||null,priorities.has(b.priority)?b.priority:"medium",fundingBucketId).run();
  if(dreamId)await env.DB.prepare("UPDATE dreams SET status='converted',updated_at=datetime('now') WHERE id=? AND user_id=?").bind(dreamId,user.id).run();
  return json({ok:true,id},201);
 }
 return json({error:"Неизвестное действие"},400);
}
export async function onRequestPatch({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request)||{},id=String(b.id||"");
 if(b.type==="dream"){
  if(!statuses.has(b.status))return json({error:"Неизвестный статус"},400);
  const r=await env.DB.prepare("UPDATE dreams SET status=?,updated_at=datetime('now') WHERE id=? AND user_id=? AND status!='converted'").bind(b.status,id,user.id).run();
  if(!r.meta.changes)return json({error:"Мечта не найдена или уже превращена в цель"},404);
 }else if(b.type==="goal"){
  if(Object.prototype.hasOwnProperty.call(b,"funding_bucket_id")){
   let bucketId=null;
   if(b.funding_bucket_id){
    const rows=await env.DB.prepare("SELECT id,active FROM income_buckets WHERE id=? AND user_id=?").bind(String(b.funding_bucket_id),user.id).all();
    try{bucketId=validateGoalFundingBucket(b.funding_bucket_id,rows.results);}catch(error){return json({error:error.message},400);}
   }
   const r=await env.DB.prepare("UPDATE financial_goals SET funding_bucket_id=?,updated_at=datetime('now') WHERE id=? AND user_id=?").bind(bucketId,id,user.id).run();
   if(!r.meta.changes)return json({error:"Цель не найдена"},404);
  }else{
   if(!["active","paused","completed","archived"].includes(b.status))return json({error:"Неизвестный статус цели"},400);
   const r=await env.DB.prepare("UPDATE financial_goals SET status=?,updated_at=datetime('now') WHERE id=? AND user_id=?").bind(b.status,id,user.id).run();
   if(!r.meta.changes)return json({error:"Цель не найдена"},404);
  } }else return json({error:"Неизвестный тип записи"},400);
 return json({ok:true});
}
export async function onRequestDelete({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request)||{},id=String(b.id||"");
 const table=b.type==="dream"?"dreams":b.type==="goal"?"financial_goals":null;
 if(!table)return json({error:"Неизвестный тип записи"},400);
 const r=await env.DB.prepare("DELETE FROM "+table+" WHERE id=? AND user_id=?").bind(id,user.id).run();
 if(!r.meta.changes)return json({error:"Запись не найдена"},404);
 return json({ok:true});
}
