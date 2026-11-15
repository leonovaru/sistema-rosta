import { json, requireUser, readJson, newId } from "../../_lib/auth.js";
import { nextIrregularDate } from "../../_lib/finance.js";
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function validDate(v){if(!DATE.test(v))return false;const d=new Date(v+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
const clean=(v,n)=>String(v||"").trim().slice(0,n);
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const rows=await env.DB.prepare("SELECT * FROM irregular_expenses WHERE user_id=? ORDER BY active DESC,next_date,title").bind(user.id).all();
 const payments=await env.DB.prepare("SELECT irregular_expense_id,amount,paid_on FROM irregular_expense_payments WHERE user_id=? ORDER BY paid_on DESC LIMIT 50").bind(user.id).all();
 return json({items:rows.results,payments:payments.results});
}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request)||{},action=String(b.action||"");
 if(action==="paid"){
  const expenseId=clean(b.id,100),paidOn=String(b.paid_on||"");
  if(!expenseId||!validDate(paidOn))return json({error:"Укажи корректную дату оплаты"},400);
  const item=await env.DB.prepare("SELECT * FROM irregular_expenses WHERE id=? AND user_id=? AND active=1").bind(expenseId,user.id).first();
  if(!item)return json({error:"Активный нерегулярный расход не найден"},404);
  if(await env.DB.prepare("SELECT id FROM irregular_expense_payments WHERE irregular_expense_id=? AND paid_on=? LIMIT 1").bind(expenseId,paidOn).first())return json({error:"Оплата за эту дату уже зарегистрирована"},409);
  const amount=Number(item.amount),paymentId=newId(),expenseEntryId=newId();
  let nextDate=null,active=0;
  if(item.frequency!=="once"){
   nextDate=nextIrregularDate(item.next_date,item.frequency,item.recurrence_day);
   let guard=0;
   while(nextDate&&nextDate<=paidOn&&guard++<40)nextDate=nextIrregularDate(nextDate,item.frequency,item.recurrence_day);
   if(!nextDate)return json({error:"Не удалось рассчитать следующую дату"},400);
   active=1;
  }
  await env.DB.batch([
   env.DB.prepare("INSERT INTO irregular_expense_payments (id,user_id,irregular_expense_id,amount,paid_on) VALUES (?,?,?,?,?)").bind(paymentId,user.id,expenseId,amount,paidOn),
   env.DB.prepare("INSERT INTO expenses (id,user_id,direction_id,category,title,amount,spent_on,note) VALUES (?,?,NULL,?,?,?,?,?)").bind(expenseEntryId,user.id,item.category,item.title,amount,paidOn,"Оплата нерегулярного расхода"),
   env.DB.prepare("UPDATE irregular_expenses SET next_date=COALESCE(?,next_date),active=?,updated_at=datetime('now') WHERE id=? AND user_id=?").bind(nextDate,active,expenseId,user.id)
  ]);
  return json({ok:true,payment_id:paymentId,expense_id:expenseEntryId,next_date:nextDate,active});
 }
 if(action==="delete"){
  const r=await env.DB.prepare("DELETE FROM irregular_expenses WHERE id=? AND user_id=?").bind(clean(b.id,100),user.id).run();
  if(!r.meta.changes)return json({error:"Расход не найден"},404);return json({ok:true});
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
