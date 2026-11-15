function minute(value){const match=String(value||"").match(/T(\d{2}):(\d{2})/);return match?Number(match[1])*60+Number(match[2]):null;}
function intervalsForDay(events,date){
 return (events||[]).filter(event=>event.status!=="cancelled"&&!["sleep","work"].includes(event.event_type)&&String(event.start_at||"").slice(0,10)===date)
 .map(event=>({start:minute(event.start_at),end:minute(event.end_at),type:event.event_type||"other",title:event.title||"Событие"}))
 .filter(event=>event.start!==null&&event.end!==null&&event.end>event.start);
}
function summarize(rows){
 const done=rows.filter(row=>row.status==="done").length;
 return {sample_size:rows.length,completed:done,skipped:rows.filter(row=>row.status==="skipped").length,interrupted:rows.filter(row=>row.status==="interrupted").length,completion_rate:rows.length?Math.round(done/rows.length*100):null};
}
export function buildCalendarExecutionContext(logs=[],events=[],{proximityMinutes=60}={}){
 const valid=(logs||[]).filter(row=>["done","skipped","interrupted"].includes(row.status)&&Number(row.planned_minutes)>0&&/^\d{4}-\d{2}-\d{2}$/.test(row.block_date||"")&&/^\d{2}:\d{2}$/.test(row.start_time||"")&&/^\d{2}:\d{2}$/.test(row.end_time||""));
 const annotated=valid.map(row=>{
  const start=minute("T"+row.start_time),end=minute("T"+row.end_time);
  const dayEvents=intervalsForDay(events,row.block_date);
  const overlaps=dayEvents.filter(event=>start<event.end&&end>event.start);
  const before=dayEvents.filter(event=>event.end<=start&&start-event.end<=proximityMinutes);
  const after=dayEvents.filter(event=>event.start>=end&&event.start-end<=proximityMinutes);
  const nearby=[...before,...after];
  return {...row,calendar_context:overlaps.length?"overlap":nearby.length?"nearby":"clear",meeting_overlap:overlaps.some(event=>event.type==="meeting"),nearby_meeting:nearby.some(event=>event.type==="meeting"),nearby_events:nearby.length,meeting_count:dayEvents.filter(event=>event.type==="meeting").length};
 });
 const groups=["clear","nearby","overlap"].map(context=>{
  const rows=annotated.filter(row=>row.calendar_context===context);
  return {context,...summarize(rows),meeting_related_blocks:rows.filter(row=>row.meeting_overlap||row.nearby_meeting).length};
 }).filter(group=>group.sample_size);
 const meetingDays=new Map();
 for(const row of annotated){const item=meetingDays.get(row.block_date)||{date:row.block_date,meeting_count:row.meeting_count,rows:[]};item.rows.push(row);meetingDays.set(row.block_date,item);}
 const days=[...meetingDays.values()].map(day=>({date:day.date,meeting_count:day.meeting_count,...summarize(day.rows)}));
 const insights=[];
 const clear=groups.find(group=>group.context==="clear"),nearby=groups.find(group=>group.context==="nearby");
 if(clear&&nearby&&clear.sample_size>=4&&nearby.sample_size>=4&&Math.abs(clear.completion_rate-nearby.completion_rate)>=20){
  insights.push({type:"meeting_proximity",title:"Результаты блоков рядом со встречами отличаются",detail:"Без близких событий завершено "+clear.completion_rate+"% блоков ("+clear.completed+" из "+clear.sample_size+"), рядом с событиями — "+nearby.completion_rate+"% ("+nearby.completed+" из "+nearby.sample_size+").",sample_size:clear.sample_size+nearby.sample_size});
 }
 const overlap=groups.find(group=>group.context==="overlap");
 if(overlap)insights.push({type:"calendar_overlap",title:"Есть блоки, совпавшие по времени с событиями календаря",detail:"Найдено "+overlap.sample_size+" таких блоков. Проверьте расписание: пересечение может означать конфликт плана или неточную запись времени.",sample_size:overlap.sample_size});
 return {sample_size:annotated.length,groups,days,insights,note:"Близость означает событие в пределах "+proximityMinutes+" минут до или после блока. Сравнение показывает связь, но не доказывает, что встреча вызвала прерывание. Сон и рабочие интервалы не учитываются как события-контексты."};
}
