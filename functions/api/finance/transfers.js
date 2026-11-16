import { json, requireUser, readJson, newId } from "../../_lib/auth.js";
const DATE=/^\\d{4}-\\d{2}-\\d{2}$/;
const clean=(v,n)=>String(v||"").trim().slice(0,n);
const validDate=v=>DATE.test(v)&&!Number.isNaN(Date.parse(v+"T12:00:00Z"))&&new Date(v+"T12:00:00Z").toISOString().slice(0,10)===v;
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const rows=await env.DB.prepare(`SELECT t.*,b.title source_bucket_title,CASE WHEN t.target_type='goal' THEN g.title ELSE r.title END target_title,CASE WHEN x.id IS NULL THEN 0 ELSE 1 END reversed FROM bucket_funding_transfers t JOIN income_buckets b ON b.id=t.source_bucket_id AND b.user_id=t.user_id LEFT JOIN financial_goals g ON t.target_type='goal' AND g.id=t.target_id AND g.user_id=t.user_id LEFT JOIN cash_reserves r ON t.target_type='reserve' AND r.id=t.target_id AND r.user_id=t.user_id LEFT JOIN bucket_funding_transfer_reversals x ON x.transfer_id=t.id AND x.user_id=t.user_id WHERE t.user_id=? ORDER BY t.created_at DESC`).bind(user.id).all();
 return json({transfers:rows.results});
}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request)||{},action=String(b.action||"");
 if(action==="create"){
  const source=clean(b.source_bucket_id,100),type=String(b.target_type||""),target=clean(b.target_id,100),amount=Math.round(Number(b.amount)*100)/100,date=String(b.transferred_on||new Date().toISOString().slice(0,10)),note=clean(b.note,500),rid=clean(b.request_id,100);
  if(!source||!target||!["goal","reserve"].includes(type)||!Number.isFinite(amount)||amount<=0||amount>100000000||!validDate(date)||rid.length<12)return json({error:"Проверь корзину, получателя, сумму, дату и идентификатор операции"},400);
  const prior=await env.DB.prepare("SELECT id,source_bucket_id,target_type,target_id,amount,transferred_on FROM bucket_funding_transfers WHERE user_id=? AND request_id=?").bind(user.id,rid).first();
  if(prior){if(prior.source_bucket_id!==source||prior.target_type!==type||prior.target_id!==target||Math.abs(Number(prior.amount)-amount)>0.0001||prior.transferred_on!==date)return json({error:"Идентификатор уже использован для другой операции"},409);return json({ok:true,id:prior.id,idempotent:true});}
  if(!await env.DB.prepare("SELECT id FROM income_buckets WHERE id=? AND user_id=? AND active=1").bind(source,user.id).first())return json({error:"Активная корзина не найдена"},404);
  const id=newId();try{await env.DB.prepare("INSERT INTO bucket_funding_transfers(id,user_id,source_bucket_id,target_type,target_id,amount,transferred_on,note,request_id) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,user.id,source,type,target,amount,date,note,rid).run();}
  catch(e){const msg=String(e?.message||e);if(/Недостаточно средств|Цель или резерв/.test(msg))return json({error:msg},409);if(/UNIQUE constraint failed/.test(msg))return json({error:"Операция с таким идентификатором уже существует"},409);throw e;}
  return json({ok:true,id},201);
 }
 if(action==="reverse"){
  const tid=clean(b.transfer_id,100),date=String(b.reversed_on||new Date().toISOString().slice(0,10)),reason=clean(b.reason,500),rid=clean(b.request_id,100);
  if(!tid||!validDate(date)||reason.length<3||rid.length<12)return json({error:"Укажи перевод, дату, причину и идентификатор отмены"},400);
  const prior=await env.DB.prepare("SELECT id,transfer_id FROM bucket_funding_transfer_reversals WHERE user_id=? AND request_id=?").bind(user.id,rid).first();
  if(prior){if(prior.transfer_id!==tid)return json({error:"Идентификатор уже использован для другой отмены"},409);return json({ok:true,id:prior.id,idempotent:true});}
  const t=await env.DB.prepare("SELECT id,amount,target_type,target_id FROM bucket_funding_transfers WHERE id=? AND user_id=?").bind(tid,user.id).first();if(!t)return json({error:"Перевод не найден"},404);
  if(t.target_type==="reserve"){const reserve=await env.DB.prepare("SELECT current_amount FROM cash_reserves WHERE id=? AND user_id=?").bind(t.target_id,user.id).first();if(!reserve||Number(reserve.current_amount)+0.0001<Number(t.amount))return json({error:"В резерве уже использована часть перевода. Восстанови остаток перед полной отменой."},409);}
  const id=newId();try{await env.DB.prepare("INSERT INTO bucket_funding_transfer_reversals(id,user_id,transfer_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?)").bind(id,user.id,tid,t.amount,date,reason,rid).run();}
  catch(e){if(/UNIQUE constraint failed/.test(String(e?.message||e)))return json({error:"Этот перевод уже отменён"},409);if(/В резерве уже использована часть перевода/.test(String(e?.message||e)))return json({error:"В резерве уже использована часть перевода. Восстанови остаток перед полной отменой."},409);throw e;}
  return json({ok:true,id});
 }
 return json({error:"Неизвестное действие"},400);
}
