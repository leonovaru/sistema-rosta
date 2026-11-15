const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const pct=v=>Math.min(100,Math.max(0,num(v)));
export function buildSalesPlan(rows=[],daysRemaining=30){
 const weeks=Math.max(1,Math.ceil(Math.max(1,daysRemaining)/7));
 return rows.map(row=>{
  const target=num(row.remaining_target),ticket=num(row.average_sale_amount),close=pct(row.lead_to_sale_percent),response=pct(row.contact_to_lead_percent);
  const sales=ticket>0?Math.ceil(target/ticket):null;
  const qualified=sales!==null&&close>0?Math.ceil(sales/(close/100)):null;
  const outreach=qualified!==null&&response>0?Math.ceil(qualified/(response/100)):null;
  const hasTicket=ticket>0,hasClose=close>0,hasResponse=response>0;
  return {direction_id:row.direction_id,title:row.title,potential_clients:Math.max(0,Math.trunc(num(row.potential_clients))),contacted_clients:Math.max(0,Math.trunc(num(row.contacted_clients))),remaining_target:Math.round(target*100)/100,average_sale_amount:ticket||null,sales_required:sales,lead_to_sale_percent:close,contact_to_lead_percent:response,qualified_leads_required:qualified,outreach_required:outreach,weekly_sales:sales===null?null:Math.ceil(sales/weeks),weekly_qualified_leads:qualified===null?null:Math.ceil(qualified/weeks),weekly_outreach:outreach===null?null:Math.ceil(outreach/weeks),assumptions_incomplete:!hasTicket||!hasClose||!hasResponse,weekly_actions:[{key:"outreach",title:"Найти и адресно изучить потенциальных клиентов",count:outreach===null?null:Math.ceil(outreach/weeks)},{key:"followup",title:"Провести повторные касания и довести диалоги до следующего шага",count:qualified===null?null:Math.ceil(qualified/weeks)},{key:"sales",title:"Провести переговоры и предложить решение",count:sales===null?null:Math.ceil(sales/weeks)}]};
 });
}
