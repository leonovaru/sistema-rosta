import { json, requireUser, readJson, newId } from "../../_lib/auth.js";

function parseJson(value) {
  if(typeof value!=="string")return value;
  const clean=value.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
  try{return JSON.parse(clean);}catch{return null;}
}

export async function onRequestPost({request,env}) {
  const user=await requireUser(request,env);
  if(!user)return json({error:"Необходим вход"},401);
  const body=await readJson(request)||{},projectId=String(body.project_id||"");
  const project=await env.DB.prepare("SELECT p.*,c.name AS client_name,d.title AS direction_title FROM projects p LEFT JOIN clients c ON c.id=p.client_id LEFT JOIN directions d ON d.id=p.direction_id WHERE p.id=? AND p.user_id=?").bind(projectId,user.id).first();
  if(!project)return json({error:"Проект не найден"},404);
  if(body.action==="save") {
    if(!Array.isArray(body.steps)||!body.steps.length||body.steps.length>30)return json({error:"Проверь список задач"},400);
    const tasks=body.steps.map((step,i)=>({id:newId(),title:String(step.title||"").trim().slice(0,240),description:String(step.description||"").slice(0,2000),minutes:Math.max(5,Math.min(10000,Math.round(Number(step.minutes)||30))),priority:["low","medium","high"].includes(step.priority)?step.priority:"medium",due_date:step.due_date||null,sort_order:i})).filter(x=>x.title);
    if(!tasks.length)return json({error:"Нет задач для сохранения"},400);
    await env.DB.batch(tasks.map(t=>env.DB.prepare("INSERT INTO tasks (id,user_id,direction_id,client_id,project_id,title,description,due_date,priority,estimated_minutes) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(t.id,user.id,project.direction_id,project.client_id,project.id,t.title,t.description,t.due_date,t.priority,t.minutes)));
    return json({ok:true,created:tasks.length});
  }
  if(!env.AI)return json({error:"Для генерации плана подключи Workers AI binding AI."},503);
  const prompt=JSON.stringify({client:project.client_name,direction:project.direction_title,project:project.title,description:project.description,expected_result:project.expected_result,deadline:project.deadline,budget:project.budget});
  try {
    const response=await env.AI.run("@cf/google/gemma-4-26b-a4b-it",{
      messages:[
        {role:"system",content:"Ты помощник по проектному управлению. Разложи описание проекта на 4–15 реалистичных, конкретных задач. Не выдумывай неизвестные требования: отмечай вопросы к заказчику в description задачи или отдельной задачей. Учитывай ожидаемый результат и срок. Каждая задача должна иметь проверяемый результат, оценку активного времени в минутах и приоритет. Верни только JSON {steps:[{title,description,minutes,priority}]}. Ответ на русском."},
        {role:"user",content:prompt}
      ],max_tokens:1800,temperature:0.2
    });
    const parsed=parseJson(response?.response);
    if(!Array.isArray(parsed?.steps)||parsed.steps.length<1)throw new Error("Invalid response");
    const steps=parsed.steps.slice(0,15).map(s=>({title:String(s.title||"").trim().slice(0,240),description:String(s.description||"").trim().slice(0,1000),minutes:Math.max(5,Math.min(10000,Math.round(Number(s.minutes)||30))),priority:["low","medium","high"].includes(s.priority)?s.priority:"medium"})).filter(s=>s.title);
    return json({ok:true,source:"ai",steps});
  } catch {
    return json({error:"Не удалось подготовить план проекта. Попробуй ещё раз или составь задачи вручную."},502);
  }
}
