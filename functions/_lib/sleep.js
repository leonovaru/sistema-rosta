function localParts(epoch,timezone){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(epoch));
  return Object.fromEntries(parts.map(p=>[p.type,p.value]));
}
function partsMatch(parts,year,month,day,hour,minute){
  return Number(parts.year)===year&&Number(parts.month)===month&&Number(parts.day)===day&&Number(parts.hour)===hour&&Number(parts.minute)===minute;
}
function wallTimeToEpoch(value,timezone){
  if(!value||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(value))return null;
  const [date,time]=value.split("T"),[year,month,day]=date.split("-").map(Number),[hour,minute]=time.split(":").map(Number);
  const target=Date.UTC(year,month-1,day,hour,minute);
  const normalized=new Date(target);
  if(normalized.getUTCFullYear()!==year||normalized.getUTCMonth()!==month-1||normalized.getUTCDate()!==day||hour>23||minute>59)return null;

  // A wall-clock time can map to zero instants (DST gap), one instant, or
  // two instants (DST fold). Only calculate a duration when it is unambiguous.
  const offsets=new Set();
  for(let delta=-36*60;delta<=36*60;delta+=180){
    const sample=target+delta*60000;
    const p=localParts(sample,timezone);
    offsets.add(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute))-Math.floor(sample/60000)*60000);
  }
  const matches=new Set();
  for(const offset of offsets){
    const candidate=target-offset;
    if(partsMatch(localParts(candidate,timezone),year,month,day,hour,minute))matches.add(candidate);
  }
  return matches.size===1?[...matches][0]:null;
}
export function calculateSleepDurationMinutes(start,end,timezone="Europe/Moscow"){
  if(!start||!end)return null;
  try{
    const a=wallTimeToEpoch(start,timezone),b=wallTimeToEpoch(end,timezone);
    return a!==null&&b!==null&&b>a?Math.round((b-a)/60000):null;
  }catch{return null;}
}
