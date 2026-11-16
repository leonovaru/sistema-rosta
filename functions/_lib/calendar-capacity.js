const EXCLUDED_TYPES = new Set(["sleep","work"]);

export function calculateCalendarBusyByDay(events = [], fromDate, horizonDays, workingDays = []) {
  const allowed = new Set(workingDays.map(Number));
  const result = [];
  for (let offset = 0; offset < horizonDays; offset++) {
    const date = new Date(fromDate + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + offset);
    const day = date.getUTCDay() || 7;
    const dateKey = date.toISOString().slice(0, 10);
    if (!allowed.has(day)) { result.push({ date: dateKey, busy_minutes: 0, working_day: false }); continue; }
    const start = Date.parse(dateKey + "T00:00:00Z"), end = start + 86400000, intervals = [];
    for (const event of events) {
      if (event.status === "cancelled" || EXCLUDED_TYPES.has(event.event_type)) continue;
      const rawStart=String(event.start_at||"").replace(" ","T"),rawEnd=String(event.end_at||"").replace(" ","T");
      const eventStart=Date.parse(rawStart+(rawStart.length===16?":00Z":"Z")),eventEnd=Date.parse(rawEnd+(rawEnd.length===16?":00Z":"Z"));
      if(!Number.isFinite(eventStart)||!Number.isFinite(eventEnd))continue;
      const left=Math.max(start,eventStart),right=Math.min(end,eventEnd);
      if(right>left)intervals.push([left,right]);
    }
    intervals.sort((a,b)=>a[0]-b[0]);
    let mergedStart=null,mergedEnd=null,busy=0;
    for(const [left,right] of intervals){
      if(mergedStart===null){mergedStart=left;mergedEnd=right;}
      else if(left<=mergedEnd)mergedEnd=Math.max(mergedEnd,right);
      else{busy+=Math.round((mergedEnd-mergedStart)/60000);mergedStart=left;mergedEnd=right;}
    }
    if(mergedStart!==null)busy+=Math.round((mergedEnd-mergedStart)/60000);
    result.push({date:dateKey,busy_minutes:busy,working_day:true});
  }
  return result;
}

export function calculateCalendarBusyMinutes(events = [], fromDate, horizonDays, workingDays = []) {
  return calculateCalendarBusyByDay(events,fromDate,horizonDays,workingDays).reduce((sum,day)=>sum+day.busy_minutes,0);
}
