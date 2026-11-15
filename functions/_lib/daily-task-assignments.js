function dateValid(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||"")))return false;const parsed=new Date(date+"T12:00:00Z");return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date;}
function remainingEstimate(task){const estimate=Number(task?.estimated_minutes);if(!Number.isFinite(estimate)||estimate<=0)return null;return Math.max(0,estimate-Math.max(0,Number(task.actual_minutes)||0));}
export function applySavedDailyTaskAllocations(week,allocations=[],tasks=[]){
 const days=week?.days||[],dayByDate=new Map(days.map(day=>[day.date,day]));
 const taskMap=new Map((tasks||[]).map(task=>[String(task.id),task]));
 const grouped=new Map();
 for(const row of allocations||[]){
  if(!dayByDate.has(row.allocation_date))continue;
  const key=String(row.task_id),group=grouped.get(key)||[];
  group.push({date:row.allocation_date,minutes:Number(row.minutes)||0});grouped.set(key,group);
 }
 const validGroups=[],issues=[],comparison=[];
 for(const [taskId,rows] of grouped){
  const task=taskMap.get(taskId),sum=rows.reduce((total,row)=>total+row.minutes,0);
  // Historical allocations for completed, deleted, or waiting tasks are inert.
  // They must not surface as stale schedules or trigger repair proposals.
  if(!task||!["todo","doing"].includes(task.status))continue;
  let reason=null;
  {
   const expected=remainingEstimate(task);
   if(expected===null)reason="У задачи нет актуальной оценки";
   else if(sum!==expected)reason="Оценка или фактически выполненное время изменились: сохранено "+sum+" мин., актуальный остаток "+expected+" мин.";
   else if(rows.some(row=>!dateValid(row.date)||!dayByDate.get(row.date)?.working_day))reason="Назначение попало на нерабочий день";
   else if(task.due_date&&rows.some(row=>row.date>String(task.due_date).slice(0,10)))reason="Часть назначения выходит за дедлайн";
  }
  if(reason){issues.push({task_id:taskId,title:task?.title||"Задача",type:"stale",reason});continue;}
  validGroups.push({taskId,task,rows});
 }
 const baseline=new Map();
 for(const day of days)for(const task of day.tasks||[]){
  const key=String(task.id),byDate=baseline.get(key)||new Map();
  byDate.set(day.date,(byDate.get(day.date)||0)+Number(task.minutes||0));baseline.set(key,byDate);
 }
 const validIds=new Set(validGroups.map(group=>group.taskId));
 for(const day of days){
  const removed=(day.tasks||[]).filter(task=>validIds.has(String(task.id)));
  day.tasks=(day.tasks||[]).filter(task=>!validIds.has(String(task.id)));
  day.planned_task_minutes=Math.max(0,Number(day.planned_task_minutes)||0)-removed.reduce((sum,task)=>sum+Number(task.minutes||0),0);
 }
 for(const group of validGroups){
  for(const row of group.rows){
   const day=dayByDate.get(row.date);
   day.tasks.push({...group.task,minutes:row.minutes});
   day.planned_task_minutes+=row.minutes;
  }
  const original=baseline.get(group.taskId)||new Map(),saved=new Map(group.rows.map(row=>[row.date,row.minutes]));
  const dates=[...new Set([...original.keys(),...saved.keys()])].sort();
  const daily=dates.map(date=>({date,original_minutes:original.get(date)||0,saved_minutes:saved.get(date)||0,delta_minutes:(saved.get(date)||0)-(original.get(date)||0)})).filter(row=>row.delta_minutes!==0);
  comparison.push({task_id:group.taskId,title:group.task.title||"Задача",daily,moved_minutes:daily.reduce((sum,row)=>sum+Math.max(0,row.delta_minutes),0)});
 }
 for(const group of validGroups){
  for(const row of group.rows){
   const day=dayByDate.get(row.date);
   if(day.working_day&&day.planned_task_minutes>day.available_minutes){
    issues.push({task_id:group.taskId,title:group.task.title||"Задача",type:"capacity",date:row.date,reason:"После учёта календаря и других задач на этот день не хватает "+(day.planned_task_minutes-day.available_minutes)+" мин."});
   }
  }
 }
 for(const day of days){day.task_count=day.tasks.length;day.overloaded=Boolean(day.working_day&&day.planned_task_minutes>day.available_minutes);}
 week.daily_assignments_applied=validGroups.length;
 week.daily_assignment_issues=issues;
 week.daily_assignment_comparison=comparison;
 return week;
}
