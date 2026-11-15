export function addDays(date,days) {
  const value=new Date(date+"T12:00:00Z");
  value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
}
export function addPeriod(date,frequency) {
  if(frequency==="weekly")return addDays(date,7);
  if(frequency!=="monthly")return null;
  const [year,month,day]=date.split("-").map(Number);
  const next=new Date(Date.UTC(year,month,1,12));
  const last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0,12)).getUTCDate();
  return next.getUTCFullYear()+"-"+String(next.getUTCMonth()+1).padStart(2,"0")+"-"+String(Math.min(day,last)).padStart(2,"0");
}
