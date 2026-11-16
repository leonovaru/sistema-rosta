function minutes(value) { const n=Number(value); return Number.isFinite(n)&&n>0?n:0; }
function bucket(map,key,label,row) {
  const item=map.get(key)||{id:key,title:label,tasks:0,completed:0,estimated_minutes:0,actual_minutes:0,overrun_tasks:0};
  item.tasks++;
  item.estimated_minutes+=minutes(row.estimated_minutes);
  item.actual_minutes+=minutes(row.actual_minutes);
  if(row.status==="done")item.completed++;
  if(minutes(row.estimated_minutes)>0&&minutes(row.actual_minutes)>minutes(row.estimated_minutes))item.overrun_tasks++;
  map.set(key,item);
}
function finish(map) {
  return [...map.values()].map(x=>({...x,variance_minutes:x.actual_minutes-x.estimated_minutes,completion_rate:x.tasks?Math.round(x.completed/x.tasks*100):0,overrun_rate:x.tasks?Math.round(x.overrun_tasks/x.tasks*100):0})).sort((a,b)=>b.actual_minutes-a.actual_minutes||b.tasks-a.tasks);
}
export function buildTaskAnalytics(rows=[]) {
  const directions=new Map(),clients=new Map(),projects=new Map(),lifeAreas=new Map(),months=new Map();
  for(const row of rows){
    bucket(directions,row.direction_id||"unassigned",row.direction_title||"Без направления",row);
    bucket(clients,row.client_id||"unassigned",row.client_name||"Без клиента",row);
    bucket(projects,row.project_id||"unassigned",row.project_title||"Без проекта",row);
    bucket(lifeAreas,row.life_area_id||"unassigned",row.life_area_title||"Без личной области",row);
    const month=row.status==="done"&&row.completed_at?String(row.completed_at).slice(0,7):"";
    if(month)bucket(months,month,month,row);
  }
  const totals=rows.reduce((a,r)=>{a.tasks++;if(r.status==="done")a.completed++;a.estimated_minutes+=minutes(r.estimated_minutes);a.actual_minutes+=minutes(r.actual_minutes);if(minutes(r.estimated_minutes)>0&&minutes(r.actual_minutes)>minutes(r.estimated_minutes))a.overrun_tasks++;return a;},{tasks:0,completed:0,estimated_minutes:0,actual_minutes:0,overrun_tasks:0});
  return {summary:{...totals,variance_minutes:totals.actual_minutes-totals.estimated_minutes,completion_rate:totals.tasks?Math.round(totals.completed/totals.tasks*100):0,overrun_rate:totals.tasks?Math.round(totals.overrun_tasks/totals.tasks*100):0},by_direction:finish(directions),by_client:finish(clients),by_project:finish(projects),by_life_area:finish(lifeAreas),by_month:finish(months).sort((a,b)=>a.id.localeCompare(b.id))};
}
export function buildTimeAnalytics(rows=[],calendarRows=[]) {
  const tracked=rows.reduce((sum,r)=>sum+minutes(r.tracked_minutes),0);
  const calendar=calendarRows.reduce((acc,r)=>{const planned=Math.max(0,Number(r.planned_minutes)||0),actual=Math.max(0,Number(r.actual_minutes)||0);const key=r.event_type||"other";acc[key]??={event_type:key,events:0,planned_minutes:0,actual_minutes:0};acc[key].events++;acc[key].planned_minutes+=planned;acc[key].actual_minutes+=actual;return acc;},{});
  return {tracked_minutes:tracked,calendar_by_type:Object.values(calendar).sort((a,b)=>b.actual_minutes-b.actual_minutes||b.planned_minutes-a.planned_minutes)};
}
