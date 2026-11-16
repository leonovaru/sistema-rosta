import { json, requireUser, readJson, newId } from "../../_lib/auth.js";
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const clean=(v,n)=>String(v||"").trim().slice(0,n);
function validDate(v){if(!v)return true;if(!DATE.test(v))return false;const d=new Date(v+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const rows=await env.DB.prepare("SELECT * FROM cash_reserves WHERE user_id=? ORDER BY active DESC,target_date,title").bind(user.id).all();
 const transactions=await env.DB.prepare("SELECT * FROM cash_reserve_transactions WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all();
 return json({reserves:rows.results,transactions:transactions.results,summary:{target:rows.results.filter(x=>x.active).reduce((s,x)=>s+Number(x.target_amount),0),saved:rows.results.filter(x=>x.active).reduce((s,x)=>s+Number(x.current_amount),0),monthly:rows.results.filter(x=>x.active).reduce((s,x)=>s+Math.min(Number(x.monthly_contribution),Math.max(0,Number(x.target_amount)-Number(x.current_amount))),0)}});
}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request)||{},action=String(b.action||"");
 if(action==="contribution"||action==="withdrawal"){
  const id=clean(b.id,100),amount=Number(b.amount),note=clean(b.note,500),requestId=clean(b.request_id,100);
  if(!id||!Number.isFinite(amount)||amount<=0||amount>100000000||!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId))return json({error:"Проверь сумму операции и идентификатор запроса"},400);
  const transactionType=action==="contribution"?"contribution":"withdrawal";
  const prior=await env.DB.prepare("SELECT id,reserve_id,transaction_type,amount,note FROM cash_reserve_transactions WHERE user_id=? AND request_id=?").bind(user.id,requestId).first();
  if(prior){if(prior.reserve_id!==id||prior.transaction_type!==transactionType||Math.abs(Number(prior.amount)-amount)>0.0001||String(prior.note||"")!==note)return json({error:"Идентификатор уже использован для другой операции"},409);return json({ok:true,transaction_id:prior.id,idempotent:true});}
  const reserve=await env.DB.prepare("SELECT id,current_amount,target_amount FROM cash_reserves WHERE id=? AND user_id=? AND active=1").bind(id,user.id).first();
  if(!reserve)return json({error:"Активный резерв не найден"},404);
  const current=Number(reserve.current_amount||0),delta=action==="contribution"?amount:-amount,next=Math.round((current+delta)*100)/100;
  if(next<0)return json({error:"Сумма снятия превышает накопленный остаток"},400);
  if(next>Number(reserve.target_amount))return json({error:"Пополнение превысит целевую сумму резерва"},400);
  const transactionId=newId();
  const payloadMatches=row=>row&&row.reserve_id===id&&row.transaction_type===transactionType&&Math.abs(Number(row.amount)-amount)<0.0001&&String(row.note||"")===note;
  try{
   await env.DB.batch([
    env.DB.prepare("UPDATE cash_reserves SET current_amount=?,updated_at=datetime('now') WHERE id=? AND user_id=? AND current_amount=? AND active=1").bind(next,id,user.id,current),
    env.DB.prepare("INSERT INTO cash_reserve_transactions(id,user_id,reserve_id,transaction_type,amount,balance_after,note,request_id) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1").bind(transactionId,user.id,id,transactionType,amount,next,note,requestId)
   ]);
  }catch(error){
   const replay=await env.DB.prepare("SELECT id,reserve_id,transaction_type,amount,note FROM cash_reserve_transactions WHERE user_id=? AND request_id=?").bind(user.id,requestId).first();
   if(payloadMatches(replay))return json({ok:true,transaction_id:replay.id,idempotent:true});
   if(/UNIQUE constraint failed/.test(String(error?.message||error)))return json({error:"Идентификатор уже использован для другой операции"},409);
   throw error;
  }
  const saved=await env.DB.prepare("SELECT id,reserve_id,transaction_type,amount,note FROM cash_reserve_transactions WHERE id=? AND user_id=?").bind(transactionId,user.id).first();
  if(!saved){
   const replay=await env.DB.prepare("SELECT id,reserve_id,transaction_type,amount,note FROM cash_reserve_transactions WHERE user_id=? AND request_id=?").bind(user.id,requestId).first();
   if(payloadMatches(replay))return json({ok:true,transaction_id:replay.id,idempotent:true});
   return json({error:"Остаток резерва изменился. Обнови данные и повтори операцию."},409);
  }
  return json({ok:true,transaction_id:transactionId,current_amount:next});
 }
 if(action==="delete"){
  const id=clean(b.id,100);
  const reserve=await env.DB.prepare("SELECT id FROM cash_reserves WHERE id=? AND user_id=?").bind(id,user.id).first();
  if(!reserve)return json({error:"Резерв не найден"},404);
  const history=await env.DB.prepare("SELECT COUNT(*) AS count FROM cash_reserve_transactions WHERE reserve_id=? AND user_id=?").bind(id,user.id).first();
  if(Number(history?.count||0)>0){
   await env.DB.prepare("UPDATE cash_reserves SET active=0,updated_at=datetime('now') WHERE id=? AND user_id=?").bind(id,user.id).run();
   return json({ok:true,archived:true,preserved_history:true});
  }
  await env.DB.prepare("DELETE FROM cash_reserves WHERE id=? AND user_id=?").bind(id,user.id).run();
  return json({ok:true});
 }
 const title=clean(b.title,160),purpose=clean(b.purpose,500),target=Number(b.target_amount),current=Number(b.current_amount||0),monthly=Number(b.monthly_contribution||0),date=b.target_date?String(b.target_date):null;
 if(!title||!Number.isFinite(target)||target<=0||target>1000000000||!Number.isFinite(current)||current<0||current>target||!Number.isFinite(monthly)||monthly<0||monthly>target||!validDate(date))return json({error:"Проверь название, целевую сумму, накоплено, ежемесячный взнос и дату"},400);
 if(action==="update"){
  const id=clean(b.id,100),r=await env.DB.prepare("UPDATE cash_reserves SET title=?,purpose=?,target_amount=?,monthly_contribution=?,target_date=?,active=?,updated_at=datetime('now') WHERE id=? AND user_id=? AND current_amount<=?").bind(title,purpose,target,monthly,date,b.active===false?0:1,id,user.id,target).run();
  if(!r.meta.changes)return json({error:"Резерв не найден"},404);return json({ok:true,id});
 }
 const id=newId();
 await env.DB.prepare("INSERT INTO cash_reserves (id,user_id,title,purpose,target_amount,current_amount,monthly_contribution,target_date) VALUES (?,?,?,?,?,?,?,?)").bind(id,user.id,title,purpose,target,current,monthly,date).run();
 return json({ok:true,id},201);
}
