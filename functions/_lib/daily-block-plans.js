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
 const start=minuteOfDay(startTime),safeStart=start===null?540:start;\n const prep=Math.max(0,Math.min(120,Math.round(Number(prepBeforeMinutes)||0))),after=Math.max(0,Math.min(120,Math.round(Number(bufferAfterMinutes)||0)));
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
  const conflicts=blocks.filter(block=>(calendarEvents||[]).some(event=>event.status!=="cancelled"&&!["sleep","work"].includes(event.event_type)&&String(event.start_at||"").slice(0,10)===day.date&&block.start_time<String(event.end_at||"").slice(11,16)&&block.end_time>String(event.start_at||"").slice(11,16))).length;
  return {date:day.date,available_minutes:budget,planned_minutes:Math.max(0,Number(day.planned_task_minutes)||0),focus_minutes:focusTotal,break_minutes:breakTotal,blocks,unallocated,overloaded:Boolean(day.overloaded)||unallocated.length>0,calendar_conflicts:conflicts};
 });
}
