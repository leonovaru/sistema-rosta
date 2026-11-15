export function buildDailyBlockPlans(days=[],{focusMinutes=50,breakMinutes=10}={}) {
 const focus=Math.max(15,Math.min(120,Math.round(Number(focusMinutes)||50)));
 const rest=Math.max(3,Math.min(30,Math.round(Number(breakMinutes)||10)));
 return (days||[]).filter(day=>Array.isArray(day.tasks)&&day.tasks.length).map(day=>{
  let capacity=Math.max(0,Number(day.available_minutes)||0),focusSinceBreak=0;
  const blocks=[],unallocated=[];
  for(const task of day.tasks){
   let remaining=Math.max(0,Number(task.minutes)||0);
   while(remaining>0&&capacity>0){
    if(focusSinceBreak>=focus&&capacity>=rest+1){
     blocks.push({type:"break",minutes:rest,title:"Перерыв"});
     capacity-=rest;focusSinceBreak=0;
     continue;
    }
    const untilBreak=focus-focusSinceBreak;
    const chunk=Math.min(remaining,capacity,untilBreak>0?untilBreak:remaining);
    if(chunk<=0)break;
    blocks.push({type:"focus",minutes:chunk,task_id:task.id||null,title:task.title||"Задача",cognitive_load:task.cognitive_load||"medium",priority_label:task.priority_label||null});
    remaining-=chunk;capacity-=chunk;focusSinceBreak+=chunk;
   }
   if(remaining>0)unallocated.push({task_id:task.id||null,title:task.title||"Задача",minutes:remaining});
  }
  const focusTotal=blocks.filter(block=>block.type==="focus").reduce((sum,block)=>sum+block.minutes,0);
  const breakTotal=blocks.filter(block=>block.type==="break").reduce((sum,block)=>sum+block.minutes,0);
  return {date:day.date,available_minutes:Math.max(0,Number(day.available_minutes)||0),planned_minutes:Math.max(0,Number(day.planned_task_minutes)||0),focus_minutes:focusTotal,break_minutes:breakTotal,blocks,unallocated,overloaded:Boolean(day.overloaded)||unallocated.length>0};
 });
}
