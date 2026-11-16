function eventAfterFirstContact(event,firstContactOn){
 if(!firstContactOn||!event.created_at)return true;
 const contactTime=String(firstContactOn).slice(0,10)+"T00:00:00";
 const eventTime=String(event.created_at).replace(" ","T");
 return eventTime>=contactTime;
}
function calendarDay(value){
 const day=String(value||"").slice(0,10);
 if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day))return null;
 const time=Date.parse(day+"T00:00:00Z");
 return Number.isFinite(time)?time: null;
}
function average(values){
 if(!values.length)return null;
 return Math.round(values.reduce((sum,value)=>sum+value,0)/values.length*10)/10;
}
export function buildObservedSalesFunnel({interactionRows=[],dealEventRows=[]}={}){
 const contacted=new Map(),firstContactByClient=new Map(),qualified=new Map(),won=new Map(),milestones=new Map();
 for(const row of interactionRows){
  if(!row.direction_id||!row.client_id)continue;
  const key=row.direction_id,clientKey=key+"::"+row.client_id;
  if(!contacted.has(key))contacted.set(key,new Set());
  contacted.get(key).add(row.client_id);
  const current=firstContactByClient.get(clientKey),candidate=String(row.first_contact_on||"");
  if(candidate&&(!current||candidate<current))firstContactByClient.set(clientKey,candidate);
  else if(!firstContactByClient.has(clientKey))firstContactByClient.set(clientKey,"");
 }
 const stages=new Set(["negotiation","proposal","awaiting_payment","won"]);
 for(const row of dealEventRows){
  if(!row.direction_id||!row.client_id||!row.changes_json)continue;
  const clientKey=row.direction_id+"::"+row.client_id,firstContact=firstContactByClient.get(clientKey);
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
   const contactDay=calendarDay(firstContact),eventDay=calendarDay(row.created_at);
   if(contactDay===null||eventDay===null||eventDay<contactDay)continue;
   const days=Math.round((eventDay-contactDay)/86400000);
   if(!milestones.has(key))milestones.set(key,new Map());
   const byClient=milestones.get(key);
   if(!byClient.has(row.client_id))byClient.set(row.client_id,{});
   const record=byClient.get(row.client_id);
   const milestone=change.to==="negotiation"?"negotiation":change.to==="proposal"?"proposal":change.to==="won"?"won":null;
   if(milestone&&(record[milestone]===undefined||days<record[milestone]))record[milestone]=days;
  }
 }
 const ids=new Set([...contacted.keys(),...qualified.keys(),...won.keys()]);
 return [...ids].map(direction_id=>{
  const contactSet=contacted.get(direction_id)||new Set(),qualifiedSet=qualified.get(direction_id)||new Set(),wonSet=won.get(direction_id)||new Set(),byClient=milestones.get(direction_id)||new Map();
  const contacts=contactSet.size,leads=qualifiedSet.size,sales=[...wonSet].filter(id=>qualifiedSet.has(id)).length;
  const contactToLead=contacts?Math.min(100,leads/contacts*100):null,leadToSale=leads?Math.min(100,sales/leads*100):null;
  const durations=key=>[...byClient.values()].map(item=>item[key]).filter(value=>Number.isFinite(value));
  const negotiationDays=durations("negotiation"),proposalDays=durations("proposal"),wonDays=durations("won");
  return {direction_id,period_days:90,observed_contacted_clients:contacts,qualified_clients:leads,won_clients:sales,observed_contact_to_lead_percent:contactToLead===null?null:Math.round(contactToLead*10)/10,observed_lead_to_sale_percent:leadToSale===null?null:Math.round(leadToSale*10)/10,avg_contact_to_negotiation_days:average(negotiationDays),contact_to_negotiation_sample:negotiationDays.length,avg_contact_to_proposal_days:average(proposalDays),contact_to_proposal_sample:proposalDays.length,avg_contact_to_won_days:average(wonDays),contact_to_won_sample:wonDays.length,has_enough_contact_sample:contacts>=5,has_enough_lead_sample:leads>=3,can_suggest:contacts>=5&&leads>=3};
 });
}
