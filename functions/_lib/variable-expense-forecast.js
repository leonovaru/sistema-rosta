function monthStart(date){return date.slice(0,7)+"-01";}
function shiftMonth(date,delta){const [y,m]=date.slice(0,7).split("-").map(Number);const d=new Date(Date.UTC(y,m-1+delta,1,12));return d.toISOString().slice(0,10);}
export function buildVariableExpenseForecast(rows,{today,horizonMonths=3}={}){
 const current=monthStart(today),lastComplete=shiftMonth(current,-1),months=Array.from({length:horizonMonths},(_,i)=>shiftMonth(lastComplete,-(horizonMonths-1-i)).slice(0,7));
 const grouped=new Map();
 for(const row of rows){const month=String(row.month||"");if(!months.includes(month))continue;const key=String(row.category||"Прочее");grouped.set(key,grouped.get(key)||new Map());grouped.get(key).set(month,Number(row.total)||0);}
 const categories=[...grouped.entries()].map(([category,values])=>{const present=months.map(m=>values.get(m)).filter(v=>Number.isFinite(v));const avg=present.length?present.reduce((a,b)=>a+b,0)/present.length:0;return {category,months_observed:present.length,monthly_average:Math.round(avg),forecast:Math.round(avg),basis:"average_of_complete_months"};}).filter(x=>x.forecast>0).sort((a,b)=>b.forecast-a.forecast);
 return {target_month:shiftMonth(current,1).slice(0,7),based_on_months:months,categories,total:categories.reduce((s,x)=>s+x.forecast,0),method:"Среднее фактических расходов по категориям за три последних завершённых календарных месяца. Категории без истории не прогнозируются."};
}