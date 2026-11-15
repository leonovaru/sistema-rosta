import { json,requireUser,readJson } from "../../_lib/auth.js";
import { buildGoalFeasibility } from "../../_lib/goal-feasibility.js";
import { buildVariableExpenseForecast } from "../../_lib/variable-expense-forecast.js";
import { buildBudgetAdjustedExpenseForecast } from "../../_lib/budget-adjusted-expenses.js";
function shift(v,n){const d=new Date(v+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function todayInZone(zone){const p=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),o=Object.fromEntries(p.map(x=>[x.type,x.value]));return o.year+"-"+o.month+"-"+o.day;}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const body=await readJson(request)||{},goalId=String(body.goal_id||"");
 const goal=await env.DB.prepare("SELECT * FROM financial_goals WHERE id=? AND user_id=? AND status IN ('active','paused')").bind(goalId,user.id).first();
 if(!goal)return json({error:"Активная финансовая цель не найдена"},404);
 const settings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first(),today=todayInZone(settings?.timezone||"Europe/Moscow"),from=shift(today,-89);
 const [income,expenses,debtPayments,obligationPayments,activeGoals]=await Promise.all([
  env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM income_entries WHERE user_id=? AND received_on>=? AND received_on<=?").bind(user.id,from,today).first(),
  env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE user_id=? AND spent_on>=? AND spent_on<=?").bind(user.id,from,today).first(),
  env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM debt_payments WHERE user_id=? AND paid_on>=? AND paid_on<=?").bind(user.id,from,today).first(),
  env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM obligation_payments WHERE user_id=? AND paid_on>=? AND paid_on<=?").bind(user.id,from,today).first(),
  env.DB.prepare("SELECT COALESCE(SUM(monthly_contribution),0) total FROM financial_goals WHERE user_id=? AND status='active' AND id!=?").bind(user.id,goal.id).first(),
  env.DB.prepare("SELECT category,substr(spent_on,1,7) AS month,SUM(amount) AS total FROM expenses WHERE user_id=? AND spent_on>=? AND spent_on<? GROUP BY category,substr(spent_on,1,7)").bind(user.id,shift(today.slice(0,7)+"-01",-90),today.slice(0,7)+"-01").all(),
  env.DB.prepare("SELECT category,planned_amount FROM category_budgets WHERE user_id=? AND month=?").bind(user.id,today.slice(0,7)).all()
 ]);
 const historicalForecast=buildVariableExpenseForecast(expenseHistory.results,{today});
 const adjustedExpenses=buildBudgetAdjustedExpenseForecast(historicalForecast.categories,budgets.results);
 const monthlyExpenseBasis=adjustedExpenses.monthly_total;
 const months=goal.target_date?Math.max(1,Math.ceil((Date.parse(goal.target_date+"T12:00:00Z")-Date.parse(today+"T12:00:00Z"))/(30.4375*86400000))):null;
 const calculation=buildGoalFeasibility({income:income.total,expenses:Math.round(monthlyExpenseBasis*90/30.4375),debtPayments:debtPayments.total,obligationPayments:obligationPayments.total,activeGoalContributions:activeGoals.total,targetAmount:goal.target_amount,savedAmount:goal.saved_amount,months,historyDays:90});
 return json({goal:{id:goal.id,title:goal.title,target_amount:Number(goal.target_amount),saved_amount:Number(goal.saved_amount),target_date:goal.target_date},period:{from,to:today},expense_basis:{monthly_forecast:monthlyExpenseBasis,categories:adjustedExpenses.categories,budgeted_categories:adjustedExpenses.budgeted_categories,history_categories:adjustedExpenses.history_categories},calculation,disclaimer:"Оценка основана на зарегистрированных операциях за последние 90 дней. Неучтённые расходы, сезонность и нерегулярные доходы могут изменить результат. Для осторожности доступный остаток умножается на 70%."});
}