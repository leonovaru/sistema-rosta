import { json, requireUser, readJson, newId } from "../../_lib/auth.js";
import { addDays } from "../../_lib/finance.js";
import { buildCashflowForecast } from "../../_lib/cashflow-forecast.js";
import { buildVariableExpenseForecast } from "../../_lib/variable-expense-forecast.js";
import { buildMonthlyVariableExpenseSchedule } from "../../_lib/monthly-variable-expense-schedule.js";
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function validDate(v){if(!DATE.test(v))return false;const d=new Date(v+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
function shiftMonth(date,delta){const [y,m]=date.slice(0,7).split("-").map(Number),d=new Date(Date.UTC(y,m-1+delta,1,12));return d.toISOString().slice(0,10);}
function todayInZone(zone){const p=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),o=Object.fromEntries(p.map(x=>[x.type,x.value]));return o.year+"-"+o.month+"-"+o.day;}
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const settings=await env.DB.prepare("SELECT timezone,starting_balance FROM settings WHERE user_id=?").bind(user.id).first(),today=todayInZone(settings?.timezone||"Europe/Moscow"),url=new URL(request.url),horizon=Number(url.searchParams.get("days")||90);
 if(![30,90].includes(horizon))return json({error:"Период прогноза должен быть 30 или 90 дней"},400);
 const end=addDays(today,horizon),monthStart=today.slice(0,7)+"-01";
 const [expenseHistory,budgets]=await Promise.all([
  env.DB.prepare("SELECT category,substr(spent_on,1,7) AS month,SUM(amount) AS total FROM expenses WHERE user_id=? AND spent_on>=? AND spent_on<? GROUP BY category,substr(spent_on,1,7)").bind(user.id,shiftMonth(monthStart,-3),monthStart).all(),
  env.DB.prepare("SELECT month,category,planned_amount FROM category_budgets WHERE user_id=? AND month>=? AND month<=?").bind(user.id,today.slice(0,7),addDays(end,0).slice(0,7)).all()
 ]);
 const variableExpenseForecast=buildVariableExpenseForecast(expenseHistory.results,{today});
 const variableExpensesByMonth=buildMonthlyVariableExpenseSchedule({historicalCategories:variableExpenseForecast.categories,budgets:budgets.results,today,horizonDays:horizon});
 const [planned,obligations,debts]=await Promise.all([
  env.DB.prepare("SELECT p.*,d.title direction_title FROM planned_cashflows p LEFT JOIN directions d ON d.id=p.direction_id AND d.user_id=p.user_id WHERE p.user_id=? AND p.status='planned' AND p.expected_date>=? AND p.expected_date<=? ORDER BY p.expected_date").bind(user.id,today,end).all(),
  env.DB.prepare("SELECT * FROM payment_obligations WHERE user_id=? AND active=1 AND due_date<=? ORDER BY due_date").bind(user.id,end).all(),
  env.DB.prepare("SELECT title,balance,minimum_payment,due_day,status FROM debts WHERE user_id=? AND status='open'").bind(user.id).all()
 ]);
 const forecast=buildCashflowForecast({today,horizonDays:horizon,startingBalance:settings?.starting_balance||0,planned:planned.results,obligations:obligations.results,debts:debts.results,variableExpensesByMonth});
 return json({...forecast,planned:planned.results,starting_balance:Number(settings?.starting_balance||0),variable_expense_forecast:variableExpenseForecast,variable_expenses_by_month:variableExpensesByMonth});
}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const body=await readJson(request),action=String(body?.action||"");
 if(action==="starting_balance"){
  const amount=Number(body.amount);if(!Number.isFinite(amount)||amount<0||amount>1000000000)return json({error:"Укажи корректный остаток"},400);
  await env.DB.prepare("UPDATE settings SET starting_balance=? WHERE user_id=?").bind(amount,user.id).run();return json({ok:true,starting_balance:amount});
 }
 const title=String(body?.title||"").trim(),amount=Number(body?.amount),date=String(body?.expected_date||""),type=String(body?.flow_type||"");
 if(!title||title.length>180||!Number.isFinite(amount)||amount<=0||amount>100000000||!validDate(date)||!["income","expense"].includes(type))return json({error:"Проверь название, сумму, дату и тип записи"},400);
 const settings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
 if(date<todayInZone(settings?.timezone||"Europe/Moscow"))return json({error:"Нельзя планировать запись на прошедшую дату"},400);
 const directionId=body.direction_id?String(body.direction_id):null;
 if(directionId&&!await env.DB.prepare("SELECT id FROM directions WHERE id=? AND user_id=?").bind(directionId,user.id).first())return json({error:"Направление не найдено"},404);
 const id=newId();
 await env.DB.prepare("INSERT INTO planned_cashflows (id,user_id,direction_id,flow_type,title,amount,expected_date,note) VALUES (?,?,?,?,?,?,?,?)").bind(id,user.id,directionId,type,title,amount,date,String(body.note||"").slice(0,500)).run();
 return json({ok:true,id},201);
}
export async function onRequestDelete({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const body=await readJson(request),id=String(body?.id||"");if(!id)return json({error:"Не указана запись"},400);
 const result=await env.DB.prepare("DELETE FROM planned_cashflows WHERE id=? AND user_id=?").bind(id,user.id).run();
 if(!result.meta.changes)return json({error:"Плановая запись не найдена"},404);
 return json({ok:true});
}
