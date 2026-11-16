import { json, requireUser, readJson, newId } from "../../_lib/auth.js";
import { advanceIrregularExpenseAfterPayment } from "../../_lib/finance.js";
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
  if(await env.DB.prepare("SELECT id FROM irregular_expense_payments WHERE irregular_expense_id=? AND scheduled_due_date=? LIMIT 1").bind(expenseId,item.next_date).first())return json({error:"Этот период уже оплачен"},409);
  const amount=Number(item.amount),paymentId=newId(),expenseEntryId=newId();
  const bucket=await env.DB.prepare("SELECT id,title FROM income_buckets WHERE user_id=? AND active=1 AND title=?").bind(user.id,String(item.category||"")).first();
  if(bucket){
   const [allocated,spent,debt,obligations]=await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM income_bucket_allocations WHERE user_id=? AND bucket_id=?").bind(user.id,bucket.id).first(),
    env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE user_id=? AND bucket_id=?").bind(user.id,bucket.id).first(),
    env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM debt_payments WHERE user_id=? AND bucket_id=?").bind(user.id,bucket.id).first(),
    env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM obligation_payments WHERE user_id=? AND bucket_id=?").bind(user.id,bucket.id).first()
   ]);
   const available=Number(allocated.total||0)-Number(spent.total||0)-Number(debt.total||0)-Number(obligations.total||0);
   if(amount>available+0.0001)return json({error:"В корзине «"+bucket.title+"» недостаточно денег. Доступно: "+Math.max(0,available).toFixed(2)+" ₽"},409);
  }
  const nextSchedule=advanceIrregularExpenseAfterPayment(item.next_date,item.frequency,item.recurrence_day);
  if(!nextSchedule)return json({error:"Не удалось рассчитать следующую дату"},400);
  const {next_date:nextDate,active}=nextSchedule;
  try{
   await env.DB.batch([
   env.DB.prepare("INSERT INTO expenses (id,user_id,direction_id,category,title,amount,spent_on,note,bucket_id) VALUES (?,?,NULL,?,?,?,?,?,?)").bind(expenseEntryId,user.id,item.category,item.title,amount,paidOn,"Оплата нерегулярного расхода",bucket?.id||null),
   env.DB.prepare("INSERT INTO irregular_expense_payments (id,user_id,irregular_expense_id,amount,paid_on,expense_id,scheduled_due_date) VALUES (?,?,?,?,?,?,?)").bind(paymentId,user.id,expenseId,amount,paidOn,expenseEntryId,item.next_date),
   env.DB.prepare("UPDATE irregular_expenses SET next_date=COALESCE(?,next_date),active=?,updated_at=datetime('now') WHERE id=? AND user_id=? AND next_date=?").bind(nextDate,active,expenseId,user.id,item.next_date)
   ]);
  }catch(error){
   const message=String(error?.message||error);
   if(message.includes("irregular_expense_payments.irregular_expense_id, irregular_expense_payments.scheduled_due_date")||message.includes("Этот период уже оплачен"))return json({error:"Этот период уже оплачен"},409);
   throw error;
  }
  return json({ok:true,payment_id:paymentId,expense_id:expenseEntryId,next_date:nextDate,active});
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
