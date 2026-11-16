export function isValidHistoryDate(value){
 const s=String(value||"");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+"T00:00:00Z");
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;
}
export function normalizeInteraction(input={}){
 const type=["call","email","message","note"].includes(input.type)?input.type:"note";
 const title=String(input.title||"").trim().slice(0,180);
 const body=String(input.body||"").trim().slice(0,5000);
 const occurred_on=String(input.occurred_on||"");
 return {type,title,body,occurred_on};
}
