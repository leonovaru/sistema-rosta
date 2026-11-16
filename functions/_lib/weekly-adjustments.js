function dateKey(date){return String(date||"").slice(0,10);}
export function buildWeeklyAdjustmentProposals(days,tasks=[]){
 const projected=(days||[]).map(day=>({...day,tasks:(day.tasks||[]).map(item=>({...item}))}));
 const taskById=new Map((tasks||[]).map(task=>[String(task.id),task]));
 const proposals=[];
 for(let i=0;i<projected.length;i++){
  const source=projected[i];
  let excess=Math.max(0,source.planned_task_minutes-source.available_minutes);
  if(!excess)continue;
  const candidates=[...source.tasks].sort((a,b)=>{
   const ta=taskById.get(String(a.id))||{},tb=taskById.get(String(b.id))||{};
   const rank={low:0,medium:1,high:2};
   return (rank[ta.priority]??1)-(rank[tb.priority]??1) || String(tb.due_date||"").localeCompare(String(ta.due_date||""));
  });
  for(const allocation of candidates){
   if(!excess)break;
   const task=taskById.get(String(allocation.id));
   if(!task||task.priority==="high"||!task.due_date||task.due_date<=source.date)continue;
   for(let j=i+1;j<projected.length&&excess>0;j++){
    const destination=projected[j];
    if(!destination.working_day||destination.date>task.due_date)continue;
    const spare=Math.max(0,destination.available_minutes-destination.planned_task_minutes);
    const move=Math.min(excess,allocation.minutes,spare);
    if(!move)continue;
    const existing=destination.tasks.find(item=>String(item.id)===String(allocation.id));
    if(existing)existing.minutes+=move;
    else destination.tasks.push({...allocation,minutes:move});
    destination.planned_task_minutes+=move;
    allocation.minutes-=move;
    source.planned_task_minutes-=move;
    excess-=move;
    proposals.push({task_id:task.id,title:task.title,priority:task.priority||"medium",from:source.date,to:destination.date,minutes:move,due_date:task.due_date,reason:"Освободить перегруженный день; дедлайн задачи остаётся прежним."});
   }
  }
 }
 return {moves:proposals,unresolved_overload_minutes:projected.reduce((sum,day)=>sum+Math.max(0,day.planned_task_minutes-day.available_minutes),0),projected_days:projected};
}
