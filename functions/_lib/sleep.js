export function calculateSleepDurationMinutes(start,end){
  if(!start||!end)return null;
  const a=new Date(start),b=new Date(end);
  if(!Number.isFinite(a.getTime())||!Number.isFinite(b.getTime())||b<=a)return null;
  return Math.round((b-a)/60000);
}
