export function calculateProjectEconomics({plannedRevenue=0,plannedCosts=0,received=0,directExpenses=0,minutes=0}={}){
 const planned=Math.max(0,Number(plannedRevenue)||0),costPlan=Math.max(0,Number(plannedCosts)||0),income=Math.max(0,Number(received)||0),costs=Math.max(0,Number(directExpenses)||0),time=Math.max(0,Number(minutes)||0);
 const contribution=income-costs;
 return {
  planned_revenue:planned,received:income,outstanding:Math.max(0,planned-income),
  direct_expenses:costs,contribution,margin_percent:income>0?Math.round(contribution/income*10000)/100:null,
  hours:Math.round(time/60*100)/100,
  revenue_per_hour:time>0?Math.round(income/(time/60)*100)/100:null,
  contribution_per_hour:time>0?Math.round(contribution/(time/60)*100)/100:null,
  planned_cost_budget:costPlan,budget_usage_percent:costPlan>0?Math.round(costs/costPlan*10000)/100:null,
  status:costs>0&&contribution<0?"loss":planned>0&&costPlan>0&&costs>costPlan?"over_budget":planned>0&&income<planned?"awaiting_payment":"on_track"
 };
}
