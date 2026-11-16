import { addDays, addPeriod } from "./finance.js";
const positive=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:0;};
function dateValid(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
function monthDays(month){return new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0,12)).getUTCDate();}
export function buildCashflowForecast({today,horizonDays=90,startingBalance=0,planned=[],obligations=[],debts=[],variableExpensesByMonth=[],reserves=[],goalFundings=0,irregularExpenses=[],variableRecurringEvents=[]}){
 if(!dateValid(today))throw new Error("Invalid forecast date");
 const end=addDays(today,horizonDays),events=[];
 for(const row of planned){
  if(!dateValid(row.expected_date)||row.expected_date<today||row.expected_date>end)continue;
  events.push({id:row.id||null,date:row.expected_date,type:row.flow_type,title:row.title,amount:positive(row.amount),source:"planned",direction_title:row.direction_title||null,project_title:row.project_title||null,client_name:row.client_name||null});
 }
 for(const row of variableRecurringEvents){if(dateValid(row.date)&&row.date>=today&&row.date<=end)events.push({...row,amount:positive(row.amount),type:"expense",source:"variable_recurring"});}
 for(const row of obligations){
  let due=row.due_date,guard=0,overdueCount=0,firstOverdueDate=null;
  // Preserve every missed recurring installment while skipping old cycles efficiently.
  const paidOccurrences=new Set(String(row.paid_occurrences||"").split(",").filter(Boolean));
  while(due&&due<=end&&guard++<10000){
   if(!paidOccurrences.has(due)){
    if(due<today){overdueCount++;if(!firstOverdueDate)firstOverdueDate=due;}
    else events.push({date:due,type:"expense",title:row.title,amount:positive(row.amount),source:"obligation"});
   }
   due=addPeriod(due,row.frequency,row.recurrence_day);
  }
  if(overdueCount){
   events.push({date:today,type:"expense",title:row.title,amount:positive(row.amount)*overdueCount,source:"overdue_obligation",original_due_date:firstOverdueDate,overdue_days:Math.floor((Date.parse(today+"T12:00:00Z")-Date.parse(firstOverdueDate+"T12:00:00Z"))/86400000),overdue_occurrences:overdueCount});
  }
 }
 for(const row of irregularExpenses){
  let due=row.next_date,guard=0,overdueCount=0,firstOverdueDate=null;
  const anchorDay=Number(row.recurrence_day)||Number(String(row.next_date||"").slice(8,10));
  while(due&&due<=end&&guard++<10000){
   if(due<today){overdueCount++;if(!firstOverdueDate)firstOverdueDate=due;}
   else events.push({id:row.id,date:due,type:"expense",title:row.title,amount:positive(row.amount),source:"irregular_expense",category:row.category||"Нерегулярные расходы",frequency:row.frequency});
   if(row.frequency==="once")break;
   const [y,m]=due.split("-").map(Number),step=row.frequency==="yearly"?12:3,next=new Date(Date.UTC(y,m-1+step,1,12)),last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0,12)).getUTCDate();
   due=next.getUTCFullYear()+"-"+String(next.getUTCMonth()+1).padStart(2,"0")+"-"+String(Math.min(anchorDay,last)).padStart(2,"0");
  }
  if(overdueCount)events.push({id:row.id,date:today,type:"expense",title:row.title,amount:positive(row.amount)*overdueCount,source:"overdue_irregular_expense",category:row.category||"Нерегулярные расходы",original_due_date:firstOverdueDate,overdue_days:Math.floor((Date.parse(today+"T12:00:00Z")-Date.parse(firstOverdueDate+"T12:00:00Z"))/86400000),overdue_occurrences:overdueCount});
 }
 for(const debt of debts){
  let balance=positive(debt.balance),day=Number(debt.due_day),minimum=positive(debt.minimum_payment);
  const monthlyRate=Math.max(0,Number(debt.interest_rate)||0)/1200;
  if(debt.status!=="open"||!day||!minimum)continue;
  let cursor=today.slice(0,7)+"-01",guard=0;
  while(cursor<=end&&guard++<13){
   const [y,m]=cursor.split("-").map(Number),last=new Date(Date.UTC(y,m,0,12)).getUTCDate();
   const due=cursor.slice(0,8)+String(Math.min(day,last)).padStart(2,"0");
   const isCurrentMonth=cursor===today.slice(0,7)+"-01";
   const interest=Math.round(balance*monthlyRate*100)/100;
   balance=Math.round((balance+interest)*100)/100;
   const scheduledAmount=Math.min(balance,minimum);
   const amount=Math.max(0,Math.round((scheduledAmount-(isCurrentMonth?positive(debt.paid_this_month):0))*100)/100);
   if(due>=today&&due<=end&&amount>0){events.push({date:due,type:"expense",title:"Минимальный платёж: "+debt.title,amount,source:"debt_minimum"});balance=Math.max(0,Math.round((balance-amount)*100)/100);}
   else if(due<today&&isCurrentMonth&&amount>0){events.push({date:today,type:"expense",title:"Просроченный минимальный платёж: "+debt.title,amount,source:"overdue_debt_minimum",original_due_date:due,overdue_days:Math.floor((Date.parse(today+"T12:00:00Z")-Date.parse(due+"T12:00:00Z"))/86400000)});balance=Math.max(0,Math.round((balance-amount)*100)/100);}
   cursor=addPeriod(cursor,"monthly",1);
  }
 }
 events.sort((a,b)=>a.date.localeCompare(b.date)||(a.type===b.type?a.title.localeCompare(b.title):a.type==="income"?-1:1));
 const variableByMonth=new Map(variableExpensesByMonth.map(x=>[x.month,positive(x.total)]));
 const allSavedReserves=reserves.reduce((sum,r)=>sum+positive(r.current_amount),0);
 const activeReserves=reserves.filter(r=>Number(r.active)!==0).map(r=>({title:r.title,remaining:Math.max(0,Number(r.target_amount)-Number(r.current_amount)),monthly:positive(r.monthly_contribution),targetDate:r.target_date||null}));
 const existingReserved=allSavedReserves,existingGoalFundings=positive(goalFundings);
 const days=[];let balance=Number(startingBalance)||0,totalVariableExpenses=0,totalNewReserveAllocations=0;
 const reserveRates=new Map();
 for(let date=today;date<=end;date=addDays(date,1)){
  const dayEvents=events.filter(e=>e.date===date);
  const income=dayEvents.filter(e=>e.type==="income").reduce((s,e)=>s+e.amount,0);
  const fixedExpense=dayEvents.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount,0);
  const month=date.slice(0,7),daysInMonth=monthDays(month),variableExpense=(variableByMonth.get(month)||0)/daysInMonth;
  if(!reserveRates.has(month)){const monthEnd=addDays(month+"-"+String(daysInMonth).padStart(2,"0"),0);const rates=activeReserves.map(r=>{const planned=Math.min(r.monthly,r.remaining);const from=date>month+"-01"?date:month+"-01";const through=r.targetDate&&r.targetDate<monthEnd?r.targetDate:monthEnd;const eligibleDays=through<from?0:Math.floor((Date.parse(through+"T12:00:00Z")-Date.parse(from+"T12:00:00Z"))/86400000)+1;const rate=planned/daysInMonth;r.remaining=Math.max(0,r.remaining-rate*eligibleDays);return {targetDate:r.targetDate,rate};});reserveRates.set(month,rates);}
  const dailyReserve=reserveRates.get(month).reduce((sum,r)=>sum+(r.targetDate&&date>r.targetDate?0:r.rate),0);
  const expense=fixedExpense+variableExpense;
  totalNewReserveAllocations+=dailyReserve;totalVariableExpenses+=variableExpense;balance+=income-expense;
  days.push({date,income,expenses:expense,fixed_expenses:fixedExpense,variable_expenses:variableExpense,reserve_allocations:dailyReserve,available_balance:balance-existingReserved-existingGoalFundings-totalNewReserveAllocations,net:income-expense,balance,events:dayEvents});
 }
 const totalIncome=events.filter(e=>e.type==="income").reduce((s,e)=>s+e.amount,0);
 const totalExpenses=events.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount,0);
 const availableEnding=balance-existingReserved-existingGoalFundings-totalNewReserveAllocations;
 const closingByDate=new Map(days.map(day=>[day.date,{balance:day.balance,available_balance:day.available_balance}]));
 const detailedEvents=events.map(event=>({...event,day_closing_balance:closingByDate.get(event.date)?.balance??null,day_available_balance:closingByDate.get(event.date)?.available_balance??null}));
 return {period:{from:today,to:end,days:horizonDays},summary:{starting_balance:Number(startingBalance)||0,planned_income:totalIncome,planned_expenses:totalExpenses,variable_expenses:Math.round(totalVariableExpenses*100)/100,existing_reserves:Math.round(existingReserved*100)/100,existing_goal_fundings:Math.round(existingGoalFundings*100)/100,new_reserve_allocations:Math.round(totalNewReserveAllocations*100)/100,total_reserved:Math.round((existingReserved+existingGoalFundings+totalNewReserveAllocations)*100)/100,available_ending_balance:Math.round(availableEnding*100)/100,total_expenses:Math.round((totalExpenses+totalVariableExpenses)*100)/100,net:Math.round((totalIncome-totalExpenses-totalVariableExpenses)*100)/100,ending_balance:Math.round(balance*100)/100,lowest_balance:Math.min(Number(startingBalance)||0,...days.map(d=>d.balance)),lowest_available_balance:Math.min((Number(startingBalance)||0)-existingReserved-existingGoalFundings,...days.map(d=>d.available_balance)),negative_days:days.filter(d=>d.available_balance<0).map(d=>d.date)},events:detailedEvents,days};
}
