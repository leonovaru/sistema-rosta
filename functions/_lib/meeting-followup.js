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

export function listMeetingFollowups(meetings=[],today=""){
 return (Array.isArray(meetings)?meetings:[]).flatMap(meeting=>(Array.isArray(meeting.agreements)?meeting.agreements:[]).map((agreement,index)=>{
  const dueDate=agreement.task_due_date||agreement.due_date||null;
  const status=agreement.task_status||null;
  return {meeting_id:meeting.id||null,meeting_title:meeting.title||"Встреча",meeting_date:meeting.meeting_date||null,agreement_index:index,task:agreement.task||"",assignee:agreement.assignee||null,task_id:agreement.task_id||null,task_title:agreement.task_title||null,task_status:status,due_date:dueDate,task_missing:!agreement.task_id,overdue:Boolean(agreement.task_id&&status!=="done"&&dueDate&&today&&dueDate<today),completed:status==="done"};
 })).filter(item=>!item.completed);
}

export function listMeetingOpenQuestions(meetings=[]){
 return (Array.isArray(meetings)?meetings:[]).flatMap(meeting=>(Array.isArray(meeting.open_questions)?meeting.open_questions:[]).map(question=>({meeting_id:meeting.id||null,meeting_title:meeting.title||"Встреча",meeting_date:meeting.meeting_date||null,question})));
}
