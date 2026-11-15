const amount=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:0;};
const round=value=>Math.round((Number(value)||0)*100)/100;
export function buildFinancialRiskActions({days=[],deals=[]}={}){
 const risks=[];let current=null;
 for(const day of days){
  const available=Number(day.available_balance)||0;
  if(available<0){
   if(!current)current={from:day.date,to:day.date,lowest_available_balance:available,required_additional_income:round(Math.abs(available))};
   else{current.to=day.date;if(available<current.lowest_available_balance){current.lowest_available_balance=available;current.required_additional_income=round(Math.abs(available));}}
  }else if(current){risks.push(current);current=null;}
 }
 if(current)risks.push(current);
 const enriched=risks.map(risk=>{
  const candidates=deals.filter(d=>d.expected_close_date&&d.expected_close_date<=risk.from&&Number(d.amount)>0)
   .map(d=>({deal_id:d.id,title:d.title,expected_close_date:d.expected_close_date,amount:round(amount(d.amount)),probability_percent:Math.max(0,Math.min(100,Number(d.probability_percent)||0)),weighted_amount:round(amount(d.amount)*Math.max(0,Math.min(100,Number(d.probability_percent)||0))/100)}))
   .sort((a,b)=>b.weighted_amount-a.weighted_amount);
  const weightedPipeline=round(candidates.reduce((sum,d)=>sum+d.weighted_amount,0));
  const residual=round(Math.max(0,risk.required_additional_income-weightedPipeline));
  return {...risk,days_until:null,dated_deals:candidates,weighted_pipeline_before_risk:weightedPipeline,remaining_gap_after_weighted_pipeline:residual,
   suggested_actions:[
    ...candidates.filter(d=>d.weighted_amount>0).slice(0,5).map(d=>({type:"follow_up_deal",deal_id:d.deal_id,title:"Связаться по сделке «"+d.title+"»",due_date:risk.from,reason:"Ожидаемая дата оплаты — "+d.expected_close_date+"; взвешенная сумма — "+d.weighted_amount+" ₽"})),
    ...(residual>0?[{type:"new_sales",title:"Найти новые продажи на сумму не менее "+residual+" ₽",due_date:risk.from,amount:residual,reason:"Взвешенной суммы известных сделок недостаточно для покрытия прогнозного дефицита."}]:[])
   ]};
 });
 return {has_risk:enriched.length>0,risks:enriched,first_risk:enriched[0]||null,total_risk_periods:enriched.length};
}
