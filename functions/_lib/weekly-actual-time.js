function localDay(value,timeZone){
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return null;
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return values.year+"-"+values.month+"-"+values.day;
}
function areaFor(entry,projectTargets){
 if(entry.project_id&&projectTargets.has(entry.project_id))return {key:"project:"+entry.project_id,title:entry.project_title||"Собственный проект",type:"project"};
 if(entry.life_area_id)return {key:"life:"+entry.life_area_id,title:entry.life_area_title||"Личная сфера",type:"personal"};
 if(entry.direction_id)return {key:"direction:"+entry.direction_id,title:entry.direction_title||"Доходное направление",type:"income"};
 if(entry.project_id)return {key:"project:"+entry.project_id,title:entry.project_title||"Собственный проект",type:"project"};
 if(entry.client_id)return {key:"client:"+entry.client_id,title:entry.client_name||"Клиент без направления",type:"income"};
 return {key:"unassigned",title:"Не распределено",type:"unassigned"};
}
export function attachWeeklyActualTime(week,entries=[],timezone="Europe/Moscow",targets=[]){
 const projectTargets=new Set((targets||[]).map(row=>row.project_id).filter(Boolean));
 const rows=new Map((week.area_balance||[]).map(row=>[row.key,{...row}]));
 let total=0,sessions=0;
 for(const entry of entries||[]){
  const minutes=Math.max(0,Number(entry.duration_minutes)||0);
  if(!minutes||!entry.started_at)continue;
  const date=localDay(entry.started_at,timezone);
  if(!date||date<week.from||date>week.to)continue;
  const area=areaFor(entry,projectTargets);
  const row=rows.get(area.key)||{...area,task_count:0,estimated_minutes:0,weekly_estimated_minutes:0,unestimated_count:0,target_minutes:null,target_gap_minutes:null,target_status:"not_set"};
  row.actual_minutes=(Number(row.actual_minutes)||0)+minutes;
  row.actual_sessions=(Number(row.actual_sessions)||0)+1;
  if(row.target_minutes!==null)row.actual_target_gap_minutes=row.target_minutes-row.actual_minutes;
  rows.set(area.key,row);
  total+=minutes;sessions++;
 }
 for(const row of rows.values()){
  row.actual_minutes=Number(row.actual_minutes)||0;
  row.actual_sessions=Number(row.actual_sessions)||0;
  if(row.target_minutes!==null)row.actual_target_gap_minutes=row.target_minutes-row.actual_minutes;
 }
 week.area_balance=[...rows.values()].sort((a,b)=>b.weekly_estimated_minutes-a.weekly_estimated_minutes||b.actual_minutes-a.actual_minutes);
 week.actual_time={tracked_minutes:total,sessions,source:"completed_timer_sessions",timezone,attribution:"session_start_day"};
 return week;
}
