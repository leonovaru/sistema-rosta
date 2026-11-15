function minuteOfDay(value){
 const text=String(value||"");
 const time=text.includes("T")?text.slice(text.indexOf("T")+1):text;
 const parts=time.split(":");
 if(parts.length<2)return null;
 const hour=Number(parts[0]),minute=Number(parts[1]);
 return Number.isInteger(hour)&&hour>=0&&hour<24&&Number.isInteger(minute)&&minute>=0&&minute<60?hour*60+minute:null;
}
function clock(total){const value=((total%1440)+1440)%1440;return String(Math.floor(value/60)).padStart(2,"0")+":"+String(value%60).padStart(2,"0");}
export function buildDailyBlockPlans(days=[],{focusMinutes=50,breakMinutes=10,startTime="09:00",prepBeforeMinutes=0,bufferAfterMinutes=0,calendarEvents=[]}={}){
 const focus=Math.max(15,Math.min(120,Math.round(Number(focusMinutes)||50))),rest=Math.max(3,Math.min(30,Math.round(Number(breakMinutes)||10)));
 const start=minuteOfDay(startTime),safeStart=start===null?540:start;
 const prep=Math.max(0,Math.min(120,Math.round(Number(prepBeforeMinutes)||0))),after=Math.max(0,Math.min(120,Math.round(Number(bufferAfterMinutes)||0)));
 return (days||[]).filter(day=>Array.isArray(day.tasks)&&day.tasks.length).map(day=>{
  const gross=Math.max(0,Number(day.gross_capacity_minutes)||Number(day.available_minutes)||0),budget=Math.max(0,Number(day.available_minutes)||0);
  const windowEnd=safeStart+gross;
  const events=(calendarEvents||[]).filter(event=>event.status!=="cancelled"&& !["sleep","work"].includes(event.event_type)&&String(event.start_at||"").slice(0,10)===day.date)
   .map(event=>({start:minuteOfDay(event.start_at),end:minuteOfDay(event.end_at)}))
   .filter(event=>event.start!==null&&event.end!==null&&event.end>event.start)
   .map(event=>({start:Math.max(safeStart,event.start-prep),end:Math.min(windowEnd,event.end+after)}))
   .filter(event=>event.end>safeStart&&event.start<windowEnd).sort((a,b)=>a.start-b.start);
  const gaps=[];let cursor=safeStart;
  for(const event of events){if(event.start>cursor)gaps.push({start:cursor,end:event.start});cursor=Math.max(cursor,event.end);}
  if(cursor<windowEnd)gaps.push({start:cursor,end:windowEnd});
  let remainingBudget=budget,focusSinceBreak=0;const blocks=[],unallocated=[];
  let gapIndex=0,activeCursor=gaps[0]?.start??safeStart,gapRemaining=gaps[0]?gaps[0].end-activeCursor:0;
  const addBlock=(type,minutes,task)=>{blocks.push({type,minutes,start_time:clock(activeCursor),end_time:clock(activeCursor+minutes),...(task?{task_id:task.id||null,title:task.title||"Задача",cognitive_load:task.cognitive_load||"medium",priority_label:task.priority_label||null}:{title:"Перерыв"})});activeCursor+=minutes;remainingBudget-=minutes;};
  const advanceGap=()=>{gapIndex++;if(gaps[gapIndex]){activeCursor=gaps[gapIndex].start;gapRemaining=gaps[gapIndex].end-activeCursor;focusSinceBreak=0;}else gapRemaining=0;};
  for(const task of day.tasks){let remaining=Math.max(0,Number(task.minutes)||0);
   while(remaining>0&&remainingBudget>0&&gapIndex<gaps.length){
    if(focusSinceBreak>=focus){if(gapRemaining>=rest){addBlock("break",rest);gapRemaining-=rest;focusSinceBreak=0;continue;}advanceGap();continue;}
    const chunk=Math.min(remaining,remainingBudget,gapRemaining,focus-focusSinceBreak);
    if(chunk<=0){advanceGap();continue;}
    addBlock("focus",chunk,task);remaining-=chunk;gapRemaining-=chunk;focusSinceBreak+=chunk;
   }
   if(remaining>0)unallocated.push({task_id:task.id||null,title:task.title||"Задача",minutes:remaining});
  }
  const focusTotal=blocks.filter(x=>x.type==="focus").reduce((sum,x)=>sum+x.minutes,0),breakTotal=blocks.filter(x=>x.type==="break").reduce((sum,x)=>sum+x.minutes,0);
  const conflicts=blocks.filter(block=>events.some(event=>block.start_time<clock(event.end)&&block.end_time>clock(event.start))).length;
  return {date:day.date,available_minutes:budget,planned_minutes:Math.max(0,Number(day.planned_task_minutes)||0),focus_minutes:focusTotal,break_minutes:breakTotal,blocks,unallocated,overloaded:Boolean(day.overloaded)||unallocated.length>0,calendar_conflicts:conflicts};
 });
}

const DAILY_BLOCK_VARIANTS=[
 {key:"priority",title:"Приоритетный",description:"Сначала срочные и важные задачи"},
 {key:"focus",title:"Концентрация",description:"Сначала задачи с высокой когнитивной нагрузкой"},
 {key:"flexible",title:"Гибкий",description:"Сначала короткая рутина, затем длинные сложные блоки"}
];

function summarizeDailyBlockScenario(days,plans){
 const sourceTasks=(days||[]).flatMap(day=>day.tasks||[]);
 const planByDate=new Map((plans||[]).map(plan=>[plan.date,plan]));
 let totalTasks=0,completedTasks=0,partialTasks=0,unplacedTasks=0,highPriorityTotal=0,highPriorityCompleted=0;
 let focusMinutes=0,breakMinutes=0,availableMinutes=0,unallocatedMinutes=0,unusedMinutes=0,overloadedDays=0;
 for(const day of days||[]){
  const plan=planByDate.get(day.date);if(!plan)continue;
  const tasks=day.tasks||[],unallocatedById=new Map((plan.unallocated||[]).map(item=>[String(item.task_id),item.minutes]));
  const placedIds=new Set((plan.blocks||[]).filter(block=>block.type==="focus"&&block.task_id!=null).map(block=>String(block.task_id)));
  for(const task of tasks){
   totalTasks++;
   const id=String(task.id),remaining=Number(unallocatedById.get(id)||0),placed=placedIds.has(id);
   if(remaining<=0){completedTasks++;}else if(placed){partialTasks++;}else{unplacedTasks++;}
   const isHigh=task.priority==="high"||task.priority_label==="Высокий"||Number(task.priority_score)>=60;
   if(isHigh){highPriorityTotal++;if(remaining<=0)highPriorityCompleted++;}
  }
  focusMinutes+=plan.focus_minutes||0;breakMinutes+=plan.break_minutes||0;availableMinutes+=plan.available_minutes||0;
  unallocatedMinutes+=(plan.unallocated||[]).reduce((sum,item)=>sum+Number(item.minutes||0),0);
  unusedMinutes+=Math.max(0,Number(plan.available_minutes||0)-Number(plan.focus_minutes||0)-Number(plan.break_minutes||0));
  if(plan.overloaded)overloadedDays++;
 }
 return {total_tasks:totalTasks,completed_tasks:completedTasks,partially_scheduled_tasks:partialTasks,unplaced_tasks:unplacedTasks,high_priority_tasks:highPriorityTotal,high_priority_completed:highPriorityCompleted,focus_minutes:focusMinutes,break_minutes:breakMinutes,available_minutes:availableMinutes,unallocated_minutes:unallocatedMinutes,unused_minutes:unusedMinutes,overloaded_days:overloadedDays,cross_day_moves:0};
}

export function buildDailyBlockScenarios(days=[],options={}){
 const scenarios=DAILY_BLOCK_VARIANTS.map(variant=>{
  const ordered=(days||[]).map(day=>({...day,tasks:[...(day.tasks||[])].sort((a,b)=>{
   const score=(task)=>Number(task.score)||0;
   const load=(task)=>task.cognitive_load==="high"?3:task.cognitive_load==="medium"?2:1;
   const minutes=(task)=>Math.max(0,Number(task.minutes)||0);
   if(variant.key==="priority")return score(b)-score(a)||(Number(a.urgency_days??999)-Number(b.urgency_days??999));
   if(variant.key==="focus")return load(b)-load(a)||score(b)-score(a)||minutes(b)-minutes(a);
   return load(a)-load(b)||(load(a)===1?minutes(a)-minutes(b):minutes(b)-minutes(a))||score(b)-score(a);
  })}));
  const plans=buildDailyBlockPlans(ordered,options);
  return {...variant,plans,summary:summarizeDailyBlockScenario(ordered,plans)};
 });
 return scenarios;
}
