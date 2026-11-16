import { json,requireUser,readJson } from "../../_lib/auth.js";
import { buildGoalFeasibility } from "../../_lib/goal-feasibility.js";
import { buildVariableExpenseForecast } from "../../_lib/variable-expense-forecast.js";
import { buildBudgetAdjustedExpenseForecast } from "../../_lib/budget-adjusted-expenses.js";
function shift(v,n){const d=new Date(v+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function shiftMonth(v,n){const [y,m]=v.slice(0,7).split("-").map(Number);return new Date(Date.UTC(y,m-1+n,1,12)).toISOString().slice(0,10);}
function todayInZone(zone){const p=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),o=Object.fromEntries(p.map(x=>[x.type,x.value]));return o.year+"-"+o.month+"-"+o.day;}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const body=await readJson(request)||{},goalId=String(body.goal_id||"");
 const goal=await env.DB.prepare("SELECT * FROM financial_goals WHERE id=? AND user_id=? AND status IN ('active','paused')").bind(goalId,user.id).first();
 if(!goal)return json({error:"Активная финансовая цель не найдена"},404);
 const settings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first(),today=todayInZone(settings?.timezone||"Europe/Moscow"),from=shift(today,-89);
 const [income,expenses,debtPayments,obligationPayments,activeGoals,expenseHistory,budgets,reserves,goalTransfers]=await Promise.all([
  env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM income_entries WHERE user_id=? AND received_on>=? AND received_on<=?").bind(user.id,from,today).first(),
  env.DB.prepare("SELECT COALESCE((SELECT SUM(amount) FROM expenses WHERE user_id=? AND spent_on>=? AND spent_on<=?),0)-COALESCE((SELECT SUM(amount) FROM irregular_expense_payment_reversals WHERE user_id=? AND reversed_on>=? AND reversed_on<=?),0) total").bind(user.id,from,today,user.id,from,today).first(),
  env.DB.prepare("SELECT COALESCE((SELECT SUM(amount) FROM debt_payments WHERE user_id=? AND paid_on>=? AND paid_on<=?),0)-COALESCE((SELECT SUM(r.amount) FROM debt_payment_reversals r JOIN debt_payments p ON p.id=r.debt_payment_id WHERE r.user_id=? AND r.reversed_on>=? AND r.reversed_on<=?),0) total").bind(user.id,from,today,user.id,from,today).first(),
  env.DB.prepare("SELECT COALESCE((SELECT SUM(amount) FROM obligation_payments WHERE user_id=? AND paid_on>=? AND paid_on<=?),0)-COALESCE((SELECT SUM(r.amount) FROM obligation_payment_reversals r JOIN obligation_payments p ON p.id=r.obligation_payment_id WHERE r.user_id=? AND r.reversed_on>=? AND r.reversed_on<=?),0) total").bind(user.id,from,today,user.id,from,today).first(),
  env.DB.prepare("SELECT COALESCE(SUM(monthly_contribution),0) total FROM financial_goals WHERE user_id=? AND status='active' AND id!=?").bind(user.id,goal.id).first(),
  env.DB.prepare("SELECT category,substr(event_date,1,7) AS month,SUM(amount) AS total FROM (SELECT category,amount,spent_on AS event_date FROM expenses WHERE user_id=? AND spent_on>=? AND spent_on<? UNION ALL SELECT e.category,-r.amount,r.reversed_on FROM irregular_expense_payment_reversals r JOIN expenses e ON e.id=r.expense_id AND e.user_id=r.user_id WHERE r.user_id=? AND r.reversed_on>=? AND r.reversed_on<?) GROUP BY category,substr(event_date,1,7)").bind(user.id,shiftMonth(today.slice(0,7)+"-01",-3),today.slice(0,7)+"-01",user.id,shiftMonth(today.slice(0,7)+"-01",-3),today.slice(0,7)+"-01").all(),
  env.DB.prepare("SELECT category,planned_amount FROM category_budgets WHERE user_id=? AND month=?").bind(user.id,today.slice(0,7)).all(),
  env.DB.prepare("SELECT target_amount,current_amount,monthly_contribution FROM cash_reserves WHERE user_id=? AND active=1").bind(user.id).all(),
  env.DB.prepare("SELECT COALESCE(SUM(t.amount-COALESCE(r.amount,0)),0) total FROM bucket_funding_transfers t LEFT JOIN bucket_funding_transfer_reversals r ON r.transfer_id=t.id WHERE t.user_id=? AND t.target_type='goal' AND t.target_id=?").bind(user.id,goal.id).first()
 ]);
 const historicalForecast=buildVariableExpenseForecast(expenseHistory.results,{today});
 const adjustedExpenses=buildBudgetAdjustedExpenseForecast(historicalForecast.categories,budgets.results);
 const monthlyExpenseBasis=(adjustedExpenses.categories.length||budgets.results.length)?adjustedExpenses.monthly_total:Math.round(Number(expenses.total||0)*30.4375/90);
 const reserveContributions=reserves.results.reduce((sum,r)=>sum+Math.min(Number(r.monthly_contribution)||0,Math.max(0,Number(r.target_amount)-Number(r.current_amount))),0);
 const months=goal.target_date?Math.max(1,Math.ceil((Date.parse(goal.target_date+"T12:00:00Z")-Date.parse(today+"T12:00:00Z"))/(30.4375*86400000))):null;
 const effectiveSaved=Number(goal.saved_amount||0)+Number(goalTransfers.total||0);
 const calculation=buildGoalFeasibility({income:income.total,expenses:Math.round(monthlyExpenseBasis*90/30.4375),debtPayments:debtPayments.total,obligationPayments:obligationPayments.total,activeGoalContributions:Number(activeGoals.total||0)+reserveContributions,targetAmount:goal.target_amount,savedAmount:effectiveSaved,months,historyDays:90});
 return json({goal:{id:goal.id,title:goal.title,target_amount:Number(goal.target_amount),saved_amount:effectiveSaved,transferred_amount:Number(goalTransfers.total||0),target_date:goal.target_date},period:{from,to:today},expense_basis:{monthly_forecast:monthlyExpenseBasis,categories:adjustedExpenses.categories,budgeted_categories:adjustedExpenses.budgeted_categories,history_categories:adjustedExpenses.history_categories,reserve_contributions:reserveContributions},calculation,disclaimer:"Оценка основана на зарегистрированных операциях за последние 90 дней. Неучтённые расходы, сезонность и нерегулярные доходы могут изменить результат. Для осторожности доступный остаток умножается на 70%."});
}