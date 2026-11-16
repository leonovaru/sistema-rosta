export function summarizeDailyBlockExecution(logs=[],date){
 const rows=(logs||[]).filter(item=>item.block_date===date);
 const done=rows.filter(item=>item.status==="done"),skipped=rows.filter(item=>item.status==="skipped"),interrupted=rows.filter(item=>item.status==="interrupted");
 const sum=(items,key)=>items.reduce((total,item)=>total+Math.max(0,Number(item[key])||0),0);
 const planned=sum(rows,"planned_minutes"),actual=sum(rows,"actual_minutes");
 return {blocks:rows.length,done:done.length,skipped:skipped.length,interrupted:interrupted.length,planned_minutes:planned,actual_minutes:actual,variance_minutes:actual-planned,completion_rate:rows.length?Math.round(done.length/rows.length*100):null};
}
