import { addDays, addPeriod } from "./finance.js";
const positive=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:0;};
function dateValid(value){return /^\\d{4}-\\d{2}-\\d{2}$/.test(value)&&new Date(value+"T12:00:00Z").toISOString().slice(0,10)===value;}
export function buildCashflowForecast({today,horizonDays=90,startingBalance=0,planned=[],obligations=[],debts=[]}){
 if(!dateValid(today))throw new Error("Invalid forecast date");
 const end=addDays(today,horizonDays),events=[];
 for(const row of planned){
  if(!dateValid(row.expected_date)||row.expected_date<today||row.expected_date>end)continue;
  events.push({date:row.expected_date,type:row.flow_type,title:row.title,amount:positive(row.amount),source:"planned",direction_title:row.direction_title||null});
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
 events.sort((a,b)=>a.date.localeCompare(b.date)||(a.type==="income"?-1:1)||a.title.localeCompare(b.title));
 const days=[];let balance=Number(startingBalance)||0;
 for(let date=today;date<=end;date=addDays(date,1)){
  const dayEvents=events.filter(e=>e.date===date),income=dayEvents.filter(e=>e.type==="income").reduce((s,e)=>s+e.amount,0),expense=dayEvents.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount,0);
  balance+=income-expense;
  days.push({date,income,expenses:expense,net:income-expense,balance,events:dayEvents});
 }
 const totalIncome=events.filter(e=>e.type==="income").reduce((s,e)=>s+e.amount,0),totalExpenses=events.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount,0);
 return {period:{from:today,to:end,days:horizonDays},summary:{starting_balance:Number(startingBalance)||0,planned_income:totalIncome,planned_expenses:totalExpenses,net:totalIncome-totalExpenses,ending_balance:balance,lowest_balance:Math.min(Number(startingBalance)||0,...days.map(d=>d.balance)),negative_days:days.filter(d=>d.balance<0).map(d=>d.date)},events,days};
}
