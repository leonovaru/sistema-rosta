import { json, requireUser, readJson, newId } from "../_lib/auth.js";

function parseModelJson(value){
 if(typeof value!=="string")return value;
 const cleaned=value.replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,"");
 try{return JSON.parse(cleaned);}catch{return null;}
}
function validDate(value){
 const s=String(value||"");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+"T00:00:00Z");
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;
}
function asList(value,max=20){return (Array.isArray(value)?value:[]).slice(0,max).map(x=>String(x||"").trim().slice(0,1000)).filter(Boolean);}

export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);
 if(!user)return json({error:"Необходим вход"},401);
 const result=await env.DB.prepare("SELECT id,project_id,client_id,title,meeting_date,participants,summary,decisions_json,agreements_json,open_questions_json,created_at FROM meeting_notes WHERE user_id=? ORDER BY meeting_date DESC,created_at DESC LIMIT 50").bind(user.id).all();
 return json({meetings:result.results.map(row=>({...row,decisions:parseModelJson(row.decisions_json)||[],agreements:parseModelJson(row.agreements_json)||[],open_questions:parseModelJson(row.open_questions_json)||[]}))});
}

export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);
 if(!user)return json({error:"Необходим вход"},401);
 const body=await readJson(request)||{};
 if(body.action==="save"){
  const title=String(body.title||"").trim().slice(0,180);
  const meetingDate=String(body.meeting_date||"");
  const transcript=String(body.transcript||"").trim().slice(0,12000);
  if(!title||!validDate(meetingDate))return json({error:"Укажи название и корректную дату встречи"},400);
  const [projects,clients]=await Promise.all([
   env.DB.prepare("SELECT id FROM projects WHERE id=? AND user_id=?").bind(body.project_id||"",user.id).first(),
   env.DB.prepare("SELECT id FROM clients WHERE id=? AND user_id=?").bind(body.client_id||"",user.id).first()
  ]);
  const id=newId();
  const decisions=asList(body.decisions),agreements=asList(body.agreements),questions=asList(body.open_questions);
  await env.DB.prepare("INSERT INTO meeting_notes (id,user_id,project_id,client_id,title,meeting_date,participants,summary,decisions_json,agreements_json,open_questions_json,transcript) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
   .bind(id,user.id,projects?.id||null,clients?.id||null,title,meetingDate,String(body.participants||"").slice(0,1000),String(body.summary||"").slice(0,5000),JSON.stringify(decisions),JSON.stringify(agreements),JSON.stringify(questions),transcript).run();
  return json({ok:true,id});
 }
 if(body.action!=="analyze")return json({error:"Неизвестное действие"},400);
 const transcript=String(body.transcript||"").trim().slice(0,12000);
 if(transcript.length<15)return json({error:"Добавь текст встречи (не менее 15 символов)"},400);
 if(!env.AI)return json({error:"Для разбора встречи необходимо подключить Workers AI"},503);
 const [projects,clients,settings]=await Promise.all([
  env.DB.prepare("SELECT id,title,client_id,direction_id,expected_result,status FROM projects WHERE user_id=? AND status NOT IN ('done','archived') ORDER BY updated_at DESC LIMIT 50").bind(user.id).all(),
  env.DB.prepare("SELECT id,name,direction_id,status FROM clients WHERE user_id=? AND status!='closed' ORDER BY updated_at DESC LIMIT 100").bind(user.id).all(),
  env.DB.prepare("SELECT timezone FROM user_settings WHERE user_id=?").bind(user.id).first()
 ]);
 const timezone=settings?.timezone||"Europe/Moscow";
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const context={today,timezone,projects:projects.results,clients:clients.results};
 try{
  const response=await env.AI.run("@cf/google/gemma-4-26b-a4b-it",{
   response_format:{type:"json_object"},
   messages:[
    {role:"system",content:"Ты помощник для структурирования протоколов встреч на русском языке. Извлеки только то, что действительно прозвучало. Строго различай: decisions — принятые решения; agreements — явные договорённости/поручения с ответственным и сроком только если названы; proposed_actions — предложения или идеи, ещё не согласованные; open_questions — вопросы без ответа. Никогда не превращай предложение или гипотезу в подтверждённое решение. Если ответственный или срок не назван, верни null. Привяжи к project_id/client_id только если совпадение однозначно из контекста, иначе null и добавь вопрос. Задачи предлагай только из явных поручений/договорённостей, не из идей. Сохраняй важные названия, суммы и детали. Верни только JSON: {title:string,meeting_date:'YYYY-MM-DD',participants:string,project_id:string|null,client_id:string|null,summary:string,decisions:[string],agreements:[{task:string,assignee:string|null,due_date:'YYYY-MM-DD'|null,project_id:string|null,client_id:string|null}],proposed_actions:[string],open_questions:[string],clarifying_questions:[string]}. Дата относительно today, если из речи она определима; иначе today. Не придумывай участников."},
    {role:"user",content:"Контекст: "+JSON.stringify(context)+"\n\nТекст встречи:\n"+transcript}
   ],max_tokens:1800,temperature:0.1
  });
  const raw=response?.response??response?.choices?.[0]?.message?.content??response?.result?.response;
  const parsed=parseModelJson(raw);
  if(!parsed||!Array.isArray(parsed.agreements)||!Array.isArray(parsed.decisions))throw new Error("Invalid meeting response");
  const projectIds=new Set(projects.results.map(x=>x.id)),clientIds=new Set(clients.results.map(x=>x.id));
  return json({ok:true,source:"ai",transcript,title:String(parsed.title||"Встреча").slice(0,180),meeting_date:validDate(parsed.meeting_date)?parsed.meeting_date:today,participants:String(parsed.participants||"").slice(0,1000),project_id:projectIds.has(parsed.project_id)?parsed.project_id:null,client_id:clientIds.has(parsed.client_id)?parsed.client_id:null,summary:String(parsed.summary||"").slice(0,5000),decisions:asList(parsed.decisions),agreements:(parsed.agreements||[]).slice(0,20).map(a=>({task:String(a.task||"").slice(0,240),assignee:a.assignee?String(a.assignee).slice(0,160):null,due_date:validDate(a.due_date)?a.due_date:null,project_id:projectIds.has(a.project_id)?a.project_id:null,client_id:clientIds.has(a.client_id)?a.client_id:null})).filter(a=>a.task),proposed_actions:asList(parsed.proposed_actions),open_questions:asList(parsed.open_questions),clarifying_questions:asList(parsed.clarifying_questions)});
 }catch(error){return json({error:"Не удалось разобрать встречу. Проверь текст и попробуй ещё раз.",details:String(error?.message||error).slice(0,300)},502);}
}
