import { resolveSleepWallTime } from "./sleep.js";
function zonedParts(value,timeZone){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
 return Object.fromEntries(parts.map(part=>[part.type,part.value]));
}
function band(hour){return hour<6?"Ночь":hour<12?"Утро":hour<18?"День":"Вечер";}
function average(values){return values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null;}
function formatHour(value){return value===null?"—":String(Math.floor(value/60)).padStart(2,"0")+":"+String(value%60).padStart(2,"0");}
export function buildDailyRhythmInsights(timeEntries=[],sleepSessions=[],timezone="Europe/Moscow"){
 const bands=new Map(),hours=[],durations=[];
 for(const entry of timeEntries||[]){
  const minutes=Math.max(0,Number(entry.duration_minutes)||0),parts=zonedParts(entry.started_at,timezone);
  if(!parts||minutes<=0)continue;
  const hour=Number(parts.hour),key=band(hour),row=bands.get(key)||{period:key,sessions:0,minutes:0};
  row.sessions++;row.minutes+=minutes;bands.set(key,row);hours.push(hour*60+Number(parts.minute));durations.push(minutes);
 }
 const periodRows=["Утро","День","Вечер","Ночь"].map(name=>bands.get(name)||{period:name,sessions:0,minutes:0});
 const mostTracked=periodRows.filter(row=>row.sessions).sort((a,b)=>b.minutes-a.minutes)[0]||null;
 const sleepDurations=[],wakeTimes=[],bedTimes=[];
 for(const session of sleepSessions||[]){
  if(!session.fell_asleep_at||!session.woke_at)continue;
  const startEpoch=resolveSleepWallTime(session.fell_asleep_at,session.asleep_timezone||session.timezone||timezone);
  const endEpoch=resolveSleepWallTime(session.woke_at,session.wake_timezone||session.timezone||timezone);
  if(startEpoch===null||endEpoch===null||endEpoch<=startEpoch)continue;
  const start=zonedParts(startEpoch,timezone),end=zonedParts(endEpoch,timezone);
  if(!start||!end)continue;
  const elapsed=Math.round((endEpoch-startEpoch)/60000);
  if(elapsed>0&&elapsed<=960)sleepDurations.push(elapsed);
  wakeTimes.push(Number(end.hour)*60+Number(end.minute));bedTimes.push(Number(start.hour)*60+Number(start.minute));
 }
 const sufficientWork=hours.length>=5,sufficientSleep=sleepDurations.length>=3;
 const sortedHours=[...hours].sort((a,b)=>a-b);
 const medianHour=sortedHours.length?sortedHours[Math.floor(sortedHours.length/2)]:null;
 return {
  timezone,period_days:90,
  work:{sample_sessions:hours.length,total_tracked_minutes:durations.reduce((a,b)=>a+b,0),average_session_minutes:average(durations),median_start_time:formatHour(medianHour),most_tracked_period:mostTracked?.period||null,by_period:periodRows,confidence:hours.length>=20?"higher":sufficientWork?"preliminary":"insufficient"},
  sleep:{sample_sessions:sleepDurations.length,average_duration_minutes:sufficientSleep?average(sleepDurations):null,average_bedtime:sufficientSleep?formatHour(average(bedTimes)):null,average_wake_time:sufficientSleep?formatHour(average(wakeTimes)):null,confidence:sleepDurations.length>=14?"higher":sufficientSleep?"preliminary":"insufficient"},
  notes:["Учитываются только завершённые таймер-сессии задач и заполненные записи сна за последние 90 дней.","Время сессии относится к локальному часовому поясу; это распределение учёта времени, а не доказательство продуктивности.","При малом количестве наблюдений персональные выводы не формируются."]
 };
}
