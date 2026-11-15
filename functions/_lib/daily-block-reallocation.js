import { buildDailyBlockPlans } from "./daily-block-plans.js";

function remainingByTask(plan){
 return new Map((plan?.unallocated||[]).map(item=>[String(item.task_id),Number(item.minutes)||0]));
}
function priorityRank(task){return task.priority==="high"?3:task.priority==="medium"?2:1;}
function taskOrder(a,b){
 return priorityRank(b)-priorityRank(a)||(Number(b.priority_score)||0)-(Number(a.priority_score)||0)||String(a.due_date||"9999").localeCompare(String(b.due_date||"9999"));
}
function planDay(day,tasks,options){
 return buildDailyBlockPlans([{...day,tasks}],options)[0]||{unallocated:[],blocks:[],focus_minutes:0,break_minutes:0};
}

/**
 * Proposes whole-task moves to later working days. It never changes input data.
 * A destination is accepted only when the moved task fits completely and no
 * previously scheduled destination task becomes less schedulable.
 */
export function buildDailyReallocationProposals(days=[],options={}){
 const projected=(days||[]).map(day=>({...day,tasks:(day.tasks||[]).map(task=>({...task}))}));
 const proposals=[],moved=new Set();
 for(let sourceIndex=0;sourceIndex<projected.length;sourceIndex++){
  const source=projected[sourceIndex];
  let sourcePlan=planDay(source,source.tasks,options);
  const overflowIds=new Set((sourcePlan.unallocated||[]).map(item=>String(item.task_id)));
  const candidates=source.tasks.filter(task=>overflowIds.has(String(task.id))&&task.id!=null&&!moved.has(String(task.id))&&task.priority!=="high"&&Number(task.minutes)>0).sort(taskOrder);
  for(const task of candidates){
   const dueDate=task.due_date?String(task.due_date).slice(0,10):null;
   let selected=null;
   const destinations=projected.slice(sourceIndex+1).filter(day=>day.working_day&&day.date>source.date&&(!dueDate||day.date<=dueDate));
   for(const destination of destinations){
    const baseline=planDay(destination,destination.tasks,options);
    const baselineRemaining=remainingByTask(baseline);
    const candidateTasks=[...destination.tasks,{...task}].sort(taskOrder);
    const candidatePlan=planDay(destination,candidateTasks,options);
    const afterRemaining=remainingByTask(candidatePlan);
    const movedRemaining=Number(afterRemaining.get(String(task.id))||0);
    if(movedRemaining>0)continue;
    const worsened=destination.tasks.some(existing=>Number(afterRemaining.get(String(existing.id))||0)>Number(baselineRemaining.get(String(existing.id))||0));
    if(worsened)continue;
    selected={destination,candidateTasks};
    break;
   }
   if(!selected)continue;
   source.tasks=source.tasks.filter(item=>String(item.id)!==String(task.id));
   selected.destination.tasks=selected.candidateTasks;
   moved.add(String(task.id));
   proposals.push({
    task_id:task.id,title:task.title||"Задача",from:source.date,to:selected.destination.date,
    minutes:Number(task.minutes),due_date:dueDate,priority:task.priority||"medium",
    cognitive_load:task.cognitive_load||"medium",
    reason:"В исходном дне задача не помещается целиком; в выбранном дне она помещается без вытеснения уже распределённых задач."
   });
   sourcePlan=planDay(source,source.tasks,options);
  }
 }
 const remaining=[];
 for(const day of projected){
  const plan=planDay(day,day.tasks,options);
  for(const item of plan.unallocated||[])remaining.push({date:day.date,task_id:item.task_id,title:item.title,minutes:item.minutes});
 }
 return {proposals,remaining,summary:{proposed_moves:proposals.length,remaining_unallocated_minutes:remaining.reduce((sum,item)=>sum+item.minutes,0)}};
}
