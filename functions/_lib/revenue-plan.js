const number=value=>{const n=Number(value);return Number.isFinite(n)?n:0;};
const money=value=>Math.round((number(value)+Number.EPSILON)*100)/100;
export function buildRevenuePlan({monthlyTarget=300000,directionRows=[],actualRows=[],daysInMonth=30,dayOfMonth=1}={}){
 const actual=new Map(actualRows.map(row=>[row.direction_id||"",number(row.actual)]));
 const configured=directionRows.map(row=>({...row,share_percent:number(row.share_percent),average_sale_amount:number(row.average_sale_amount)}));
 const shareTotal=configured.reduce((sum,row)=>sum+row.share_percent,0);
 const suggested=configured.every(row=>row.share_percent===0)&&configured.length>0;
 const defaultShare=suggested?100/configured.length:0;
 const directions=configured.map(row=>{
  const share=suggested?defaultShare:row.share_percent,target=number(monthlyTarget)*share/100,received=actual.get(row.id)||0,remaining=Math.max(0,target-received),ticket=row.average_sale_amount;
  return {direction_id:row.id,title:row.title,share_percent:money(share),monthly_target:money(target),actual:money(received),remaining:money(remaining),weekly_target:money(target/4.345),daily_target:money(target/Math.max(1,daysInMonth)),required_sales:ticket>0?Math.ceil(remaining/ticket):null,average_sale_amount:ticket||null,forecast:money(daysInMonth>0?received/dayOfMonth*daysInMonth:0)};
 });
 const allocated=money(directions.reduce((sum,row)=>sum+row.monthly_target,0));
 const actualTotal=money(directions.reduce((sum,row)=>sum+row.actual,0));
 const target=money(monthlyTarget);
 const remainingDays=Math.max(0,daysInMonth-dayOfMonth+1);
 const remainingTarget=Math.max(0,target-actualTotal);
 return {monthly_target:target,allocated_target:allocated,unallocated_target:money(Math.max(0,target-allocated)),share_total:money(shareTotal|| (suggested?100:0)),suggested_allocation:suggested,actual_total:actualTotal,remaining_total:remainingTarget,required_daily_total:remainingDays?money(remainingTarget/remainingDays):remainingTarget,required_weekly_total:money(remainingTarget/Math.max(1,remainingDays/7)),directions};
}
