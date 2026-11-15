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
function normalizeTaskTitle(value){return String(value||"").toLocaleLowerCase("ru-RU").replace(/ё/g,"е").replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");}
function taskSimilarity(a,b){const x=new Set(normalizeTaskTitle(a).split(" ").filter(w=>w.length>2)),y=new Set(normalizeTaskTitle(b).split(" ").filter(w=>w.length>2));if(!x.size||!y.size)return 0;const intersection=[...x].filter(w=>y.has(w)).length;return intersection/Math.max(x.size,y.size);}
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
  if(!Array.isArray(body.tasks)||!body.tasks.length||body.tasks.length>15)return json({error:"Проверь список задач (не более 15)"},400);
  const [dirs,clients,projects,areas]=await Promise.all([
   env.DB.prepare("SELECT id FROM directions WHERE user_id=?").bind(user.id).all(),
   env.DB.prepare("SELECT id FROM clients WHERE user_id=?").bind(user.id).all(),
   env.DB.prepare("SELECT id FROM projects WHERE user_id=?").bind(user.id).all(),
   env.DB.prepare("SELECT id FROM life_areas WHERE user_id=?").bind(user.id).all()
  ]);
  const allowed={direction_id:new Set(dirs.results.map(x=>x.id)),client_id:new Set(clients.results.map(x=>x.id)),project_id:new Set(projects.results.map(x=>x.id)),life_area_id:new Set(areas.results.map(x=>x.id))};
  const prepared=body.tasks.map((t,i)=>({
   id:newId(),title:String(t.title||"").trim().slice(0,240),description:String(t.description||"").trim().slice(0,2000),
   direction_id:allowed.direction_id.has(t.direction_id)?t.direction_id:null,
   client_id:allowed.client_id.has(t.client_id)?t.client_id:null,
   project_id:allowed.project_id.has(t.project_id)?t.project_id:null,
   life_area_id:allowed.life_area_id.has(t.life_area_id)?t.life_area_id:null,
   due_date:safeDate(t.due_date),priority:["low","medium","high"].includes(t.priority)?t.priority:"medium",
   estimated_minutes:Number.isInteger(Number(t.estimated_minutes))&&Number(t.estimated_minutes)>=5&&Number(t.estimated_minutes)<=10000?Number(t.estimated_minutes):null,
   parent_index:Number.isInteger(t.parent_index)&&t.parent_index>=0&&t.parent_index<i?t.parent_index:null,
  }));
  if(prepared.some(t=>!t.title))return json({error:"У каждой задачи должно быть название. Проверь пустые строки в черновике."},400);
  if(prepared.some(t=>t.parent_index!==null&&t.parent_index>=prepared.length))return json({error:"Проверь связь подзадач с родительскими задачами."},400);
  if(!prepared.length)return json({error:"Не найдено задач для сохранения"},400);
  const statements=[];
  for(let i=0;i<prepared.length;i++){
   const t=prepared[i],parent=t.parent_index===null?null:prepared[t.parent_index];
   if(parent){t.direction_id=t.direction_id||parent.direction_id;t.client_id=t.client_id||parent.client_id;t.project_id=t.project_id||parent.project_id;t.life_area_id=t.life_area_id||parent.life_area_id;}
   if(t.project_id){
    const p=await env.DB.prepare("SELECT client_id,direction_id FROM projects WHERE id=? AND user_id=?").bind(t.project_id,user.id).first();
    if(!p)return json({error:"Проект в одной из задач больше не доступен. Обнови разбор."},409);
    t.client_id=p.client_id;t.direction_id=p.direction_id;
   }
   if(parent&&(t.project_id!==parent.project_id||t.life_area_id!==parent.life_area_id||t.client_id!==parent.client_id||t.direction_id!==parent.direction_id))return json({error:"Подзадача должна относиться к той же области, что и родительская задача"},400);
   statements.push(env.DB.prepare("INSERT INTO tasks (id,user_id,direction_id,client_id,project_id,life_area_id,parent_task_id,title,description,due_date,priority,estimated_minutes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(t.id,user.id,t.direction_id,t.client_id,t.project_id,t.life_area_id,parent?.id||null,t.title,t.description,t.due_date,t.priority,t.estimated_minutes));
  }
  await env.DB.batch(statements);
  const settings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
  const today=localDate(settings?.timezone||"Europe/Moscow");
  await env.DB.prepare("DELETE FROM daily_plans WHERE user_id=? AND plan_date=?").bind(user.id,today).run();
  return json({ok:true,created:prepared.length});
 }
 const transcript=String(body.transcript||"").trim();
 if(!transcript||transcript.length>6000)return json({error:"Надиктуй или вставь текст задачи (до 6000 символов)"},400);
 const [settings,dirs,clients,projects,areas,existingTasks]=await Promise.all([
  env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first(),
  env.DB.prepare("SELECT id,title FROM directions WHERE user_id=? ORDER BY sort_order").bind(user.id).all(),
  env.DB.prepare("SELECT id,name,direction_id FROM clients WHERE user_id=? AND status IN ('lead','active','paused')").bind(user.id).all(),
  env.DB.prepare("SELECT id,title,client_id,direction_id,description,expected_result,deadline FROM projects WHERE user_id=? AND status NOT IN ('done','archived')").bind(user.id).all(),
  env.DB.prepare("SELECT id,title,description FROM life_areas WHERE user_id=? ORDER BY title").bind(user.id).all(),
  env.DB.prepare("SELECT id,title,project_id,client_id,direction_id,life_area_id,due_date FROM tasks WHERE user_id=? AND status!='done' ORDER BY created_at DESC LIMIT 150").bind(user.id).all()
 ]);
 const today=localDate(settings?.timezone||"Europe/Moscow");
 const context={today,timezone:settings?.timezone||"Europe/Moscow",directions:dirs.results,clients:clients.results,projects:projects.results,life_areas:areas.results,existing_open_tasks:existingTasks.results};
 if(!env.AI)return json({error:"Разбор голосовых задач требует подключения Workers AI. Текст распознан, но автоматическое распределение пока недоступно.",transcript,source:"unavailable"},503);
 try{
  const response=await env.AI.run("@cf/google/gemma-4-26b-a4b-it",{
   response_format:{type:"json_object"},
   messages:[
    {role:"system",content:"Ты диспетчер задач личной системы управления. Используй описание и ожидаемый результат проекта, чтобы понять контекст и этап работы. Сначала сопоставь сказанное с открытыми задачами этого проекта; не создавай дубли. Если диктовка относится к уже существующему этапу, предложи дополнить или уточнить задачу только если это поддерживается форматом, иначе спроси пользователя. Разбери русскую диктовку в 1–15 конкретных задач. Верни ТОЛЬКО JSON: {summary:string,tasks:[{title:string,description:string,due_date:'YYYY-MM-DD'|null,priority:'low'|'medium'|'high',estimated_minutes:integer|null,direction_id:string|null,client_id:string|null,project_id:string|null,life_area_id:string|null,parent_index:integer|null,possible_duplicate_task_id:string|null}],clarifying_questions:string[]}. Контекст с допустимыми сущностями передан пользователем. Выбирай ID ТОЛЬКО из этого контекста, никогда не придумывай ID. Если проект однозначно найден по смыслу, привяжи задачу к нему и унаследуй его клиента и направление. Если упоминается клиент, выбери только точное/очевидное совпадение. Личные дела направляй в life_area_id, не в коммерческое направление. Если нет уверенности — оставь соответствующий ID null и добавь короткий вопрос. Относительные даты считай от today в timezone из контекста; если срок не сказан — null, не выдумывай. Если в речи перечислены несколько самостоятельных действий — создай отдельные задачи. Если есть большая цель и шаги — создай родительскую задачу и шаги как следующие задачи с parent_index равным индексу родителя. Перед созданием сравни каждую задачу с existing_open_tasks. Если это явно та же самая незавершённая задача (совпадает смысл и ожидаемый результат), укажи её ID в possible_duplicate_task_id. Не считай похожие, но разные этапы дублями. Если совпадение неочевидно — null. Не превращай каждое слово в задачу. Сохраняй важные детали, названия, суммы и условия. Русский язык. Не считай рекомендации и пожелания подтверждёнными фактами."},
    {role:"user",content:"Контекст доступных направлений, клиентов, проектов и личных областей:\n"+JSON.stringify(context)+"\n\nДиктовка:\n"+transcript}
   ],max_tokens:2200,temperature:0.1
  });
  const modelText=response?.response ?? response?.choices?.[0]?.message?.content ?? response?.result?.response;
  const parsed=typeof modelText==="string"?parseJson(modelText):(modelText&&typeof modelText==="object"?modelText:null);
  if(!Array.isArray(parsed?.tasks)||!parsed.tasks.length)throw new Error("Invalid response");
  const allowed={direction_id:new Set(dirs.results.map(x=>x.id)),client_id:new Set(clients.results.map(x=>x.id)),project_id:new Set(projects.results.map(x=>x.id)),life_area_id:new Set(areas.results.map(x=>x.id))};
  const clarifyingQuestions=Array.isArray(parsed.clarifying_questions)?parsed.clarifying_questions.slice(0,5).map(x=>String(x).slice(0,300)):[];
  const existingById=new Map(existingTasks.results.map(task=>[task.id,task]));
  const tasks=parsed.tasks.slice(0,15).map((t,i)=>({
   title:String(t.title||"").trim().slice(0,240),description:String(t.description||"").trim().slice(0,2000),
   due_date:safeDate(t.due_date),priority:["low","medium","high"].includes(t.priority)?t.priority:"medium",
   estimated_minutes:Number.isInteger(Number(t.estimated_minutes))&&Number(t.estimated_minutes)>=5&&Number(t.estimated_minutes)<=10000?Number(t.estimated_minutes):null,
   direction_id:allowed.direction_id.has(t.direction_id)?t.direction_id:null,
   client_id:allowed.client_id.has(t.client_id)?t.client_id:null,
   project_id:allowed.project_id.has(t.project_id)?t.project_id:null,
   life_area_id:allowed.life_area_id.has(t.life_area_id)?t.life_area_id:null,
   parent_index:Number.isInteger(t.parent_index)&&t.parent_index>=0&&t.parent_index<i?t.parent_index:null,
   possible_duplicate_task_id:existingById.has(t.possible_duplicate_task_id)?t.possible_duplicate_task_id:null
  }));
  if(!tasks.length||tasks.some(task=>!task.title))throw new Error("Some tasks have no title");
  for(const task of tasks){
   if(!task.possible_duplicate_task_id){
    const candidate=existingTasks.results.map(existing=>({existing,score:taskSimilarity(task.title,existing.title)})).sort((a,b)=>b.score-a.score)[0];
    if(candidate&&candidate.score>=0.85)task.possible_duplicate_task_id=candidate.existing.id;
   }
   if(task.project_id){
    const project=projects.results.find(x=>x.id===task.project_id);
    if(project){task.client_id=project.client_id||null;task.direction_id=project.direction_id||null;}
   }
   if(task.parent_index!==null&&task.parent_index>=tasks.length)task.parent_index=null;
  }
  return json({ok:true,source:"ai",summary:String(parsed.summary||"Задачи разобраны").slice(0,500),tasks,clarifying_questions:clarifyingQuestions,existing_tasks:existingTasks.results});
 }catch{
  return json({error:"Не удалось надёжно разобрать диктовку. Попробуй переформулировать её или добавь задачу вручную.",transcript},502);
 }
}
