export function applySavedDailyTaskAllocations(week,allocations=[]){
 const days=week?.days||[],byTask=new Map(),dayByDate=new Map(days.map(day=>[day.date,day]));
 for(const day of days)for(const task of day.tasks||[])byTask.set(String(task.id),task);
 const valid=(allocations||[]).filter(row=>dayByDate.has(row.allocation_date)&&byTask.has(String(row.task_id)));
 const assignedIds=new Set(valid.map(row=>String(row.task_id)));
 for(const day of days){
  const removed=(day.tasks||[]).filter(task=>assignedIds.has(String(task.id)));
  day.tasks=(day.tasks||[]).filter(task=>!assignedIds.has(String(task.id)));
  day.planned_task_minutes=Math.max(0,Number(day.planned_task_minutes)||0)-removed.reduce((sum,task)=>sum+Number(task.minutes||0),0);
 }
 for(const row of valid){
  const day=dayByDate.get(row.allocation_date),source=byTask.get(String(row.task_id));
  const minutes=Math.max(0,Number(row.minutes)||0);
  if(!minutes)continue;
  day.tasks.push({...source,minutes});
  day.planned_task_minutes+=minutes;
 }
 for(const day of days){
  day.task_count=day.tasks.length;
  day.overloaded=Boolean(day.working_day&&day.planned_task_minutes>day.available_minutes);
 }
 week.daily_assignments_applied=assignedIds.size;
 return week;
}
