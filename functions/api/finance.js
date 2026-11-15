import { json, requireUser, readJson, newId } from "../_lib/auth.js";
import { addDays, addPeriod } from "../_lib/finance.js";
import { detectRecurringExpenses } from "../_lib/recurring-expense-detection.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value) {
  if(!DATE.test(value))return false;
  const date=new Date(value+"T12:00:00Z");
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function dateInZone(timeZone) {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return values.year+"-"+values.month+"-"+values.day;
}
function validAmount(value) {
  const amount=Number(value);
  return Number.isFinite(amount)&&amount>0&&amount<=100000000?amount:null;
}
export async function onRequestGet({request,env}) {
  const user=await requireUser(request,env);
  if(!user)return json({error:"Необходим вход"},401);
  const settings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
  const today=dateInZone(settings?.timezone||"Europe/Moscow"),monthStart=today.slice(0,7)+"-01",next30=addDays(today,30);
  const [income,expenses,debtPayments,obligationPayments,debtRows,expenseRows,obligations,paymentRows,patternRows]=await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM income_entries WHERE user_id=? AND received_on>=? AND received_on<=?").bind(user.id,monthStart,today).first(),
    env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE user_id=? AND spent_on>=? AND spent_on<=?").bind(user.id,monthStart,today).first(),
    env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM debt_payments WHERE user_id=? AND paid_on>=? AND paid_on<=?").bind(user.id,monthStart,today).first(),
    env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM obligation_payments WHERE user_id=? AND paid_on>=? AND paid_on<=?").bind(user.id,monthStart,today).first(),
    env.DB.prepare("SELECT * FROM debts WHERE user_id=? ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, balance DESC").bind(user.id).all(),
    env.DB.prepare("SELECT e.*,d.title AS direction_title FROM expenses e LEFT JOIN directions d ON d.id=e.direction_id AND d.user_id=e.user_id WHERE e.user_id=? ORDER BY e.spent_on DESC,e.created_at DESC LIMIT 100").bind(user.id).all(),
    env.DB.prepare("SELECT * FROM payment_obligations WHERE user_id=? AND active=1 ORDER BY due_date LIMIT 100").bind(user.id).all(),
    env.DB.prepare("SELECT p.*,d.title AS debt_title FROM debt_payments p JOIN debts d ON d.id=p.debt_id WHERE p.user_id=? ORDER BY p.paid_on DESC,p.created_at DESC LIMIT 30").bind(user.id).all()
    ,env.DB.prepare("SELECT title,category,amount,spent_on,note FROM expenses WHERE user_id=? AND spent_on>=? AND spent_on<=? ORDER BY spent_on").bind(user.id,addDays(today,-190),today).all()
  ]);
  const recurringSuggestions=detectRecurringExpenses(patternRows.results,{today,existingTitles:obligations.results.map(x=>x.title)});
  const debtBalance=debtRows.results.filter(x=>x.status==="open").reduce((sum,x)=>sum+Number(x.balance),0);
  const upcoming=obligations.results.filter(x=>x.due_date<=next30);
  const upcomingTotal=upcoming.reduce((sum,x)=>sum+Number(x.amount),0);
  const incomeTotal=Number(income?.total||0),expenseTotal=Number(expenses?.total||0),debtPaid=Number(debtPayments?.total||0),obligationPaid=Number(obligationPayments?.total||0);
  return json({today,month_start:monthStart,summary:{income:incomeTotal,expenses:expenseTotal,debt_payments:debtPaid,obligation_payments:obligationPaid,net:incomeTotal-expenseTotal-debtPaid-obligationPaid,debt_balance:debtBalance,upcoming_obligations:upcomingTotal},debts:debtRows.results,expenses:expenseRows.results,obligations:obligations.results,upcoming_obligations:upcoming,debt_payments:paymentRows.results,recurring_expense_suggestions:recurringSuggestions});
}
export async function onRequestPost({request,env}) {
  const user=await requireUser(request,env);
  if(!user)return json({error:"Необходим вход"},401);
  const body=await readJson(request),action=String(body?.action||""),id=newId();
  if(action==="expense"){
    const amount=validAmount(body.amount),title=String(body.title||"").trim(),date=String(body.spent_on||"");
    if(!amount||!title||title.length>180||!validDate(date))return json({error:"Проверь название, сумму и дату расхода"},400);
    const directionId=body.direction_id?String(body.direction_id):null;
    if(directionId&&!await env.DB.prepare("SELECT id FROM directions WHERE id=? AND user_id=?").bind(directionId,user.id).first())return json({error:"Направление дохода не найдено"},404);
    await env.DB.prepare("INSERT INTO expenses (id,user_id,direction_id,category,title,amount,spent_on,note) VALUES (?,?,?,?,?,?,?,?)").bind(id,user.id,directionId,String(body.category||"Прочее").trim().slice(0,80)||"Прочее",title,amount,date,String(body.note||"").slice(0,500)).run();
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
    const debtId=String(body.debt_id||""),amount=validAmount(body.amount),date=String(body.paid_on||"");
    if(!debtId||!amount||!validDate(date))return json({error:"Проверь долг, сумму и дату платежа"},400);
    const debt=await env.DB.prepare("SELECT id,balance FROM debts WHERE id=? AND user_id=? AND status='open'").bind(debtId,user.id).first();
    if(!debt)return json({error:"Открытый долг не найден"},404);
    if(amount>Number(debt.balance))return json({error:"Платёж не может превышать остаток долга"},400);
    const next=Math.max(0,Number(debt.balance)-amount);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO debt_payments (id,user_id,debt_id,amount,paid_on,note) VALUES (?,?,?,?,?,?)").bind(id,user.id,debtId,amount,date,String(body.note||"").slice(0,500)),
      env.DB.prepare("UPDATE debts SET balance=?,status=?,updated_at=datetime('now') WHERE id=? AND user_id=?").bind(next,next===0?"closed":"open",debtId,user.id)
    ]);
    return json({ok:true,id,balance:next},201);
  }
  if(action==="obligation_paid"){
    const obligationId=String(body.obligation_id||""),date=String(body.paid_on||"");
    if(!obligationId||!validDate(date))return json({error:"Проверь обязательство и дату оплаты"},400);
    const obligation=await env.DB.prepare("SELECT * FROM payment_obligations WHERE id=? AND user_id=? AND active=1").bind(obligationId,user.id).first();
    if(!obligation)return json({error:"Активный платёж не найден"},404);
    const nextDue=addPeriod(obligation.due_date,obligation.frequency,obligation.recurrence_day);
    const statements=[env.DB.prepare("INSERT INTO obligation_payments (id,user_id,obligation_id,amount,paid_on) VALUES (?,?,?,?,?)").bind(id,user.id,obligationId,obligation.amount,date)];
    if(nextDue)statements.push(env.DB.prepare("UPDATE payment_obligations SET due_date=? WHERE id=? AND user_id=?").bind(nextDue,obligationId,user.id));
    else statements.push(env.DB.prepare("UPDATE payment_obligations SET active=0 WHERE id=? AND user_id=?").bind(obligationId,user.id));
    await env.DB.batch(statements);
    return json({ok:true,next_due_date:nextDue});
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
  const table=type==="expense"?"expenses":"payment_obligations";
  const result=await env.DB.prepare("DELETE FROM "+table+" WHERE id=? AND user_id=?").bind(id,user.id).run();
  if(!result.meta.changes)return json({error:"Запись не найдена"},404);
  return json({ok:true});
}
