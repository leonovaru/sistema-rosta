import { json, requireUser, readJson, newId } from "../../_lib/auth.js";

function parseJson(value){
 if(typeof value!=="string")return value;
 const cleaned=value.replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,"");
 try{return JSON.parse(cleaned);}catch{return null;}
}
function localDate(timeZone){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const v=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return v.year+"-"+v.month+"-"+v.day;
}
export function normalizeTaskTitle(value){return String(value||"").toLocaleLowerCase("ru-RU").replace(/ё/g,"е").replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");}
export function taskSimilarity(a,b){const x=new Set(normalizeTaskTitle(a).split(" ").filter(w=>w.length>2)),y=new Set(normalizeTaskTitle(b).split(" ").filter(w=>w.length>2));if(!x.size||!y.size)return 0;const intersection=[...x].filter(w=>y.has(w)).length;return intersection/Math.max(x.size,y.size);}
export function appendTaskDescription(existing,addition){return [String(existing||"").trim(),String(addition||"").trim()].filter(Boolean).filter((value,index,all)=>all.findIndex(x=>x.toLocaleLowerCase("ru-RU")===value.toLocaleLowerCase("ru-RU"))===index).join("\n\n").slice(0,2000);}
export function buildProjectContext(projects=[],tasks=[],steps=[]){
 const byTask=new Map();
 for(const step of steps){if(!byTask.has(step.task_id))byTask.set(step.task_id,[]);byTask.get(step.task_id).push({title:step.title,status:step.status});}
 return projects.slice(0,30).map(project=>{
  const projectTasks=tasks.filter(task=>task.project_id===project.id);
  return {
   id:project.id,title:project.title,description:project.description||"",expected_result:project.expected_result||"",deadline:project.deadline||null,status:project.status,
   open_task_count:projectTasks.length,
   open_tasks:projectTasks.slice(0,20).map(task=>({id:task.id,title:task.title,description:task.description||"",status:task.status,priority:task.priority,due_date:task.due_date||null,parent_task_id:task.parent_task_id||null,steps:(byTask.get(task.id)||[]).slice(0,8)}))
  };
 });
}

function safeDate(value){
 if(!value)return null;
 const s=String(value);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
 const d=new Date(s+"T00:00:00Z");
 return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==s?null:s;
}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);
 if(!user)return json({error:"Необходим вход"},401);
 const body=await readJson(request)||{};
 if(body.action==="save"){
  const workspaceItems=Array.isArray(body.workspace_items)?body.workspace_items.slice(0,8):[];
  const requestedTasks=Array.isArray(body.tasks)?body.tasks:[];
  if(requestedTasks.length>15||(!requestedTasks.length&&!workspaceItems.length))return json({error:"Проверь список изменений"},400);
  const [dirs,clients,projects,areas,openTasks]=await Promise.all([
   env.DB.prepare("SELECT id FROM directions WHERE user_id=?").bind(user.id).all(),
   env.DB.prepare("SELECT id FROM clients WHERE user_id=?").bind(user.id).all(),
   env.DB.prepare("SELECT id FROM projects WHERE user_id=?").bind(user.id).all(),
   env.DB.prepare("SELECT id FROM life_areas WHERE user_id=?").bind(user.id).all(),
   env.DB.prepare("SELECT id FROM tasks WHERE user_id=? AND status!='done'").bind(user.id).all()
  ]);
  const allowed={direction_id:new Set(dirs.results.map(x=>x.id)),client_id:new Set(clients.results.map(x=>x.id)),project_id:new Set(projects.results.map(x=>x.id)),life_area_id:new Set(areas.results.map(x=>x.id))};
  const allowedTaskIds=new Set(openTasks.results.map(x=>x.id));
  const prepared=requestedTasks.map((t,i)=>({
   id:newId(),title:String(t.title||"").trim().slice(0,240),description:String(t.description||"").trim().slice(0,2000),
   direction_id:allowed.direction_id.has(t.direction_id)?t.direction_id:null,
   client_id:allowed.client_id.has(t.client_id)?t.client_id:null,
   project_id:allowed.project_id.has(t.project_id)?t.project_id:null,
   project_draft_index:Number.isInteger(t.project_draft_index)&&t.project_draft_index>=0&&t.project_draft_index<workspaceItems.filter(x=>x.type==="project").length?t.project_draft_index:null,
   client_draft_index:Number.isInteger(t.client_draft_index)&&t.client_draft_index>=0&&t.client_draft_index<workspaceItems.filter(x=>x.type==="client").length?t.client_draft_index:null,
   life_area_id:allowed.life_area_id.has(t.life_area_id)?t.life_area_id:null,
   due_date:safeDate(t.due_date),priority:["low","medium","high"].includes(t.priority)?t.priority:"medium",
   estimated_minutes:Number.isInteger(Number(t.estimated_minutes))&&Number(t.estimated_minutes)>=5&&Number(t.estimated_minutes)<=10000?Number(t.estimated_minutes):null,
   parent_index:Number.isInteger(t.parent_index)&&t.parent_index>=0&&t.parent_index<i?t.parent_index:null,
   operation:t.operation==="update"&&allowedTaskIds.has(t.target_task_id)?"update":"create",
   target_task_id:allowedTaskIds.has(t.target_task_id)?t.target_task_id:null
  }));
  if(prepared.some(t=>!t.title))return json({error:"У каждой задачи должно быть название. Проверь пустые строки в черновике."},400);
  if(prepared.some(t=>t.parent_index!==null&&t.parent_index>=prepared.length))return json({error:"Проверь связь подзадач с родительскими задачами."},400);
  if(!prepared.length&&!workspaceItems.length)return json({error:"Не найдено изменений для сохранения"},400);
  const statements=[];
  let created=0,updated=0,createdClients=0,createdProjects=0,updatedProjects=0;
  const newClientIds=[],newProjectIds=[],newProjectMeta=new Map();
  for(const item of workspaceItems.filter(x=>x.type==="client")){
   const name=String(item.name||"").trim().slice(0,160);
   if(!name)return json({error:"У нового клиента должно быть название"},400);
   const directionId=allowed.direction_id.has(item.direction_id)?item.direction_id:null;
   const duplicate=await env.DB.prepare("SELECT id FROM clients WHERE user_id=? AND lower(name)=lower(?) AND status!='closed'").bind(user.id,name).first();
   if(duplicate)return json({error:"Клиент «"+name+"» уже существует. Выбери его в распределении задач."},409);
   const id=newId();newClientIds.push(id);
   statements.push(env.DB.prepare("INSERT INTO clients (id,user_id,direction_id,name,contact,status,notes) VALUES (?,?,?,?,?,?,?)").bind(id,user.id,directionId,name,String(item.contact||"").slice(0,240),"lead",String(item.notes||"").slice(0,3000)));
   createdClients++;
  }
  for(const item of workspaceItems.filter(x=>x.type==="project_update")){
   const projectId=String(item.project_id||"");
   const current=await env.DB.prepare("SELECT id,client_id,direction_id FROM projects WHERE id=? AND user_id=? AND status NOT IN ('done','archived')").bind(projectId,user.id).first();
   if(!current)return json({error:"Проект для изменения больше не найден или уже закрыт. Повтори разбор."},409);
   const allowedFields=["title","description","expected_result","deadline","status","client_id","direction_id"];
   const changes=item.changes&&typeof item.changes==="object"?item.changes:{};
   const sets=[],values=[];
   for(const field of allowedFields){if(!Object.prototype.hasOwnProperty.call(changes,field))continue;let value=changes[field];
    if(field==="title"){value=String(value||"").trim().slice(0,180);if(!value)return json({error:"Название проекта не может быть пустым"},400);}
    if(field==="description")value=String(value||"").slice(0,5000);
    if(field==="expected_result")value=String(value||"").slice(0,2000);
    if(field==="deadline"){value=safeDate(value);if(!value)return json({error:"Проверь новый срок проекта"},400);}
    if(field==="status"&&!["draft","active","paused","done","archived"].includes(value))return json({error:"Недопустимый статус проекта"},400);
    if(field==="client_id"&&value!==null&&!allowed.client_id.has(value))return json({error:"Выбранный клиент недоступен"},400);
    if(field==="direction_id"&&value!==null&&!allowed.direction_id.has(value))return json({error:"Выбранное направление недоступно"},400);
    sets.push(field+"=?");values.push(value);
   }
   if(!sets.length)return json({error:"Не указано, что именно изменить в проекте"},400);
   const nextClient=Object.prototype.hasOwnProperty.call(changes,"client_id")?changes.client_id:current.client_id;
   const nextDirection=Object.prototype.hasOwnProperty.call(changes,"direction_id")?changes.direction_id:current.direction_id;
   if(nextClient&&nextDirection){const client=await env.DB.prepare("SELECT direction_id FROM clients WHERE id=? AND user_id=?").bind(nextClient,user.id).first();if(client?.direction_id&&client.direction_id!==nextDirection)return json({error:"Клиент и проект должны относиться к одному направлению"},400);}
   sets.push("updated_at=CURRENT_TIMESTAMP");values.push(projectId,user.id);
   statements.push(env.DB.prepare("UPDATE projects SET "+sets.join(",")+" WHERE id=? AND user_id=?").bind(...values));
   updatedProjects++;
  }
  for(const item of workspaceItems.filter(x=>x.type==="project")){
   const title=String(item.title||"").trim().slice(0,180);
   if(!title)return json({error:"У нового проекта должно быть название"},400);
   const clientId=Number.isInteger(item.client_draft_index)&&newClientIds[item.client_draft_index]?newClientIds[item.client_draft_index]:(allowed.client_id.has(item.client_id)?item.client_id:null);
   const client=clientId?await env.DB.prepare("SELECT direction_id FROM clients WHERE id=? AND user_id=?").bind(clientId,user.id).first():null;
   const directionId=allowed.direction_id.has(item.direction_id)?item.direction_id:(client?.direction_id||null);
   if(client?.direction_id&&directionId&&client.direction_id!==directionId)return json({error:"Проект и клиент должны относиться к одному направлению"},400);
   const duplicate=await env.DB.prepare("SELECT id FROM projects WHERE user_id=? AND lower(title)=lower(?) AND status NOT IN ('done','archived')").bind(user.id,title).first();
   if(duplicate)return json({error:"Проект «"+title+"» уже существует. Выбери его в распределении задач."},409);
   const id=newId();newProjectIds.push(id);newProjectMeta.set(id,{client_id:clientId,direction_id:directionId});
   statements.push(env.DB.prepare("INSERT INTO projects (id,user_id,client_id,direction_id,title,description,expected_result,deadline,budget,status) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(id,user.id,clientId,directionId,title,String(item.description||"").slice(0,5000),String(item.expected_result||"").slice(0,2000),safeDate(item.deadline),"0","draft"));
   createdProjects++;
  }
  for(let i=0;i<prepared.length;i++){
   const t=prepared[i];
   if(t.operation==="update"&&t.target_task_id){
    const current=await env.DB.prepare("SELECT id,title,description FROM tasks WHERE id=? AND user_id=? AND status!='done'").bind(t.target_task_id,user.id).first();
    if(!current)return json({error:"Задача для обновления больше не найдена. Повтори разбор."},409);
    const mergedDescription=appendTaskDescription(current.description,t.description);
    await env.DB.prepare("UPDATE tasks SET description=?,due_date=COALESCE(?,due_date) WHERE id=? AND user_id=? AND status!='done'")
     .bind(mergedDescription,t.due_date,t.target_task_id,user.id).run();
    updated++;
    continue;
   }
   if(Number.isInteger(t.project_draft_index)&&newProjectIds[t.project_draft_index])t.project_id=newProjectIds[t.project_draft_index];
   if(Number.isInteger(t.client_draft_index)&&newClientIds[t.client_draft_index])t.client_id=newClientIds[t.client_draft_index];
   const parent=t.parent_index===null?null:prepared[t.parent_index];
   if(parent){t.direction_id=t.direction_id||parent.direction_id;t.client_id=t.client_id||parent.client_id;t.project_id=t.project_id||parent.project_id;t.life_area_id=t.life_area_id||parent.life_area_id;}
   if(t.project_id){
    const p=newProjectMeta.get(t.project_id)||await env.DB.prepare("SELECT client_id,direction_id FROM projects WHERE id=? AND user_id=?").bind(t.project_id,user.id).first();
    if(!p)return json({error:"Проект в одной из задач больше не доступен. Обнови разбор."},409);
    t.client_id=p.client_id;t.direction_id=p.direction_id;
   }
   if(parent&&(t.project_id!==parent.project_id||t.life_area_id!==parent.life_area_id||t.client_id!==parent.client_id||t.direction_id!==parent.direction_id))return json({error:"Подзадача должна относиться к той же области, что и родительская задача"},400);
   statements.push(env.DB.prepare("INSERT INTO tasks (id,user_id,direction_id,client_id,project_id,life_area_id,parent_task_id,title,description,due_date,priority,estimated_minutes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(t.id,user.id,t.direction_id,t.client_id,t.project_id,t.life_area_id,parent?.id||null,t.title,t.description,t.due_date,t.priority,t.estimated_minutes));
   created++;
  }
  if(statements.length)await env.DB.batch(statements);
  const settings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
  const today=localDate(settings?.timezone||"Europe/Moscow");
  await env.DB.prepare("DELETE FROM daily_plans WHERE user_id=? AND plan_date=?").bind(user.id,today).run();
  return json({ok:true,created,updated,created_clients:createdClients,created_projects:createdProjects,updated_projects:updatedProjects});
 }
 const transcript=String(body.transcript||"").trim();
 if(!transcript||transcript.length>6000)return json({error:"Надиктуй или вставь текст задачи (до 6000 символов)"},400);
 const [settings,dirs,clients,projects,areas,existingTasks,existingSteps]=await Promise.all([
  env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first(),
  env.DB.prepare("SELECT id,title FROM directions WHERE user_id=? ORDER BY sort_order").bind(user.id).all(),
  env.DB.prepare("SELECT id,name,direction_id FROM clients WHERE user_id=? AND status IN ('lead','active','paused')").bind(user.id).all(),
  env.DB.prepare("SELECT id,title,client_id,direction_id,description,expected_result,deadline FROM projects WHERE user_id=? AND status NOT IN ('done','archived')").bind(user.id).all(),
  env.DB.prepare("SELECT id,title,description FROM life_areas WHERE user_id=? ORDER BY title").bind(user.id).all(),
  env.DB.prepare("SELECT id,title,description,status,priority,project_id,client_id,direction_id,life_area_id,due_date,parent_task_id,estimated_minutes FROM tasks WHERE user_id=? AND status!='done' ORDER BY created_at DESC LIMIT 200").bind(user.id).all(),
  env.DB.prepare("SELECT s.task_id,s.title,s.status FROM task_steps s JOIN tasks t ON t.id=s.task_id WHERE s.user_id=? AND t.status!='done' ORDER BY s.sort_order LIMIT 400").bind(user.id).all()
 ]);
 const today=localDate(settings?.timezone||"Europe/Moscow");
 const projectContext=buildProjectContext(projects.results,existingTasks.results,existingSteps.results);
 const context={today,timezone:settings?.timezone||"Europe/Moscow",directions:dirs.results,clients:clients.results,projects:projects.results,life_areas:areas.results,existing_open_tasks:existingTasks.results,project_context:projectContext};
 if(!env.AI)return json({error:"Разбор голосовых задач требует подключения Workers AI. Текст распознан, но автоматическое распределение пока недоступно.",transcript,source:"unavailable"},503);
 try{
  const response=await env.AI.run("@cf/google/gemma-4-26b-a4b-it",{
   response_format:{type:"json_object"},
   messages:[
    {role:"system",content:"Ты диспетчер задач личной системы управления. Используй project_context: в нём есть ожидаемый результат проекта, незавершённые задачи, их статусы, сроки и чек-листы. Если пользователь просит составить план проекта или перечисляет большой результат, оцени покрытие: не предлагай задачи, которые уже закрыты существующими задачами или их шагами; предложи только недостающие конкретные действия. Если пользователь диктует одну задачу, не достраивай весь проект самовольно. Используй parent_index для группировки этапа и подзадач; не выдумывай зависимости, которых нельзя выразить этим форматом. Если диктовка относится к уже существующему этапу, предложи дополнить или уточнить задачу только если это поддерживается форматом, иначе спроси пользователя. Разбери русскую диктовку в 1–15 конкретных задач. Верни ТОЛЬКО JSON: {summary:string,workspace_items:[{type:'client',name:string,direction_id:string|null,contact:string,notes:string}|{type:'project',title:string,description:string,expected_result:string,deadline:'YYYY-MM-DD'|null,client_id:string|null,client_draft_index:integer|null,direction_id:string|null}|{type:'project_update',project_id:string,changes:object}],tasks:[{title:string,description:string,due_date:'YYYY-MM-DD'|null,priority:'low'|'medium'|'high',estimated_minutes:integer|null,direction_id:string|null,client_id:string|null,client_draft_index:integer|null,project_id:string|null,project_draft_index:integer|null,life_area_id:string|null,parent_index:integer|null,operation:'create'|'update',target_task_id:string|null,possible_duplicate_task_id:string|null}],clarifying_questions:string[]}. Контекст с допустимыми сущностями передан пользователем. Выбирай ID ТОЛЬКО из этого контекста, никогда не придумывай ID. Если пользователь явно просит изменить существующий проект (например, перенести срок, изменить описание/ожидаемый результат, переименовать, поставить на паузу/возобновить, завершить, сменить клиента или направление), предложи workspace_items type=project_update с точным project_id из контекста и объектом changes, включающим ТОЛЬКО явно названные поля. Не меняй статус на done/archived по фразам о намерении или обсуждении — только прямое поручение. Если неясно, какой проект или новое значение, задай вопрос и не создавай update. Не включай project_update для обсуждения или предложения без прямой команды. Если пользователь явно описывает нового клиента, которого нет среди доступных, предложи workspace_items type=client; не создавай клиента по одному упоминанию имени без контекста нового клиента/заказчика. Если пользователь явно описывает новый проект, предложи workspace_items type=project с названием, описанием, ожидаемым результатом, сроком и привязкой к существующему клиенту или client_draft_index. Не предлагай новый проект, если речь идёт о задаче в существующем проекте. Если проект однозначно найден по смыслу, привяжи задачу к нему и унаследуй его клиента и направление. Задачи нового проекта связывай через project_draft_index. Если упоминается клиент, выбери только точное/очевидное совпадение. Личные дела направляй в life_area_id, не в коммерческое направление. Если нет уверенности — оставь соответствующий ID null и добавь короткий вопрос. Относительные даты считай от today в timezone из контекста; если срок не сказан — null, не выдумывай. Если в речи перечислены несколько самостоятельных действий — создай отдельные задачи. Если есть большая цель и шаги — создай родительскую задачу и шаги как следующие задачи с parent_index равным индексу родителя. Перед созданием сравни каждую задачу с existing_open_tasks. Если пользователь просит добавить информацию, шаг или срок к конкретной существующей незавершённой задаче, выбери operation='update' и target_task_id этой задачи; обновляй только если связь однозначна. Если это повторное поручение той же самой работы, укажи possible_duplicate_task_id, operation='create' (пользователь сам решит). Не считай похожие, но разные этапы дублями. Если совпадение неочевидно — null. Не превращай каждое слово в задачу. Сохраняй важные детали, названия, суммы и условия. Русский язык. Не считай рекомендации и пожелания подтверждёнными фактами."},
    {role:"user",content:"Контекст доступных направлений, клиентов, проектов и личных областей:\n"+JSON.stringify(context)+"\n\nДиктовка:\n"+transcript}
   ],max_tokens:2200,temperature:0.1
  });
  const modelText=response?.response ?? response?.choices?.[0]?.message?.content ?? response?.result?.response;
  const parsed=typeof modelText==="string"?parseJson(modelText):(modelText&&typeof modelText==="object"?modelText:null);
  if(!parsed||(!Array.isArray(parsed.tasks)||!parsed.tasks.length)&&(!Array.isArray(parsed.workspace_items)||!parsed.workspace_items.length))throw new Error("Invalid response");
  const allowed={direction_id:new Set(dirs.results.map(x=>x.id)),client_id:new Set(clients.results.map(x=>x.id)),project_id:new Set(projects.results.map(x=>x.id)),life_area_id:new Set(areas.results.map(x=>x.id))};
  const clarifyingQuestions=Array.isArray(parsed.clarifying_questions)?parsed.clarifying_questions.slice(0,5).map(x=>String(x).slice(0,300)):[];
  const existingById=new Map(existingTasks.results.map(task=>[task.id,task]));
  const workspaceItems=(Array.isArray(parsed.workspace_items)?parsed.workspace_items:[]).slice(0,8).map(item=>item.type==="client"?{type:"client",name:String(item.name||"").trim().slice(0,160),direction_id:allowed.direction_id.has(item.direction_id)?item.direction_id:null,contact:String(item.contact||"").slice(0,240),notes:String(item.notes||"").slice(0,3000)}:item.type==="project"?{type:"project",title:String(item.title||"").trim().slice(0,180),description:String(item.description||"").slice(0,5000),expected_result:String(item.expected_result||"").slice(0,2000),deadline:safeDate(item.deadline),client_id:allowed.client_id.has(item.client_id)?item.client_id:null,client_draft_index:Number.isInteger(item.client_draft_index)&&item.client_draft_index>=0?item.client_draft_index:null,direction_id:allowed.direction_id.has(item.direction_id)?item.direction_id:null}:item.type==="project_update"&&projects.results.some(p=>p.id===item.project_id)?{type:"project_update",project_id:item.project_id,changes:Object.fromEntries(Object.entries(item.changes||{}).filter(([key])=>["title","description","expected_result","deadline","status","client_id","direction_id"].includes(key)).map(([key,value])=>[key,key==="client_id"?(allowed.client_id.has(value)?value:null):key==="direction_id"?(allowed.direction_id.has(value)?value:null):key==="deadline"?safeDate(value):value]))}:null).filter(Boolean);
  const tasks=(Array.isArray(parsed.tasks)?parsed.tasks:[]).slice(0,15).map((t,i)=>({
   title:String(t.title||"").trim().slice(0,240),description:String(t.description||"").trim().slice(0,2000),
   due_date:safeDate(t.due_date),priority:["low","medium","high"].includes(t.priority)?t.priority:"medium",
   estimated_minutes:Number.isInteger(Number(t.estimated_minutes))&&Number(t.estimated_minutes)>=5&&Number(t.estimated_minutes)<=10000?Number(t.estimated_minutes):null,
   direction_id:allowed.direction_id.has(t.direction_id)?t.direction_id:null,
   client_id:allowed.client_id.has(t.client_id)?t.client_id:null,
   project_id:allowed.project_id.has(t.project_id)?t.project_id:null,
   life_area_id:allowed.life_area_id.has(t.life_area_id)?t.life_area_id:null,
   parent_index:Number.isInteger(t.parent_index)&&t.parent_index>=0&&t.parent_index<i?t.parent_index:null,
   operation:t.operation==="update"&&existingById.has(t.target_task_id)?"update":"create",
   target_task_id:existingById.has(t.target_task_id)?t.target_task_id:null,
   possible_duplicate_task_id:existingById.has(t.possible_duplicate_task_id)?t.possible_duplicate_task_id:null
  }));
  if(!tasks.length||tasks.some(task=>!task.title))throw new Error("Some tasks have no title");
  for(const task of tasks){
   if(task.operation!=="update"&&!task.possible_duplicate_task_id){
    const candidate=existingTasks.results
     .filter(existing=>(task.project_id&&existing.project_id===task.project_id)||(task.client_id&&existing.client_id===task.client_id)||(task.life_area_id&&existing.life_area_id===task.life_area_id)||(task.direction_id&&existing.direction_id===task.direction_id))
     .map(existing=>({existing,score:taskSimilarity(task.title,existing.title)})).sort((a,b)=>b.score-a.score)[0];
    if(candidate&&candidate.score>=0.85)task.possible_duplicate_task_id=candidate.existing.id;
   }
   if(task.project_id){
    const project=projects.results.find(x=>x.id===task.project_id);
    if(project){task.client_id=project.client_id||null;task.direction_id=project.direction_id||null;}
   }
   if(task.parent_index!==null&&task.parent_index>=tasks.length)task.parent_index=null;
  }
  return json({ok:true,source:"ai",summary:String(parsed.summary||"Задачи разобраны").slice(0,500),workspace_items:workspaceItems,tasks,clarifying_questions:clarifyingQuestions,existing_tasks:existingTasks.results,project_context:projectContext});
 }catch{
  return json({error:"Не удалось надёжно разобрать диктовку. Попробуй переформулировать её или добавь задачу вручную.",transcript},502);
 }
}
