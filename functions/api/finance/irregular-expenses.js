import { json, requireUser, readJson, newId } from "../../_lib/auth.js";
import { advanceIrregularExpenseAfterPayment, dateInZone } from "../../_lib/finance.js";
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function validDate(v){if(!DATE.test(v))return false;const d=new Date(v+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
const clean=(v,n)=>String(v||"").trim().slice(0,n);
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const rows=await env.DB.prepare("SELECT * FROM irregular_expenses WHERE user_id=? ORDER BY active DESC,next_date,title").bind(user.id).all();
 const payments=await env.DB.prepare("SELECT p.id,p.irregular_expense_id,p.amount,p.paid_on,p.scheduled_due_date,p.expense_id,x.title,r.id AS reversal_id,r.reversed_on,r.reason AS reversal_reason FROM irregular_expense_payments p LEFT JOIN irregular_expenses x ON x.id=p.irregular_expense_id AND x.user_id=p.user_id LEFT JOIN irregular_expense_payment_reversals r ON r.irregular_expense_payment_id=p.id AND r.user_id=p.user_id WHERE p.user_id=? ORDER BY p.paid_on DESC,p.created_at DESC LIMIT 50").bind(user.id).all();
 return json({items:rows.results,payments:payments.results});
}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request)||{},action=String(b.action||"");
 if(action==="paid"){
  const expenseId=clean(b.id,100),paidOn=String(b.paid_on||""),requestedDueDate=b.scheduled_due_date?String(b.scheduled_due_date):null;
  if(!expenseId||!validDate(paidOn)||(requestedDueDate&&!validDate(requestedDueDate)))return json({error:"Укажи корректную дату оплаты и период"},400);
  const dateSettings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
  if(paidOn>dateInZone(dateSettings?.timezone||"Europe/Moscow"))return json({error:"Нельзя отметить будущую дату как уже совершённый платёж"},400);
  const requestId=String(b.request_id||"");
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId))return json({error:"Не удалось подтвердить запрос оплаты"},400);
  const item=await env.DB.prepare("SELECT * FROM irregular_expenses WHERE id=? AND user_id=?").bind(expenseId,user.id).first();
  if(!item)return json({error:"Нерегулярный расход не найден"},404);
  const prior=await env.DB.prepare("SELECT id,irregular_expense_id,amount,paid_on,scheduled_due_date FROM irregular_expense_payments WHERE user_id=? AND request_id=?").bind(user.id,requestId).first();
  const dueDate=requestedDueDate||prior?.scheduled_due_date||item.next_date;
  if(prior){
   if(prior.irregular_expense_id!==expenseId||Math.abs(Number(prior.amount)-Number(item.amount))>0.0001||prior.paid_on!==paidOn||prior.scheduled_due_date!==dueDate)return json({error:"Идентификатор запроса уже использован"},409);
   return json({ok:true,payment_id:prior.id,replayed:true});
  }
  if(Number(item.active)!==1)return json({error:"Активный нерегулярный расход не найден"},404);
  const occurrence=await env.DB.prepare("SELECT status FROM irregular_expense_payment_occurrences WHERE irregular_expense_id=? AND scheduled_due_date=?").bind(expenseId,dueDate).first();
  if(occurrence?.status==="paid")return json({error:"Этот период уже оплачен"},409);
  const historical=dueDate<item.next_date;
  if(historical&&!occurrence)return json({error:"Период не найден в истории оплат"},409);
  const amount=Number(item.amount),paymentId=newId(),expenseEntryId=newId();
  const bucket=await env.DB.prepare("SELECT id,title FROM income_buckets WHERE user_id=? AND active=1 AND title=?").bind(user.id,String(item.category||"")).first();
  if(bucket){
   const [allocated,spent,debt,obligations,transfers]=await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM income_bucket_allocations WHERE user_id=? AND bucket_id=?").bind(user.id,bucket.id).first(),
    env.DB.prepare("SELECT COALESCE(SUM(e.amount-COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r WHERE r.expense_id=e.id AND r.user_id=e.user_id),0)),0) total FROM expenses e WHERE e.user_id=? AND e.bucket_id=?").bind(user.id,bucket.id).first(),
    env.DB.prepare("SELECT COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.user_id=? AND p.bucket_id=?),0)-COALESCE((SELECT SUM(r.amount) FROM debt_payment_reversals r JOIN debt_payments p ON p.id=r.debt_payment_id WHERE p.user_id=? AND p.bucket_id=?),0) total").bind(user.id,bucket.id,user.id,bucket.id).first(),
    env.DB.prepare("SELECT COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=? AND p.bucket_id=?),0)-COALESCE((SELECT SUM(r.amount) FROM obligation_payment_reversals r JOIN obligation_payments p ON p.id=r.obligation_payment_id WHERE p.user_id=? AND p.bucket_id=?),0) total").bind(user.id,bucket.id,user.id,bucket.id).first(),
    env.DB.prepare("SELECT COALESCE((SELECT SUM(t.amount) FROM bucket_funding_transfers t WHERE t.user_id=? AND t.source_bucket_id=?),0)-COALESCE((SELECT SUM(r.amount) FROM bucket_funding_transfer_reversals r JOIN bucket_funding_transfers t ON t.id=r.transfer_id WHERE t.user_id=? AND t.source_bucket_id=?),0) total").bind(user.id,bucket.id,user.id,bucket.id).first()
   ]);
   const available=Number(allocated.total||0)-Number(spent.total||0)-Number(debt.total||0)-Number(obligations.total||0)-Number(transfers.total||0);
   if(amount>available+0.0001)return json({error:"В корзине «"+bucket.title+"» недостаточно денег. Доступно: "+Math.max(0,available).toFixed(2)+" ₽"},409);
  }
  const advances=!historical&&dueDate===item.next_date;
  const nextSchedule=advances?advanceIrregularExpenseAfterPayment(item.next_date,item.frequency,item.recurrence_day):null;
  if(advances&&!nextSchedule)return json({error:"Не удалось рассчитать следующую дату"},400);
  const statements=[
   env.DB.prepare("INSERT INTO expenses (id,user_id,direction_id,category,title,amount,spent_on,note,bucket_id) VALUES (?,?,NULL,?,?,?,?,?,?)").bind(expenseEntryId,user.id,item.category,item.title,amount,paidOn,"Оплата нерегулярного расхода",bucket?.id||null),
   env.DB.prepare("INSERT INTO irregular_expense_payments (id,user_id,irregular_expense_id,amount,paid_on,expense_id,scheduled_due_date,request_id) VALUES (?,?,?,?,?,?,?,?)").bind(paymentId,user.id,expenseId,amount,paidOn,expenseEntryId,dueDate,requestId)
  ];
  if(advances)statements.push(env.DB.prepare("UPDATE irregular_expenses SET next_date=COALESCE(?,next_date),active=?,updated_at=datetime('now') WHERE id=? AND user_id=? AND next_date=?").bind(nextSchedule.next_date,nextSchedule.active,expenseId,user.id,item.next_date));
  try{await env.DB.batch(statements);}
  catch(error){
   const message=String(error?.message||error);
   if(message.includes("UNIQUE constraint failed: irregular_expense_payments.user_id, irregular_expense_payments.request_id")){
    const existing=await env.DB.prepare("SELECT id,irregular_expense_id,amount,paid_on,scheduled_due_date FROM irregular_expense_payments WHERE user_id=? AND request_id=?").bind(user.id,requestId).first();
    if(existing&&existing.irregular_expense_id===expenseId&&Math.abs(Number(existing.amount)-amount)<0.0001&&existing.paid_on===paidOn&&existing.scheduled_due_date===dueDate)return json({ok:true,payment_id:existing.id,replayed:true});
   }
   if(message.includes("Период нерегулярного расхода уже оплачен"))return json({error:"Этот период уже оплачен"},409);
   if(message.includes("Недостаточно средств в корзине")||message.includes("Средства уже переведены из корзины"))return json({error:"В выбранной корзине недостаточно свободных денег для оплаты."},409);
   throw error;
  }
  return json({ok:true,payment_id:paymentId,expense_id:expenseEntryId,next_date:advances?nextSchedule.next_date:item.next_date,active:advances?nextSchedule.active:item.active,scheduled_due_date:dueDate});
 }
 if(action==="reverse"){
  const paymentId=clean(b.payment_id,100),reversedOn=String(b.reversed_on||""),reason=String(b.reason||"").trim(),requestId=String(b.request_id||"");
  if(!paymentId||!validDate(reversedOn)||reason.length<3||reason.length>500||!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId))return json({error:"Укажи оплату, дату, причину (3–500 символов) и идентификатор запроса"},400);
  const dateSettings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
  if(reversedOn>dateInZone(dateSettings?.timezone||"Europe/Moscow"))return json({error:"Нельзя указать будущую дату корректировки"},400);
  const prior=await env.DB.prepare("SELECT id,irregular_expense_payment_id,reversed_on,reason FROM irregular_expense_payment_reversals WHERE user_id=? AND request_id=?").bind(user.id,requestId).first();
  if(prior){
   if(prior.irregular_expense_payment_id!==paymentId||prior.reversed_on!==reversedOn||prior.reason!==reason)return json({error:"Идентификатор запроса уже использован для другой корректировки"},409);
   return json({ok:true,id:prior.id,replayed:true});
  }
  const payment=await env.DB.prepare("SELECT p.id,p.amount,p.expense_id,p.scheduled_due_date,p.irregular_expense_id,x.frequency FROM irregular_expense_payments p JOIN irregular_expenses x ON x.id=p.irregular_expense_id AND x.user_id=p.user_id WHERE p.id=? AND p.user_id=?").bind(paymentId,user.id).first();
  if(!payment)return json({error:"Исходная оплата не найдена"},404);
  if(!payment.expense_id||!payment.scheduled_due_date)return json({error:"Эту старую оплату нельзя отменить автоматически: нет однозначной связи с расходом или периодом"},409);
  const existing=await env.DB.prepare("SELECT id FROM irregular_expense_payment_reversals WHERE irregular_expense_payment_id=? AND user_id=?").bind(paymentId,user.id).first();
  if(existing)return json({error:"Эта оплата уже отменена"},409);
  const statements=[env.DB.prepare("INSERT INTO irregular_expense_payment_reversals (id,user_id,irregular_expense_payment_id,expense_id,amount,reversed_on,reason,request_id) VALUES (?,?,?,?,?,?,?,?)").bind(id,user.id,paymentId,payment.expense_id,payment.amount,reversedOn,reason,requestId)];
  if(payment.frequency==="once")statements.push(env.DB.prepare("UPDATE irregular_expenses SET active=1,next_date=?,updated_at=datetime('now') WHERE id=? AND user_id=?").bind(payment.scheduled_due_date,payment.irregular_expense_id,user.id));
  try{await env.DB.batch(statements);}
  catch(error){
   const message=String(error?.message||error);
   if(message.includes("UNIQUE constraint failed: irregular_expense_payment_reversals.irregular_expense_payment_id"))return json({error:"Эта оплата уже отменена"},409);
   if(message.includes("UNIQUE constraint failed: irregular_expense_payment_reversals.user_id, irregular_expense_payment_reversals.request_id")){
    const existingRequest=await env.DB.prepare("SELECT id,irregular_expense_payment_id,reversed_on,reason FROM irregular_expense_payment_reversals WHERE user_id=? AND request_id=?").bind(user.id,requestId).first();
    if(existingRequest&&existingRequest.irregular_expense_payment_id===paymentId&&existingRequest.reversed_on===reversedOn&&existingRequest.reason===reason)return json({ok:true,id:existingRequest.id,replayed:true});
    return json({error:"Идентификатор запроса уже использован"},409);
   }
   throw error;
  }
  return json({ok:true,id,reopened_period:payment.scheduled_due_date,restored_one_time:payment.frequency==="once"});
 }
 if(action==="delete"){
  const id=clean(b.id,100);
  const item=await env.DB.prepare("SELECT id,active FROM irregular_expenses WHERE id=? AND user_id=?").bind(id,user.id).first();
  if(!item)return json({error:"Расход не найден"},404);
  const payments=await env.DB.prepare("SELECT COUNT(*) AS count FROM irregular_expense_payments WHERE irregular_expense_id=? AND user_id=?").bind(id,user.id).first();
  if(Number(payments?.count||0)>0){
   await env.DB.prepare("UPDATE irregular_expenses SET active=0,updated_at=datetime('now') WHERE id=? AND user_id=?").bind(id,user.id).run();
   return json({ok:true,archived:true,preserved_payments:true});
  }
  await env.DB.prepare("DELETE FROM irregular_expenses WHERE id=? AND user_id=?").bind(id,user.id).run();
  return json({ok:true});
 }
 const title=clean(b.title,180),category=clean(b.category,80)||"Нерегулярные расходы",amount=Number(b.amount),date=String(b.next_date||""),frequency=String(b.frequency||"once"),notes=clean(b.notes,500);
 if(!title||!Number.isFinite(amount)||amount<=0||amount>100000000||!validDate(date)||!["once","yearly","quarterly"].includes(frequency))return json({error:"Проверь название, сумму, дату и периодичность"},400);
 if(action==="update"){
  const r=await env.DB.prepare("UPDATE irregular_expenses SET title=?,category=?,amount=?,next_date=?,frequency=?,notes=?,active=?,recurrence_day=?,updated_at=datetime('now') WHERE id=? AND user_id=?").bind(title,category,amount,date,frequency,notes,b.active===false?0:1,Number(date.slice(8,10)),clean(b.id,100),user.id).run();
  if(!r.meta.changes)return json({error:"Расход не найден"},404);return json({ok:true});
 }
 const id=newId();
 await env.DB.prepare("INSERT INTO irregular_expenses (id,user_id,title,category,amount,next_date,frequency,notes,recurrence_day) VALUES (?,?,?,?,?,?,?,?,?)").bind(id,user.id,title,category,amount,date,frequency,notes,Number(date.slice(8,10))).run();
 return json({ok:true,id},201);
}
