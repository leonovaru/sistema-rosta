export function remainingMinutesAfterBlockLogs(tasks=[],logs=[],date){
 const completed=new Map();
 for(const log of logs||[]){
  if(log.block_date!==date||!["done","interrupted"].includes(log.status))continue;
  const id=String(log.task_id),minutes=Math.max(0,Number(log.actual_minutes)||0);
  completed.set(id,(completed.get(id)||0)+minutes);
 }
 return (tasks||[]).map(task=>({...task,minutes:Math.max(0,Math.max(0,Number(task.minutes)||0)-(completed.get(String(task.id))||0))})).filter(task=>task.minutes>0);
}
