const pct=value=>Math.min(100,Math.max(0,Number(value)||0));
export function buildObservedSalesFunnel({interactionRows=[],dealEventRows=[],fromDate}={}){
 const contacted=new Map(),qualified=new Map(),won=new Map();
 for(const row of interactionRows){if(!row.direction_id||!row.client_id)continue;const key=row.direction_id;if(!contacted.has(key))contacted.set(key,new Set());contacted.get(key).add(row.client_id);}
 const stages=new Map([["negotiation",1],["proposal",1],["awaiting_payment",1],["won",2]]);
 for(const row of dealEventRows){
  if(!row.direction_id||!row.client_id||!row.changes_json)continue;
  let changes;try{changes=JSON.parse(row.changes_json);}catch{continue;}
  for(const change of changes){if(change.field!=="stage"||!stages.has(change.to))continue;
   const key=row.direction_id;if(!qualified.has(key))qualified.set(key,new Set());qualified.get(key).add(row.client_id);
   if(change.to==="won"){if(!won.has(key))won.set(key,new Set());won.get(key).add(row.client_id);}
  }
 }
 const ids=new Set([...contacted.keys(),...qualified.keys(),...won.keys()]);
 return [...ids].map(direction_id=>{
  const contacts=contacted.get(direction_id)?.size||0,leads=qualified.get(direction_id)?.size||0,sales=won.get(direction_id)?.size||0;
  const contactToLead=contacts?Math.min(100,leads/contacts*100):null,leadToSale=leads?Math.min(100,sales/leads*100):null;
  return {direction_id,period_days:90,observed_contacted_clients:contacts,qualified_clients:leads,won_clients:sales,observed_contact_to_lead_percent:contactToLead===null?null:Math.round(contactToLead*10)/10,observed_lead_to_sale_percent:leadToSale===null?null:Math.round(leadToSale*10)/10,has_enough_contact_sample:contacts>=5,has_enough_lead_sample:leads>=3,can_suggest:contacts>=5&&leads>=3};
 });
}
