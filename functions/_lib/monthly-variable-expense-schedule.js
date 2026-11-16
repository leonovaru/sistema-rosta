function monthKey(date){return date.slice(0,7);}
function daysInMonth(month){const [y,m]=month.split("-").map(Number);return new Date(Date.UTC(y,m,0,12)).getUTCDate();}
export function buildMonthlyVariableExpenseSchedule({historicalCategories=[],budgets=[],today,horizonDays=90}){
 const endDate=new Date(today+"T12:00:00Z");endDate.setUTCDate(endDate.getUTCDate()+horizonDays);
 const end=endDate.toISOString().slice(0,10),months=[];
 const budgetMap=new Map();
 for(const row of budgets){const key=monthKey(row.month)+"|"+String(row.category);budgetMap.set(key,Math.max(0,Number(row.planned_amount)||0));}
 const history=new Map(historicalCategories.map(x=>[String(x.category),Math.max(0,Number(x.forecast)||0)]));
 for(let cursor=monthKey(today)+"-01";cursor<=monthKey(end)+"-01";){
  const month=monthKey(cursor),categories=new Set([...history.keys(),...budgets.filter(x=>monthKey(x.month)===month).map(x=>String(x.category))]);
  const rows=[...categories].sort((a,b)=>a.localeCompare(b,"ru")).map(category=>{
   const key=month+"|"+category,hasBudget=budgetMap.has(key);
   return {category,monthly_amount:hasBudget?budgetMap.get(key):(history.get(category)||0),source:hasBudget?"monthly_budget":"historical_average"};
  }).filter(x=>x.monthly_amount>0);
  months.push({month,total:Math.round(rows.reduce((s,x)=>s+x.monthly_amount,0)),categories:rows,days_in_month:daysInMonth(month)});
  const [y,m]=month.split("-").map(Number);cursor=new Date(Date.UTC(y,m,1,12)).toISOString().slice(0,10);
 }
 return months;
}
