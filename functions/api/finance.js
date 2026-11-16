import { json, requireUser, readJson, newId } from "../_lib/auth.js";
import { addDays, addPeriod, dateInZone } from "../_lib/finance.js";
import { detectRecurringExpenses } from "../_lib/recurring-expense-detection.js";
import { buildFinancialAttributionSnapshot } from "../_lib/financial-attribution.js";
import { isClientSelectable, isProjectSelectable } from "../_lib/workspace-entity-availability.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value) {
  if(!DATE.test(value))return false;
  const date=new Date(value+"T12:00:00Z");
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
async function commitBucketSpend(write) {
  try { await write(); return true; }
  catch (error) {
    const message=String(error?.message || error);
    if (message.includes("Недостаточно средств в корзине")) return "bucket";
    if (message.includes("Период обязательства уже оплачен")) return "occurrence";
    if (message.includes("Платёж превышает текущий остаток долга или долг уже закрыт")) return "debt";
    if (message.includes("UNIQUE constraint failed: debt_payments.user_id, debt_payments.request_id")) return "duplicate_debt";
    if (message.includes("UNIQUE constraint failed: obligation_payments.user_id, obligation_payments.request_id")) return "duplicate_obligation";
    throw error;
  }
}
function validAmount(value) {
  const amount=Number(value);
  return Number.isFinite(amount)&&amount>0&&amount<=100000000?amount:null;
}
async function resolveBucket(env,userId,preferredTitle){
  return await env.DB.prepare("SELECT id,title FROM income_buckets WHERE user_id=? AND active=1 AND title=?").bind(userId,preferredTitle).first()
    || await env.DB.prepare("SELECT id,title FROM income_buckets WHERE user_id=? AND active=1 AND title='Долги и обязательства'").bind(userId).first();
}
async function bucketAvailable(env,userId,bucketId){
  const [allocated,expenses,debt,obligations]=await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM income_bucket_allocations WHERE user_id=? AND bucket_id=?").bind(userId,bucketId).first(),
    env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE user_id=? AND bucket_id=?").bind(userId,bucketId).first(),
    env.DB.prepare("SELECT COALESCE(SUM(p.amount),0)-COALESCE((SELECT SUM(r.amount) FROM debt_payment_reversals r JOIN debt_payments rp ON rp.id=r.debt_payment_id WHERE rp.user_id=p.user_id AND rp.bucket_id=p.bucket_id),0) total FROM debt_payments p WHERE p.user_id=? AND p.bucket_id=?").bind(userId,bucketId).first(),
    env.DB.prepare("SELECT COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=? AND p.bucket_id=?),0)-COALESCE((SELECT SUM(r.amount) FROM obligation_payment_reversals r JOIN obligation_payments p ON p.id=r.obligation_payment_id WHERE p.user_id=? AND p.bucket_id=?),0) total").bind(userId,bucketId,userId,bucketId).first()
  ]);
  return Number(allocated.total||0)-Number(expenses.total||0)-Number(debt.total||0)-Number(obligations.total||0);
}
export async function onRequestGet({request,env}) {
  const user=await requireUser(request,env);
  if(!user)return json({error:"Необходим вход"},401);
  const settings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
  const today=dateInZone(settings?.timezone||"Europe/Moscow"),monthStart=today.slice(0,7)+"-01",next30=addDays(today,30);
  const [income,expenses,debtPayments,obligationPayments,debtRows,expenseRows,obligations,paymentRows,obligationPaymentRows,patternRows]=await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM income_entries WHERE user_id=? AND received_on>=? AND received_on<=?").bind(user.id,monthStart,today).first(),
    env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE user_id=? AND spent_on>=? AND spent_on<=?").bind(user.id,monthStart,today).first(),
    env.DB.prepare("SELECT COALESCE((SELECT SUM(amount) FROM debt_payments WHERE user_id=? AND paid_on>=? AND paid_on<=?),0)-COALESCE((SELECT SUM(amount) FROM debt_payment_reversals WHERE user_id=? AND reversed_on>=? AND reversed_on<=?),0) total").bind(user.id,monthStart,today,user.id,monthStart,today).first(),
    env.DB.prepare("SELECT COALESCE((SELECT SUM(amount) FROM obligation_payments WHERE user_id=? AND paid_on>=? AND paid_on<=?),0)-COALESCE((SELECT SUM(amount) FROM obligation_payment_reversals WHERE user_id=? AND reversed_on>=? AND reversed_on<=?),0) total").bind(user.id,monthStart,today,user.id,monthStart,today).first(),
    env.DB.prepare("SELECT * FROM debts WHERE user_id=? ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, balance DESC").bind(user.id).all(),
    env.DB.prepare("SELECT e.*,COALESCE(e.direction_title_snapshot,d.title) AS direction_title,b.title AS bucket_title FROM expenses e LEFT JOIN directions d ON d.id=COALESCE(e.direction_id_snapshot,e.direction_id) AND d.user_id=e.user_id LEFT JOIN income_buckets b ON b.id=e.bucket_id AND b.user_id=e.user_id WHERE e.user_id=? ORDER BY e.spent_on DESC,e.created_at DESC LIMIT 100").bind(user.id).all(),
    env.DB.prepare("SELECT * FROM payment_obligations WHERE user_id=? AND active=1 ORDER BY due_date LIMIT 100").bind(user.id).all(),
    env.DB.prepare("SELECT p.*,d.title AS debt_title,r.id AS reversal_id,r.reversed_on,r.reason AS reversal_reason FROM debt_payments p JOIN debts d ON d.id=p.debt_id LEFT JOIN debt_payment_reversals r ON r.debt_payment_id=p.id AND r.user_id=p.user_id WHERE p.user_id=? ORDER BY p.paid_on DESC,p.created_at DESC LIMIT 50").bind(user.id).all(),
    env.DB.prepare("SELECT p.*,o.title AS obligation_title,r.id AS reversal_id,r.reversed_on,r.reason AS reversal_reason FROM obligation_payments p JOIN payment_obligations o ON o.id=p.obligation_id LEFT JOIN obligation_payment_reversals r ON r.obligation_payment_id=p.id AND r.user_id=p.user_id WHERE p.user_id=? ORDER BY p.paid_on DESC,p.created_at DESC LIMIT 50").bind(user.id).all()
    ,env.DB.prepare("SELECT title,category,amount,spent_on,note FROM expenses WHERE user_id=? AND spent_on>=? AND spent_on<=? ORDER BY spent_on").bind(user.id,addDays(today,-190),today).all()
  ]);
  const recurringSuggestions=detectRecurringExpenses(patternRows.results,{today,existingTitles:obligations.results.map(x=>({title:x.title,category:x.category}))});
  const debtBalance=debtRows.results.filter(x=>x.status==="open").reduce((sum,x)=>sum+Number(x.balance),0);
  const upcoming=obligations.results.filter(x=>x.due_date<=next30);
  const upcomingTotal=upcoming.reduce((sum,x)=>sum+Number(x.amount),0);
  const incomeTotal=Number(income?.total||0),expenseTotal=Number(expenses?.total||0),debtPaid=Number(debtPayments?.total||0),obligationPaid=Number(obligationPayments?.total||0);
  return json({today,month_start:monthStart,summary:{income:incomeTotal,expenses:expenseTotal,debt_payments:debtPaid,obligation_payments:obligationPaid,net:incomeTotal-expenseTotal-debtPaid-obligationPaid,debt_balance:debtBalance,upcoming_obligations:upcomingTotal},debts:debtRows.results,expenses:expenseRows.results,obligations:obligations.results,upcoming_obligations:upcoming,debt_payments:paymentRows.results,obligation_payments:obligationPaymentRows.results,recurring_expense_suggestions:recurringSuggestions});
}
export async function onRequestPost({request,env}) {
  const user=await requireUser(request,env);
  if(!user)return json({error:"Необходим вход"},401);
  const body=await readJson(request),action=String(body?.action||""),id=newId();
  if(action==="expense"){
    const amount=validAmount(body.amount),title=String(body.title||"").trim(),date=String(body.spent_on||"");
    if(!amount||!title||title.length>180||!validDate(date))return json({error:"Проверь название, сумму и дату расхода"},400);
    const directionId=body.direction_id?String(body.direction_id):null;
    const clientId=body.client_id?String(body.client_id):null,projectId=body.project_id?String(body.project_id):null;
    const client=clientId?await env.DB.prepare("SELECT id,name,direction_id,status FROM clients WHERE id=? AND user_id=?").bind(clientId,user.id).first():null;
    if(clientId&&!client)return json({error:"Клиент не найден"},404);
    if(clientId&&!isClientSelectable(client))return json({error:"Нельзя привязать расход к закрытому клиенту"},409);
    const project=projectId?await env.DB.prepare("SELECT id,client_id,direction_id,title,status FROM projects WHERE id=? AND user_id=?").bind(projectId,user.id).first():null;
    if(projectId&&!project)return json({error:"Проект не найден"},404);
    if(projectId&&!isProjectSelectable(project))return json({error:"Нельзя привязать расход к архивному проекту"},409);
    if(project?.client_id&&!clientId){const linkedClient=await env.DB.prepare("SELECT status FROM clients WHERE id=? AND user_id=?").bind(project.client_id,user.id).first();if(!isClientSelectable(linkedClient))return json({error:"Нельзя привязать расход к проекту закрытого клиента"},409);}
    if(project&&clientId&&project.client_id!==clientId)return json({error:"Проект не относится к выбранному клиенту"},400);
    if(project&&!clientId&&project.client_id)return json({error:"Выбери клиента, связанного с проектом"},400);
    if(project&&directionId&&project.direction_id&&directionId!==project.direction_id)return json({error:"Направление должно соответствовать выбранному проекту"},400);
    if(!project&&client?.direction_id&&directionId&&directionId!==client.direction_id)return json({error:"Направление должно соответствовать выбранному клиенту"},400);
    const effectiveDirectionId=directionId||project?.direction_id||client?.direction_id||null;
    const direction=effectiveDirectionId?await env.DB.prepare("SELECT id,title FROM directions WHERE id=? AND user_id=?").bind(effectiveDirectionId,user.id).first():null;
    if(effectiveDirectionId&&!direction)return json({error:"Направление не найдено"},404);
    const snapshot=buildFinancialAttributionSnapshot({direction,client,project});
    const bucketId=body.bucket_id?String(body.bucket_id):null;
    if(bucketId){
      const bucket=await env.DB.prepare("SELECT id,title FROM income_buckets WHERE id=? AND user_id=? AND active=1").bind(bucketId,user.id).first();
      if(!bucket)return json({error:"Корзина не найдена"},404);
      const available=await bucketAvailable(env,user.id,bucketId);
      if(amount>available+0.0001)return json({error:"В корзине «"+bucket.title+"» недостаточно денег. Доступно: "+Math.max(0,available).toFixed(2)+" ₽"},409);
    }
    const saved=await commitBucketSpend(()=>env.DB.prepare("INSERT INTO expenses (id,user_id,direction_id,category,title,amount,spent_on,note,bucket_id,client_id,project_id,direction_id_snapshot,direction_title_snapshot,client_id_snapshot,client_name_snapshot,project_id_snapshot,project_title_snapshot) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,user.id,effectiveDirectionId,String(body.category||"Прочее").trim().slice(0,80)||"Прочее",title,amount,date,String(body.note||"").slice(0,500),bucketId,clientId,projectId,snapshot.direction_id_snapshot,snapshot.direction_title_snapshot,snapshot.client_id_snapshot,snapshot.client_name_snapshot,snapshot.project_id_snapshot,snapshot.project_title_snapshot).run());
    if(!saved)return json({error:"Остаток корзины изменился. Обнови баланс и повтори операцию."},409);
    return json({ok:true,id},201);
  }
  if(action==="debt"){
    const amount=validAmount(body.initial_amount),title=String(body.title||"").trim(),dueDay=body.due_day===""||body.due_day==null?null:Number(body.due_day);
    const rate=Number(body.interest_rate||0),minimum=Number(body.minimum_payment||0);
    if(!amount||!title||title.length>180||!Number.isFinite(rate)||rate<0||rate>1000||!Number.isFinite(minimum)||minimum<0||minimum>amount||(dueDay!==null&&(!Number.isInteger(dueDay)||dueDay<1||dueDay>31)))return json({error:"Проверь название, сумму, ставку и параметры долга"},400);
    await env.DB.prepare("INSERT INTO debts (id,user_id,title,creditor,initial_amount,balance,interest_rate,minimum_payment,due_day,notes) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id,user.id,title,String(body.creditor||"").slice(0,160),amount,amount,rate,minimum,dueDay,String(body.notes||"").slice(0,1000)).run();
    return json({ok:true,id},201);
  }
  if(action==="debt_payment"){
    const debtId=String(body.debt_id||""),amount=validAmount(body.amount),date=String(body.paid_on||""),requestId=String(body.request_id||"");
    if(!debtId||!amount||!validDate(date)||!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId))return json({error:"Проверь долг, сумму, дату и идентификатор запроса"},400);
    const dateSettings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
    if(date>dateInZone(dateSettings?.timezone||"Europe/Moscow"))return json({error:"Нельзя отметить будущую дату как уже совершённый платёж"},400);
    const prior=await env.DB.prepare("SELECT id,debt_id,amount FROM debt_payments WHERE user_id=? AND request_id=?").bind(user.id,requestId).first();
    if(prior){
      if(prior.debt_id!==debtId||Math.abs(Number(prior.amount)-amount)>0.0001)return json({error:"Идентификатор запроса уже использован для другого платежа"},409);
      const current=await env.DB.prepare("SELECT balance FROM debts WHERE id=? AND user_id=?").bind(debtId,user.id).first();
      return json({ok:true,id:prior.id,balance:Number(current?.balance||0),replayed:true},200);
    }
    const debt=await env.DB.prepare("SELECT id,balance FROM debts WHERE id=? AND user_id=? AND status='open'").bind(debtId,user.id).first();
    if(!debt)return json({error:"Открытый долг не найден"},404);
    if(amount>Number(debt.balance))return json({error:"Платёж не может превышать остаток долга"},400);
    const bucket=await resolveBucket(env,user.id,"Долги и обязательства");
    if(!bucket)return json({error:"Не найдена корзина для долгов и обязательств"},409);
    const available=await bucketAvailable(env,user.id,bucket.id);
    if(amount>available+0.0001)return json({error:"В корзине «"+bucket.title+"» недостаточно денег. Доступно: "+Math.max(0,available).toFixed(2)+" ₽"},409);
    const saved=await commitBucketSpend(()=>env.DB.prepare("INSERT INTO debt_payments (id,user_id,debt_id,amount,paid_on,note,bucket_id,request_id) VALUES (?,?,?,?,?,?,?,?)").bind(id,user.id,debtId,amount,date,String(body.note||"").slice(0,500),bucket.id,requestId).run());
    if(saved==="bucket")return json({error:"Остаток корзины изменился. Обнови баланс и повтори операцию."},409);
    if(saved==="debt")return json({error:"Остаток долга изменился. Обнови данные и повтори операцию."},409);
    if(saved==="duplicate_debt"){
      const existing=await env.DB.prepare("SELECT id,debt_id,amount FROM debt_payments WHERE user_id=? AND request_id=?").bind(user.id,requestId).first();
      if(!existing||existing.debt_id!==debtId||Math.abs(Number(existing.amount)-amount)>0.0001)return json({error:"Идентификатор запроса уже использован"},409);
      const current=await env.DB.prepare("SELECT balance FROM debts WHERE id=? AND user_id=?").bind(debtId,user.id).first();
      return json({ok:true,id:existing.id,balance:Number(current?.balance||0),replayed:true},200);
    }
    const updatedDebt=await env.DB.prepare("SELECT balance FROM debts WHERE id=? AND user_id=?").bind(debtId,user.id).first();
    return json({ok:true,id,balance:Number(updatedDebt?.balance||0)},201);
  }
  if(action==="debt_payment_reverse"){
    const paymentId=String(body.debt_payment_id||""),date=String(body.reversed_on||""),reason=String(body.reason||"").trim(),requestId=String(body.request_id||"");
    if(!paymentId||!validDate(date)||reason.length<3||reason.length>500||!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId))return json({error:"Укажи платёж, дату, причину (3–500 символов) и идентификатор запроса"},400);
    const dateSettings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
    if(date>dateInZone(dateSettings?.timezone||"Europe/Moscow"))return json({error:"Нельзя указать будущую дату корректировки"},400);
    const prior=await env.DB.prepare("SELECT id,debt_payment_id,reversed_on,reason FROM debt_payment_reversals WHERE user_id=? AND request_id=?").bind(user.id,requestId).first();
    if(prior){
      if(prior.debt_payment_id!==paymentId||prior.reversed_on!==date||prior.reason!==reason)return json({error:"Идентификатор запроса уже использован для другой корректировки"},409);
      return json({ok:true,id:prior.id,replayed:true});
    }
    const payment=await env.DB.prepare("SELECT p.id,p.debt_id,p.amount FROM debt_payments p WHERE p.id=? AND p.user_id=?").bind(paymentId,user.id).first();
    if(!payment)return json({error:"Исходный платёж не найден"},404);
    const existing=await env.DB.prepare("SELECT id FROM debt_payment_reversals WHERE debt_payment_id=? AND user_id=?").bind(paymentId,user.id).first();
    if(existing)return json({error:"Этот платёж уже отменён. Повторная корректировка невозможна."},409);
    try{
      await env.DB.prepare("INSERT INTO debt_payment_reversals (id,user_id,debt_payment_id,amount,reversed_on,reason,request_id) VALUES (?,?,?,?,?,?,?)").bind(id,user.id,paymentId,payment.amount,date,reason,requestId).run();
    }catch(error){
      const message=String(error?.message||error);
      if(message.includes("UNIQUE constraint failed: debt_payment_reversals.debt_payment_id"))return json({error:"Этот платёж уже отменён. Обнови историю платежей."},409);
      if(message.includes("UNIQUE constraint failed: debt_payment_reversals.user_id, debt_payment_reversals.request_id")){
        const existingRequest=await env.DB.prepare("SELECT id,debt_payment_id,reversed_on,reason FROM debt_payment_reversals WHERE user_id=? AND request_id=?").bind(user.id,requestId).first();
        if(existingRequest&&existingRequest.debt_payment_id===paymentId&&existingRequest.reversed_on===date&&existingRequest.reason===reason)return json({ok:true,id:existingRequest.id,replayed:true});
        return json({error:"Идентификатор запроса уже использован"},409);
      }
      throw error;
    }
    const current=await env.DB.prepare("SELECT balance FROM debts WHERE id=? AND user_id=?").bind(payment.debt_id,user.id).first();
    return json({ok:true,id,balance:Number(current?.balance||0)},201);
  }
  if(action==="obligation_payment_reverse"){
    const paymentId=String(body.obligation_payment_id||""),date=String(body.reversed_on||""),reason=String(body.reason||"").trim(),requestId=String(body.request_id||"");
    if(!paymentId||!validDate(date)||reason.length<3||reason.length>500||!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId))return json({error:"Укажи платёж, дату, причину (3–500 символов) и идентификатор запроса"},400);
    const dateSettings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
    if(date>dateInZone(dateSettings?.timezone||"Europe/Moscow"))return json({error:"Нельзя указать будущую дату корректировки"},400);
    const prior=await env.DB.prepare("SELECT id,obligation_payment_id,reversed_on,reason FROM obligation_payment_reversals WHERE user_id=? AND request_id=?").bind(user.id,requestId).first();
    if(prior){if(prior.obligation_payment_id!==paymentId||prior.reversed_on!==date||prior.reason!==reason)return json({error:"Идентификатор запроса уже использован"},409);return json({ok:true,id:prior.id,replayed:true});}
    const payment=await env.DB.prepare("SELECT p.id,p.obligation_id,p.amount,p.scheduled_due_date FROM obligation_payments p WHERE p.id=? AND p.user_id=?").bind(paymentId,user.id).first();
    if(!payment)return json({error:"Исходный платёж не найден"},404);
    if(!payment.scheduled_due_date)return json({error:"У этой старой оплаты не сохранён период. Нужна ручная проверка."},409);
    const existing=await env.DB.prepare("SELECT id FROM obligation_payment_reversals WHERE obligation_payment_id=? AND user_id=?").bind(paymentId,user.id).first();
    if(existing)return json({error:"Этот период уже отменён"},409);
    const sourceObligation=await env.DB.prepare("SELECT frequency FROM payment_obligations WHERE id=? AND user_id=?").bind(payment.obligation_id,user.id).first();
    const reverseStatements=[env.DB.prepare("INSERT INTO obligation_payment_reversals(id,user_id,obligation_payment_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?)").bind(id,user.id,paymentId,payment.amount,date,reason,requestId)];
    if(sourceObligation?.frequency==="once")reverseStatements.push(env.DB.prepare("UPDATE payment_obligations SET active=1,due_date=? WHERE id=? AND user_id=?").bind(payment.scheduled_due_date,payment.obligation_id,user.id));
    try{await env.DB.batch(reverseStatements);}
    catch(error){
      const message=String(error?.message||error);
      if(message.includes("UNIQUE constraint failed: obligation_payment_reversals.obligation_payment_id"))return json({error:"Этот платёж уже отменён. Обнови историю."},409);
      if(message.includes("UNIQUE constraint failed: obligation_payment_reversals.user_id, obligation_payment_reversals.request_id")){
        const row=await env.DB.prepare("SELECT id,obligation_payment_id,reversed_on,reason FROM obligation_payment_reversals WHERE user_id=? AND request_id=?").bind(user.id,requestId).first();
        if(row&&row.obligation_payment_id===paymentId&&row.reversed_on===date&&row.reason===reason)return json({ok:true,id:row.id,replayed:true});
        return json({error:"Идентификатор запроса уже использован"},409);
      }
      throw error;
    }
    return json({ok:true,id,scheduled_due_date:payment.scheduled_due_date});
  }
  if(action==="obligation_paid"){
    const obligationId=String(body.obligation_id||""),date=String(body.paid_on||""),requestId=String(body.request_id||""),requestedPeriod=body.scheduled_due_date==null?"":String(body.scheduled_due_date);
    if(!obligationId||!validDate(date)||!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)||(requestedPeriod&&!validDate(requestedPeriod)))return json({error:"Проверь обязательство, дату, период и идентификатор запроса"},400);
    const dateSettings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
    if(date>dateInZone(dateSettings?.timezone||"Europe/Moscow"))return json({error:"Нельзя отметить будущую дату как уже совершённый платёж"},400);
    const prior=await env.DB.prepare("SELECT id,obligation_id,scheduled_due_date FROM obligation_payments WHERE user_id=? AND request_id=?").bind(user.id,requestId).first();
    if(prior){if(prior.obligation_id!==obligationId||(requestedPeriod&&prior.scheduled_due_date!==requestedPeriod))return json({error:"Идентификатор запроса уже использован"},409);return json({ok:true,replayed:true});}
    const obligation=await env.DB.prepare("SELECT * FROM payment_obligations WHERE id=? AND user_id=? AND active=1").bind(obligationId,user.id).first();
    if(!obligation)return json({error:"Активный платёж не найден"},404);
    const scheduledDate=requestedPeriod||obligation.due_date;
    if(scheduledDate!==obligation.due_date){
      const occurrence=await env.DB.prepare("SELECT status FROM obligation_payment_occurrences WHERE obligation_id=? AND user_id=? AND scheduled_due_date=?").bind(obligationId,user.id,scheduledDate).first();
      if(occurrence?.status!=="unpaid")return json({error:"Повторно оплатить можно только отменённый период"},409);
    }
    const bucket=await resolveBucket(env,user.id,String(obligation.category||"Долги и обязательства"));
    if(!bucket)return json({error:"Не найдена корзина для платежа"},409);
    const available=await bucketAvailable(env,user.id,bucket.id);
    if(Number(obligation.amount)>available+0.0001)return json({error:"В корзине «"+bucket.title+"» недостаточно денег. Доступно: "+Math.max(0,available).toFixed(2)+" ₽"},409);
    const isCurrent=scheduledDate===obligation.due_date,nextDue=isCurrent?addPeriod(scheduledDate,obligation.frequency,obligation.recurrence_day):obligation.due_date;
    const statements=[env.DB.prepare("INSERT INTO obligation_payments(id,user_id,obligation_id,amount,paid_on,bucket_id,scheduled_due_date,request_id) VALUES(?,?,?,?,?,?,?,?)").bind(id,user.id,obligationId,obligation.amount,date,bucket.id,scheduledDate,requestId)];
    if(isCurrent){if(nextDue)statements.push(env.DB.prepare("UPDATE payment_obligations SET due_date=? WHERE id=? AND user_id=?").bind(nextDue,obligationId,user.id));else statements.push(env.DB.prepare("UPDATE payment_obligations SET active=0 WHERE id=? AND user_id=?").bind(obligationId,user.id));}
    const saved=await commitBucketSpend(()=>env.DB.batch(statements));
    if(saved==="bucket")return json({error:"Остаток корзины изменился. Обнови баланс и повтори операцию."},409);
    if(saved==="occurrence")return json({error:"Этот период обязательства уже оплачен. Обнови список платежей."},409);
    if(saved==="duplicate_obligation"){
      const existing=await env.DB.prepare("SELECT obligation_id,scheduled_due_date FROM obligation_payments WHERE user_id=? AND request_id=?").bind(user.id,requestId).first();
      if(!existing||existing.obligation_id!==obligationId||existing.scheduled_due_date!==scheduledDate)return json({error:"Идентификатор запроса уже использован"},409);
      return json({ok:true,replayed:true});
    }
    return json({ok:true,next_due_date:nextDue,scheduled_due_date:scheduledDate});
  }
  if(action==="obligation"){
    const amount=validAmount(body.amount),title=String(body.title||"").trim(),date=String(body.due_date||""),frequency=String(body.frequency||"once"),recurrenceDay=body.recurrence_day==null||body.recurrence_day===""?(frequency==="monthly"?Number(date.slice(8,10)):null):Number(body.recurrence_day);
    if(!amount||!title||title.length>180||!validDate(date)||!["once","monthly","weekly"].includes(frequency)||(frequency==="monthly"&&(!Number.isInteger(recurrenceDay)||recurrenceDay<1||recurrenceDay>31)))return json({error:"Проверь название, сумму, дату и периодичность платежа"},400);
    await env.DB.prepare("INSERT INTO payment_obligations (id,user_id,title,amount,due_date,frequency,recurrence_day,category,notes) VALUES (?,?,?,?,?,?,?,?,?)").bind(id,user.id,title,amount,date,frequency,frequency==="monthly"?recurrenceDay:null,String(body.category||"Обязательный платёж").slice(0,80),String(body.notes||"").slice(0,500)).run();
    return json({ok:true,id},201);
  }
  return json({error:"Неизвестный тип финансовой операции"},400);
}
export async function onRequestDelete({request,env}) {
  const user=await requireUser(request,env);
  if(!user)return json({error:"Необходим вход"},401);
  const body=await readJson(request),id=String(body?.id||""),type=String(body?.type||"");
  if(!id||!["expense","obligation"].includes(type))return json({error:"Операцию нельзя удалить или неверный тип"},400);
  if(type==="obligation"){
    const obligation=await env.DB.prepare("SELECT id,active FROM payment_obligations WHERE id=? AND user_id=?").bind(id,user.id).first();
    if(!obligation)return json({error:"Запись не найдена"},404);
    const payments=await env.DB.prepare("SELECT COUNT(*) AS count FROM obligation_payments WHERE obligation_id=? AND user_id=?").bind(id,user.id).first();
    if(Number(payments?.count||0)>0){
      await env.DB.prepare("UPDATE payment_obligations SET active=0 WHERE id=? AND user_id=?").bind(id,user.id).run();
      return json({ok:true,archived:true,preserved_payments:true});
    }
  }
  const table=type==="expense"?"expenses":"payment_obligations";
  const result=await env.DB.prepare("DELETE FROM "+table+" WHERE id=? AND user_id=?").bind(id,user.id).run();
  if(!result.meta.changes)return json({error:"Запись не найдена"},404);
  return json({ok:true});
}
