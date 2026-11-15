function rank(task,mode){
 const load=task.cognitive_load||"medium",priority=Number(task.priority_score)||0;
 if(mode==="focus")return (load==="high"?100:load==="medium"?50:0)+priority/100;
 if(mode==="routine")return (load==="low"?100:load==="medium"?50:0)+priority/100;
 return priority+(load==="medium"?8:0);
}
function alternate(tasks){
 const pending=[...tasks].sort((a,b)=>b.priority_score-a.priority_score);
 const result=[];
 while(pending.length){
  const previous=result[result.length-1]?.cognitive_load;
  let index=pending.findIndex(task=>task.cognitive_load!==previous);
  if(index<0)index=0;
  result.push(pending.splice(index,1)[0]);
 }
 return result;
}
export function buildWeeklyAttentionScenarios(days=[]){
 const variants=[
  {id:"focus_first",title:"Сложные задачи в первую очередь",description:"Сначала задачи высокой концентрации, затем более простые. Подходит для дней, когда есть длинный спокойный промежуток.",order:(tasks)=>[...tasks].sort((a,b)=>rank(b,"focus")-rank(a,"focus"))},
  {id:"alternating",title:"Чередование нагрузки",description:"По возможности чередует задачи высокой, умеренной и низкой концентрации, не меняя их сроки и длительность.",order:alternate},
  {id:"routine_batches",title:"Сначала короткие организационные дела",description:"Собирает механические задачи в начале списка, чтобы освободить последующие блоки. Не означает, что так нужно делать каждый день.",order:(tasks)=>[...tasks].sort((a,b)=>rank(b,"routine")-rank(a,"routine"))}
 ];
 return variants.map(variant=>({
  id:variant.id,title:variant.title,description:variant.description,
  days:(days||[]).map(day=>({
   date:day.date,available_minutes:day.available_minutes,planned_task_minutes:day.planned_task_minutes,
   overloaded:day.overloaded,
   tasks:variant.order(day.tasks||[]).map(task=>({
    id:task.id,title:task.title,minutes:task.minutes,
    cognitive_load:task.cognitive_load||"medium",
    cognitive_load_label:task.cognitive_load_label||"Умеренная концентрация",
    priority_label:task.priority_label||"Средний",
    due_date:task.due_date||null
   }))
  })).filter(day=>day.tasks.length)
 }));
}
