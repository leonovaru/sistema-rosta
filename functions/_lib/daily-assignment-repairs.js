import { applySavedDailyTaskAllocations } from "./daily-task-assignments.js";

function remaining(task){
 const estimate=Number(task?.estimated_minutes);
 if(!Number.isFinite(estimate)||estimate<=0)return 0;
 return Math.max(0,estimate-(task.status==="doing"?Math.max(0,Number(task.actual_minutes)||0):0));
}

/**
 * Builds confirmation-only repairs for saved schedules that no longer fit.
 * It preserves the user's preferred dates first, then uses later free working days.
 * Existing tasks are never displaced and no data is mutated or persisted.
 */
export function buildDailyAssignmentRepairs(week,allocations=[],tasks=[]){
 const issues=week?.daily_assignment_issues||[];
 const affected=new Set(issues.map(item=>String(item.task_id)));
 if(!affected.size)return {schedules:[],proposals:[],unresolved:[]};
 const taskMap=new Map((tasks||[]).map(task=>[String(task.id),task]));
 const rowsByTask=new Map();
 for(const row of allocations||[]){
  const id=String(row.task_id);
  if(!affected.has(id))continue;
  const list=rowsByTask.get(id)||[];
  list.push({date:String(row.allocation_date),minutes:Math.max(0,Number(row.minutes)||0)});
  rowsByTask.set(id,list);
 }
 const days=week?.days||[];
 const dayMap=new Map(days.map(day=>[day.date,day]));
 const reserved=new Map();
 const schedules=[],proposals=[],unresolved=[];
 for(const taskId of affected){
  const task=taskMap.get(taskId),oldRows=rowsByTask.get(taskId)||[];
  const totalOld=oldRows.reduce((sum,row)=>sum+row.minutes,0);
  const need=remaining(task);
  if(!task||!["todo","doing"].includes(task.status)||!need){
   unresolved.push({task_id:taskId,title:task?.title||"Задача",minutes:need,reason:"Задача неактивна или у неё нет положительного актуального остатка."});
   continue;
  }
  const oldByDate=new Map();
  for(const row of oldRows)oldByDate.set(row.date,(oldByDate.get(row.date)||0)+row.minutes);
  const preferred=[...oldByDate.keys()].sort();
  const candidates=[...preferred,...days.map(day=>day.date).filter(date=>!oldByDate.has(date)).sort()];
  let left=need;
  const next=[];
  for(const date of candidates){
   if(left<=0)break;
   const day=dayMap.get(date);
   if(!day?.working_day||(task.due_date&&date>String(task.due_date).slice(0,10)))continue;
   const otherMinutes=(day.tasks||[]).filter(item=>String(item.id)!==taskId).reduce((sum,item)=>sum+Math.max(0,Number(item.minutes)||0),0);
   const capacity=Math.max(0,Number(day.available_minutes||0)-otherMinutes-(reserved.get(date)||0));
   if(!capacity)continue;
   const minutes=Math.min(left,capacity);
   if(minutes>0){next.push({date,minutes});reserved.set(date,(reserved.get(date)||0)+minutes);left-=minutes;}
  }
  if(left>0){
   unresolved.push({task_id:taskId,title:task.title||"Задача",minutes:left,reason:"Не найдено достаточно свободного времени до дедлайна без перегрузки других задач."});
   continue;
  }
  const oldSorted=oldRows.filter(row=>row.minutes>0).sort((a,b)=>a.date.localeCompare(b.date));
  const nextSorted=next.sort((a,b)=>a.date.localeCompare(b.date));
  const oldMap=new Map();for(const row of oldSorted)oldMap.set(row.date,(oldMap.get(row.date)||0)+row.minutes);
  const nextMap=new Map();for(const row of nextSorted)nextMap.set(row.date,(nextMap.get(row.date)||0)+row.minutes);
  const dates=[...new Set([...oldMap.keys(),...nextMap.keys()])].sort();
  const changes=dates.map(date=>({date,old_minutes:oldMap.get(date)||0,new_minutes:nextMap.get(date)||0,delta:(nextMap.get(date)||0)-(oldMap.get(date)||0)})).filter(row=>row.delta!==0);
  const issueTypes=issues.filter(item=>String(item.task_id)===taskId).map(item=>item.type);
  schedules.push({task_id:taskId,allocations:nextSorted});
  proposals.push({task_id:taskId,title:task.title||"Задача",old_minutes:totalOld,new_minutes:need,changes,reason:issueTypes.includes("capacity")?"Учтена изменившаяся доступность времени в календаре.":"Учтены актуальный остаток задачи, рабочие дни и дедлайн."});
 }
 return {schedules,proposals,unresolved,requires_confirmation:true};
}
