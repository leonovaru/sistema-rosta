function eventAfterFirstContact(event,firstContactOn){
 if(!firstContactOn||!event.created_at)return true;
 const contactTime=String(firstContactOn).slice(0,10)+"T00:00:00";
 const eventTime=String(event.created_at).replace(" ","T");
 return eventTime>=contactTime;
}
export function buildObservedSalesFunnel({interactionRows=[],dealEventRows=[]}={}){
 const contacted=new Map(),firstContactByClient=new Map(),qualified=new Map(),won=new Map();
 for(const row of interactionRows){
  if(!row.direction_id||!row.client_id)continue;
  const key=row.direction_id,clientKey=key+"::"+row.client_id;
  if(!contacted.has(key))contacted.set(key,new Set());
  contacted.get(key).add(row.client_id);
  const current=firstContactByClient.get(clientKey);
  if(!current||String(row.first_contact_on||"")<current)firstContactByClient.set(clientKey,String(row.first_contact_on||""));
 }
 const stages=new Set(["negotiation","proposal","awaiting_payment","won"]);
 for(const row of dealEventRows){
  if(!row.direction_id||!row.client_id||!row.changes_json)continue;
  const firstContact=firstContactByClient.get(row.direction_id+"::"+row.client_id);
  if(firstContact===undefined||!eventAfterFirstContact(row,firstContact))continue;
  let changes;try{changes=JSON.parse(row.changes_json);}catch{continue;}
  for(const change of changes){
   if(change.field!=="stage"||!stages.has(change.to))continue;
   const key=row.direction_id;
   if(!qualified.has(key))qualified.set(key,new Set());
   qualified.get(key).add(row.client_id);
   if(change.to==="won"){
    if(!won.has(key))won.set(key,new Set());
    won.get(key).add(row.client_id);
   }
  }
 }
 const ids=new Set([...contacted.keys(),...qualified.keys(),...won.keys()]);
 return [...ids].map(direction_id=>{
  const contactSet=contacted.get(direction_id)||new Set(),qualifiedSet=qualified.get(direction_id)||new Set(),wonSet=won.get(direction_id)||new Set();
  const contacts=contactSet.size,leads=qualifiedSet.size,sales=[...wonSet].filter(id=>qualifiedSet.has(id)).length;
  const contactToLead=contacts?Math.min(100,leads/contacts*100):null,leadToSale=leads?Math.min(100,sales/leads*100):null;
  return {direction_id,period_days:90,observed_contacted_clients:contacts,qualified_clients:leads,won_clients:sales,observed_contact_to_lead_percent:contactToLead===null?null:Math.round(contactToLead*10)/10,observed_lead_to_sale_percent:leadToSale===null?null:Math.round(leadToSale*10)/10,has_enough_contact_sample:contacts>=5,has_enough_lead_sample:leads>=3,can_suggest:contacts>=5&&leads>=3};
 });
}
