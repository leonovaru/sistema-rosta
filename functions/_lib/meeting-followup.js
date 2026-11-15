export function summarizeMeetingFollowup(meetings=[],today=""){
 const agreements=(Array.isArray(meetings)?meetings:[]).flatMap(meeting=>(Array.isArray(meeting.agreements)?meeting.agreements:[]));
 return {
  agreements_total:agreements.length,
  linked_tasks:agreements.filter(item=>item.task_id).length,
  completed:agreements.filter(item=>item.task_status==="done").length,
  overdue:agreements.filter(item=>item.task_id&&item.task_status!=="done"&&(item.task_due_date||item.due_date)&&today&&(item.task_due_date||item.due_date)<today).length,
  pending:agreements.filter(item=>!item.task_id||item.task_status!=="done").length,
  open_questions:(Array.isArray(meetings)?meetings:[]).reduce((sum,item)=>sum+(Array.isArray(item.open_questions)?item.open_questions.length:0),0)
 };
}
