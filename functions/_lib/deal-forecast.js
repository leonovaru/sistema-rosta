const amount=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?n:0;};
export function buildMonthlyDealForecast({dealRows=[],incomeRows=[],undatedRow={}}={}){
 const months=new Map();
 for(const row of dealRows){const month=String(row.month||"");if(!/^\d{4}-\d{2}$/.test(month))continue;months.set(month,{month,planned_amount:amount(row.planned_amount),weighted_amount:amount(row.weighted_amount),deal_count:Math.max(0,Number(row.deal_count)||0),actual_amount:0});}
 for(const row of incomeRows){const month=String(row.month||"");if(!/^\d{4}-\d{2}$/.test(month))continue;const item=months.get(month)||{month,planned_amount:0,weighted_amount:0,deal_count:0,actual_amount:0};item.actual_amount=amount(row.actual_amount);months.set(month,item);}
 return {monthly_forecast:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)),undated_open:{count:Math.max(0,Number(undatedRow?.count)||0),amount:amount(undatedRow?.amount)}};
}

export function isDealInActivePipeline(deal){return Boolean(deal)&&!["won","lost"].includes(deal.stage)&&deal.client_status!=="closed";}
