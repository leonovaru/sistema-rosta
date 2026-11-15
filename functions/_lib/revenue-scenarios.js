const n=v=>{const x=Number(v);return Number.isFinite(x)&&x>0?x:0;};
const round=v=>Math.round((v+Number.EPSILON)*100)/100;
const SCENARIOS=[{key:"conservative",title:"Осторожный",factor:0.7,description:"70% месячной цели — запас на адаптацию и нестабильный поток клиентов."},{key:"realistic",title:"Реалистичный",factor:1,description:"Полное выполнение установленной цели."},{key:"ambitious",title:"Амбициозный",factor:1.3,description:"130% цели — ускоренный рост при достаточной загрузке."}];
export function buildRevenueScenarios({monthlyTarget=300000,directionRows=[],actualRows=[],historyRows=[],taskRows=[],weeklyCapacityHours=0}={}){
 const actual=new Map(actualRows.map(x=>[x.direction_id||"",n(x.revenue)]));
 const historicalRevenue=new Map(historyRows.map(x=>[x.direction_id||"",n(x.revenue)]));
 const minutes=new Map(taskRows.map(x=>[x.direction_id||"",n(x.actual_minutes)]));
 const directions=directionRows.map(d=>({...d,share:n(d.share_percent),ticket:n(d.average_sale_amount)}));
 const totalShare=directions.reduce((s,d)=>s+d.share,0),suggested=totalShare===0&&directions.length>0;
 const shareFor=d=>suggested?100/directions.length:d.share;
 const scenarios=SCENARIOS.map(s=>{
  const target=n(monthlyTarget)*s.factor;
  const rows=directions.map(d=>{
   const share=shareFor(d),goal=target*share/100,received=actual.get(d.id)||0,remaining=Math.max(0,goal-received),worked=(minutes.get(d.id)||0)/60;
   const historic=historicalRevenue.get(d.id)||0,rate=worked>0?historic/worked:null,requiredHours=rate>0?remaining/rate:null;
   return {direction_id:d.id,title:d.title,share_percent:round(share),monthly_target:round(goal),actual:round(received),remaining:round(remaining),weekly_target:round(goal/4.345),required_sales:d.ticket>0?Math.ceil(remaining/d.ticket):null,average_sale_amount:d.ticket||null,historical_revenue:round(historic),historical_hours:round(worked),historical_revenue_per_hour:rate===null?null:round(rate),required_hours:requiredHours===null?null:round(requiredHours),weekly_hours:requiredHours===null?null:round(requiredHours/4.345)};
  });
  const requiredHours=rows.every(x=>x.required_hours!==null)?round(rows.reduce((a,x)=>a+x.required_hours,0)):null;
  return {...s,target:round(target),actual:round(rows.reduce((a,x)=>a+x.actual,0)),remaining:round(rows.reduce((a,x)=>a+x.remaining,0)),weekly_target:round(target/4.345),required_hours:requiredHours,weekly_required_hours:requiredHours===null?null:round(requiredHours/4.345),capacity_hours:round(n(weeklyCapacityHours)),capacity_fit:requiredHours===null?null:requiredHours/4.345<=n(weeklyCapacityHours),directions:rows};
 });
 return {monthly_target:round(n(monthlyTarget)),weekly_capacity_hours:round(n(weeklyCapacityHours)),suggested_allocation:suggested,scenarios};
}
