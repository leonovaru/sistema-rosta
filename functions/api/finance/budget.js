import { json, requireUser, readJson, newId } from "../../_lib/auth.js";
import { buildBudgetInsights } from "../../_lib/budget-insights.js";
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
export async function onRequestGet({request,env}) {
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const url=new URL(request.url),month=url.searchParams.get("month")||new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Moscow",year:"numeric",month:"2-digit"}).format(new Date());
 if(!MONTH.test(month))return json({error:"Некорректный месяц"},400);
 const historyMonths=Array.from({length:3},(_,i)=>{const [y,m]=month.split("-").map(Number),d=new Date(Date.UTC(y,m-1-3+i,1,12));return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0");});
 const historyStart=historyMonths[0]+"-01",historyEnd=month+"-01";
 const [plans,facts,history,budgetHistory]=await Promise.all([
  env.DB.prepare("SELECT category,planned_amount FROM category_budgets WHERE user_id=? AND month=? ORDER BY category").bind(user.id,month).all(),
  env.DB.prepare("SELECT category,SUM(amount) actual FROM (SELECT category,amount,spent_on AS event_date FROM expenses WHERE user_id=? UNION ALL SELECT e.category,-r.amount,r.reversed_on FROM irregular_expense_payment_reversals r JOIN expenses e ON e.id=r.expense_id AND e.user_id=r.user_id WHERE r.user_id=?) WHERE substr(event_date,1,7)=? GROUP BY category").bind(user.id,user.id,month).all(),
  env.DB.prepare("SELECT category,substr(event_date,1,7) month,SUM(amount) actual FROM (SELECT category,amount,spent_on AS event_date FROM expenses WHERE user_id=? UNION ALL SELECT e.category,-r.amount,r.reversed_on FROM irregular_expense_payment_reversals r JOIN expenses e ON e.id=r.expense_id AND e.user_id=r.user_id WHERE r.user_id=?) WHERE event_date>=? AND event_date<? GROUP BY category,substr(event_date,1,7)").bind(user.id,user.id,historyStart,historyEnd).all(),
  env.DB.prepare("SELECT category,month,planned_amount FROM category_budgets WHERE user_id=? AND month>=? AND month<?").bind(user.id,historyMonths[0],month).all()
 ]);
 const actual=new Map(facts.results.map(x=>[x.category,Number(x.actual)||0]));
 const categories=new Set([...plans.results.map(x=>x.category),...facts.results.map(x=>x.category)]);
 const rows=[...categories].sort((a,b)=>a.localeCompare(b,"ru")).map(category=>{
  const plan=plans.results.find(x=>x.category===category),planned=plan?Number(plan.planned_amount):null,spent=actual.get(category)||0;
  return {category,planned,actual:spent,remaining:planned===null?null:planned-spent,percent:planned>0?Math.round(spent/planned*100):null};
 });
 const insights=buildBudgetInsights(history.results,budgetHistory.results,{month,historyMonths:3});
 return json({month,categories:rows,insights,summary:{planned:rows.reduce((s,x)=>s+(x.planned||0),0),actual:rows.reduce((s,x)=>s+x.actual,0),over_budget:rows.reduce((s,x)=>s+(x.remaining!==null&&x.remaining<0?-x.remaining:0),0)}});
}
export async function onRequestPost({request,env}) {
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const body=await readJson(request),month=String(body?.month||""),category=String(body?.category||"").trim(),amount=Number(body?.planned_amount);
 if(!MONTH.test(month)||!category||category.length>80||!Number.isFinite(amount)||amount<0||amount>100000000)return json({error:"Проверь месяц, категорию и сумму бюджета"},400);
 await env.DB.prepare("INSERT INTO category_budgets (id,user_id,month,category,planned_amount) VALUES (?,?,?,?,?) ON CONFLICT(user_id,month,category) DO UPDATE SET planned_amount=excluded.planned_amount,updated_at=datetime('now')").bind(newId(),user.id,month,category,amount).run();
 return json({ok:true});
}
export async function onRequestDelete({request,env}) {
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const body=await readJson(request),month=String(body?.month||""),category=String(body?.category||"").trim();
 if(!MONTH.test(month)||!category)return json({error:"Не указаны месяц и категория"},400);
 await env.DB.prepare("DELETE FROM category_budgets WHERE user_id=? AND month=? AND category=?").bind(user.id,month,category).run();
 return json({ok:true});
}
