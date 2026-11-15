export function isValidMeetingDate(value){
 const s=String(value||"");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const date=new Date(s+"T00:00:00Z");
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===s;
}
export function cleanMeetingItems(value,max=20){
 return (Array.isArray(value)?value:[]).slice(0,max).map(item=>String(item||"").trim().slice(0,1000)).filter(Boolean);
}
export function normalizeMeetingAgreements(value,validProjectIds=new Set(),validClientIds=new Set()){
 return (Array.isArray(value)?value:[]).slice(0,20).map(item=>({
  task:String(item?.task||"").trim().slice(0,240),
  assignee:item?.assignee?String(item.assignee).trim().slice(0,160):null,
  due_date:isValidMeetingDate(item?.due_date)?item.due_date:null,
  project_id:validProjectIds.has(item?.project_id)?item.project_id:null,
  client_id:validClientIds.has(item?.client_id)?item.client_id:null
 })).filter(item=>item.task);
}
