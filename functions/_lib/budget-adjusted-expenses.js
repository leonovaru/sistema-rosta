export function buildBudgetAdjustedExpenseForecast(forecastCategories=[],budgets=[]) {
 const planned=new Map(budgets.map(x=>[String(x.category),Number(x.planned_amount)]));
 const historical=new Map(forecastCategories.map(x=>[String(x.category),Number(x.forecast)||0]));
 const categories=new Set([...historical.keys(),...planned.keys()]);
 const rows=[...categories].sort((a,b)=>a.localeCompare(b,'ru')).map(category=>{
  const hasBudget=planned.has(category),historicalForecast=historical.get(category)||0;
  return {category,forecast:hasBudget?Math.max(0,planned.get(category)):historicalForecast,source:hasBudget?'monthly_budget':'historical_average'};
 });
 return {monthly_total:Math.round(rows.reduce((s,x)=>s+x.forecast,0)),categories:rows,budgeted_categories:rows.filter(x=>x.source==='monthly_budget').length,history_categories:rows.filter(x=>x.source==='historical_average').length};
}
