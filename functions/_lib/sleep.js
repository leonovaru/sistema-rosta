function wallTimeToEpoch(value,timezone){
  if(!value||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return null;
  const [date,time]=value.split("T"),[year,month,day]=date.split("-").map(Number),[hour,minute]=time.split(":").map(Number);
  const target=Date.UTC(year,month-1,day,hour,minute);let guess=target;
  for(let i=0;i<4;i++){
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(guess));
    const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    guess+=target-Date.UTC(Number(v.year),Number(v.month)-1,Number(v.day),Number(v.hour),Number(v.minute));
  }
  return guess;
}
export function calculateSleepDurationMinutes(start,end,timezone="Europe/Moscow"){
  if(!start||!end)return null;
  try{
    const a=wallTimeToEpoch(start,timezone),b=wallTimeToEpoch(end,timezone);
    return a!==null&&b!==null&&b>a?Math.round((b-a)/60000):null;
  }catch{return null;}
}
