import { addDays, addPeriod } from "./finance.js";
const positive=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:0;};
function dateValid(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
function monthDays(month){return new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0,12)).getUTCDate();}
export function buildCashflowForecast({today,horizonDays=90,startingBalance=0,planned=[],obligations=[],debts=[],variableExpensesByMonth=[],reserves=[]}){
 if(!dateValid(today))throw new Error("Invalid forecast date");
 const end=addDays(today,horizonDays),events=[];
 for(const row of planned){
  if(!dateValid(row.expected_date)||row.expected_date<today||row.expected_date>end)continue;
  events.push({id:row.id||null,date:row.expected_date,type:row.flow_type,title:row.title,amount:positive(row.amount),source:"planned",direction_title:row.direction_title||null});
 }
 for(const row of obligations){
  let due=row.due_date,guard=0;
  while(due&&due<=end&&guard++<120){
   if(due>=today)events.push({date:due,type:"expense",title:row.title,amount:positive(row.amount),source:"obligation"});
   due=addPeriod(due,row.frequency,row.recurrence_day);
  }
 }
 for(const debt of debts){
  let balance=positive(debt.balance),day=Number(debt.due_day),minimum=positive(debt.minimum_payment);
  if(debt.status!=="open"||!day||!minimum)continue;
  let cursor=today.slice(0,7)+"-01",guard=0;
  while(cursor<=end&&guard++<13){
   const [y,m]=cursor.split("-").map(Number),last=new Date(Date.UTC(y,m,0,12)).getUTCDate();
   const due=cursor.slice(0,8)+String(Math.min(day,last)).padStart(2,"0");
   if(due>=today&&due<=end&&balance>0){const amount=Math.min(balance,minimum);events.push({date:due,type:"expense",title:"Минимальный платёж: "+debt.title,amount,source:"debt_minimum"});balance-=amount;}
   cursor=addPeriod(cursor,"monthly",1);
  }
 }
 events.sort((a,b)=>a.date.localeCompare(b.date)||(a.type===b.type?a.title.localeCompare(b.title):a.type==="income"?-1:1));
 const variableByMonth=new Map(variableExpensesByMonth.map(x=>[x.month,positive(x.total)]));
 const activeReserves=reserves.filter(r=>Number(r.active)!==0).map(r=>({title:r.title,remaining:Math.max(0,Number(r.target_amount)-Number(r.current_amount)),saved:positive(r.current_amount),monthly:positive(r.monthly_contribution),targetDate:r.target_date||null}));
 const existingReserved=activeReserves.reduce((sum,r)=>sum+r.saved,0);
 const days=[];let balance=Number(startingBalance)||0,totalVariableExpenses=0,totalNewReserveAllocations=0;\n const reserveRates=new Map();
 for(let date=today;date<=end;date=addDays(date,1)){
  const dayEvents=events.filter(e=>e.date===date);
  const income=dayEvents.filter(e=>e.type==="income").reduce((s,e)=>s+e.amount,0);
  const fixedExpense=dayEvents.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount,0);
  const month=date.slice(0,7),daysInMonth=monthDays(month),variableExpense=(variableByMonth.get(month)||0)/daysInMonth;
  if(!reserveRates.has(month)){const rates=activeReserves.map(r=>{const amount=r.targetDate&&month+"-01">r.targetDate?0:Math.min(r.monthly,r.remaining);r.remaining=Math.max(0,r.remaining-amount);return {targetDate:r.targetDate,rate:amount/daysInMonth};});reserveRates.set(month,rates);}\n  const dailyReserve=reserveRates.get(month).reduce((sum,r)=>sum+(r.targetDate&&date>r.targetDate?0:r.rate),0);
  const expense=fixedExpense+variableExpense;
  totalNewReserveAllocations+=dailyReserve;totalVariableExpenses+=variableExpense;balance+=income-expense;
  days.push({date,income,expenses:expense,fixed_expenses:fixedExpense,variable_expenses:variableExpense,reserve_allocations:dailyReserve,available_balance:balance-existingReserved-totalNewReserveAllocations,net:income-expense,balance,events:dayEvents});
 }
 const totalIncome=events.filter(e=>e.type==="income").reduce((s,e)=>s+e.amount,0);
 const totalExpenses=events.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount,0);
 const availableEnding=balance-existingReserved-totalNewReserveAllocations;
 return {period:{from:today,to:end,days:horizonDays},summary:{starting_balance:Number(startingBalance)||0,planned_income:totalIncome,planned_expenses:totalExpenses,variable_expenses:Math.round(totalVariableExpenses*100)/100,existing_reserves:Math.round(existingReserved*100)/100,new_reserve_allocations:Math.round(totalNewReserveAllocations*100)/100,total_reserved:Math.round((existingReserved+totalNewReserveAllocations)*100)/100,available_ending_balance:Math.round(availableEnding*100)/100,total_expenses:Math.round((totalExpenses+totalVariableExpenses)*100)/100,net:Math.round((totalIncome-totalExpenses-totalVariableExpenses)*100)/100,ending_balance:Math.round(balance*100)/100,lowest_balance:Math.min(Number(startingBalance)||0,...days.map(d=>d.balance)),lowest_available_balance:Math.min((Number(startingBalance)||0)-existingReserved,...days.map(d=>d.available_balance)),negative_days:days.filter(d=>d.available_balance<0).map(d=>d.date)},events,days};
}
