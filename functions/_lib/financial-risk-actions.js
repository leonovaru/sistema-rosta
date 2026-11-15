const amount=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:0;};
const round=value=>Math.round((Number(value)||0)*100)/100;

export function buildRiskSalesPlan({risk,directions=[],today}={}){
 if(!risk)return {available:false,directions:[],weekly_target:0,days_until:null};
 const daysUntil=today&&risk.from?Math.max(0,Math.round((Date.parse(risk.from+"T12:00:00Z")-Date.parse(today+"T12:00:00Z"))/86400000)):null;
 const weeks=daysUntil===null?1:Math.max(1,Math.ceil((daysUntil+1)/7));
 const total=amount(risk.required_additional_income),allZero=directions.length>0&&directions.every(d=>Number(d.share_percent)===0);
 const weighted=directions.map(d=>({...d,share:Math.max(0,Number(allZero?1/directions.length:d.share_percent/100)||0)}));
 const totalShare=weighted.reduce((s,d)=>s+d.share,0)||1;
 const rows=weighted.map(d=>{
  const target=round(total*d.share/totalShare),ticket=amount(d.average_sale_amount),response=Math.max(0,Math.min(100,Number(d.contact_to_lead_percent)||0)),close=Math.max(0,Math.min(100,Number(d.lead_to_sale_percent)||0));
  const sales=ticket>0?Math.ceil(target/ticket):null,leads=sales!==null&&close>0?Math.ceil(sales/(close/100)):null,contacts=leads!==null&&response>0?Math.ceil(leads/(response/100)):null;
  return {direction_id:d.direction_id,title:d.title,allocated_amount:target,weekly_amount:round(target/weeks),average_sale_amount:ticket||null,sales_required:sales,qualified_leads_required:leads,outreach_required:contacts,weekly_sales:sales===null?null:Math.ceil(sales/weeks),weekly_qualified_leads:leads===null?null:Math.ceil(leads/weeks),weekly_outreach:contacts===null?null:Math.ceil(contacts/weeks),assumptions_incomplete:!ticket||!response||!close,contact_to_lead_percent:response,lead_to_sale_percent:close};
 }).filter(d=>d.allocated_amount>0);
 return {available:true,due_date:risk.from,days_until:daysUntil,weeks_to_deadline:weeks,total_required:total,weekly_target:round(total/weeks),directions:rows,warning:"План рассчитан на полную сумму дефицита. Открытые сделки показаны отдельно и не вычитаются из цели, поскольку их оплата не гарантирована."};
}

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
