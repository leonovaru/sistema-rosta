function shiftMonth(month,offset){const [y,m]=month.split("-").map(Number),d=new Date(Date.UTC(y,m-1+offset,1,12));return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0");}
export function buildBudgetInsights(historyRows=[],budgetRows=[],{month,historyMonths=3}={}){
 const months=Array.from({length:historyMonths},(_,i)=>shiftMonth(month,i-historyMonths));
 const actual=new Map(),plans=new Map();
 for(const row of historyRows){const key=String(row.category)+"|"+String(row.month);actual.set(key,Number(row.actual??row.total)||0);}
 for(const row of budgetRows){plans.set(String(row.category)+"|"+String(row.month),Number(row.planned_amount)||0);}
 const categories=new Set([...historyRows.map(x=>String(x.category)),...budgetRows.map(x=>String(x.category))]);
 return [...categories].sort((a,b)=>a.localeCompare(b,"ru")).map(category=>{
  const history=months.map(m=>({month:m,actual:historyRows.filter(x=>String(x.category)===category&&String(x.month)===m).reduce((s,x)=>s+Number(x.actual ?? x.total ?? 0),0),budget:plans.has(category+"|"+m)?plans.get(category+"|"+m):null}));
  const compared=history.filter(x=>x.budget!==null),overruns=compared.filter(x=>x.actual>x.budget);
  const hasHistory=historyRows.some(x=>String(x.category)===category);
  const observedMonths=hasHistory?historyMonths:0;
  const avg=observedMonths?history.reduce((s,x)=>s+x.actual,0)/observedMonths:0;
  const repeated=overruns.length>=2;
  const suggested=repeated?Math.ceil(avg):null;
  return {category,months:history,months_observed:observedMonths,months_with_budget:compared.length,over_budget_months:overruns.length,average_actual:Math.round(avg),repeated_overrun:repeated,suggested_budget:suggested,current_budget:plans.has(category+"|"+month)?plans.get(category+"|"+month):null};
 }).filter(x=>x.months_observed||x.months_with_budget);
}
