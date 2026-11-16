import { buildDailyBlockPlans } from "./daily-block-plans.js";

function remainingByTask(plan){return new Map((plan?.unallocated||[]).map(item=>[String(item.task_id),Number(item.minutes)||0]));}
function scheduledByTask(plan){
 const result=new Map();
 for(const block of plan?.blocks||[])if(block.type==="focus"&&block.task_id!=null)result.set(String(block.task_id),(result.get(String(block.task_id))||0)+Number(block.minutes||0));
 return result;
}
function priorityRank(task){return task.priority==="high"?3:task.priority==="medium"?2:1;}
function taskOrder(a,b){return priorityRank(b)-priorityRank(a)||(Number(b.priority_score)||0)-(Number(a.priority_score)||0)||String(a.due_date||"9999").localeCompare(String(b.due_date||"9999"));}
function planDay(day,tasks,options){return buildDailyBlockPlans([{...day,tasks}],options)[0]||{unallocated:[],blocks:[]};}

/**
 * Suggests moving a daily allocation (not the whole task) to a later working day.
 * No task dates or persistent assignments are changed.
 */
export function buildDailyReallocationProposals(days=[],options={}){
 const projected=(days||[]).map(day=>({...day,tasks:(day.tasks||[]).map(task=>({...task}))}));
 const proposals=[];
 for(let sourceIndex=0;sourceIndex<projected.length;sourceIndex++){
  const source=projected[sourceIndex];
  const sourcePlan=planDay(source,source.tasks,options);
  const overflowIds=new Set((sourcePlan.unallocated||[]).map(item=>String(item.task_id)));
  const candidates=source.tasks.filter(task=>task.id!=null&&overflowIds.has(String(task.id))&&task.priority!=="high"&&Number(task.minutes)>0).sort(taskOrder);
  for(const task of candidates){
   const dueDate=task.due_date?String(task.due_date).slice(0,10):null;
   const allocationMinutes=Number(task.minutes);
   for(const destination of projected.slice(sourceIndex+1)){
    if(!destination.working_day||destination.date<=source.date||(dueDate&&destination.date>dueDate))continue;
    const baseline=planDay(destination,destination.tasks,options);
    const baselineRemaining=remainingByTask(baseline),baselineScheduled=scheduledByTask(baseline);
    const existing=destination.tasks.find(item=>String(item.id)===String(task.id));
    const candidateTasks=destination.tasks.map(item=>String(item.id)===String(task.id)?{...item,minutes:Number(item.minutes||0)+allocationMinutes}:{...item});
    if(!existing)candidateTasks.push({...task,minutes:allocationMinutes});
    candidateTasks.sort(taskOrder);
    const candidatePlan=planDay(destination,candidateTasks,options);
    const afterRemaining=remainingByTask(candidatePlan),afterScheduled=scheduledByTask(candidatePlan);
    const scheduledIncrease=(afterScheduled.get(String(task.id))||0)-(baselineScheduled.get(String(task.id))||0);
    if(scheduledIncrease<allocationMinutes)continue;
    const worsened=destination.tasks.some(item=>Number(afterRemaining.get(String(item.id))||0)>Number(baselineRemaining.get(String(item.id))||0));
    if(worsened)continue;
    source.tasks=source.tasks.filter(item=>String(item.id)!==String(task.id));
    destination.tasks=candidateTasks;
    proposals.push({
     task_id:task.id,title:task.title||"Задача",from:source.date,to:destination.date,
     minutes:allocationMinutes,due_date:dueDate,priority:task.priority||"medium",
     cognitive_load:task.cognitive_load||"medium",
     reason:"Эта дневная часть задачи не помещается в исходный день; в выбранном дне она помещается без вытеснения уже распределённых задач."
    });
    break;
   }
  }
 }
 const remaining=[];
 for(const day of projected){
  const plan=planDay(day,day.tasks,options);
  for(const item of plan.unallocated||[])remaining.push({date:day.date,task_id:item.task_id,title:item.title,minutes:item.minutes});
 }
 const movedIds=new Set(proposals.map(item=>String(item.task_id)));
 const schedules=[...movedIds].map(taskId=>({task_id:taskId,allocations:projected.flatMap(day=>(day.tasks||[]).filter(task=>String(task.id)===taskId).map(task=>({date:day.date,minutes:Number(task.minutes)||0}))).filter(item=>item.minutes>0)}));
 return {proposals,schedules,remaining,summary:{proposed_moves:proposals.length,remaining_unallocated_minutes:remaining.reduce((sum,item)=>sum+item.minutes,0)}};
}
