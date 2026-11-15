import { json, requireUser, readJson, newId } from "../_lib/auth.js";
import { isValidMeetingDate, cleanMeetingItems, normalizeMeetingAgreements, normalizeMeetingLinks } from "../_lib/meeting-notes.js";

function parseModelJson(value){
 if(typeof value!=="string")return value;
 const cleaned=value.replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,"");
 try{return JSON.parse(cleaned);}catch{return null;}
}


export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);
 if(!user)return json({error:"Необходим вход"},401);
 const projectId=new URL(request.url).searchParams.get("project_id")||"";
 const clientId=new URL(request.url).searchParams.get("client_id")||"";
 if(projectId){const project=await env.DB.prepare("SELECT id FROM projects WHERE id=? AND user_id=?").bind(projectId,user.id).first();if(!project)return json({error:"Проект не найден"},404);}
 if(clientId){const client=await env.DB.prepare("SELECT id FROM clients WHERE id=? AND user_id=?").bind(clientId,user.id).first();if(!client)return json({error:"Клиент не найден"},404);}
 let query="SELECT id,project_id,client_id,title,meeting_date,participants,summary,decisions_json,agreements_json,open_questions_json,transcript,created_at,updated_at FROM meeting_notes WHERE user_id=?";
 const params=[user.id];
 if(projectId){query+=" AND project_id=?";params.push(projectId);}
 if(clientId){query+=" AND client_id=?";params.push(clientId);}
 query+=" ORDER BY meeting_date DESC,created_at DESC LIMIT 100";
 const result=await env.DB.prepare(query).bind(...params).all();
 const meetingIds=result.results.map(row=>row.id);
 const links=meetingIds.length?await env.DB.prepare("SELECT l.meeting_id,l.agreement_index,l.task_id,t.title AS task_title,t.status AS task_status,t.due_date AS task_due_date FROM meeting_task_links l JOIN tasks t ON t.id=l.task_id AND t.user_id=l.user_id WHERE l.user_id=? AND l.meeting_id IN ("+meetingIds.map(()=>"?").join(",")+")").bind(user.id,...meetingIds).all():{results:[]};
 const byMeeting=new Map();
 for(const link of links.results){if(!byMeeting.has(link.meeting_id))byMeeting.set(link.meeting_id,[]);byMeeting.get(link.meeting_id).push(link);}
 return json({meetings:result.results.map(row=>({...row,decisions:parseModelJson(row.decisions_json)||[],agreements:(parseModelJson(row.agreements_json)||[]).map((agreement,index)=>{const link=(byMeeting.get(row.id)||[]).find(x=>x.agreement_index===index);return link?{...agreement,task_id:link.task_id,task_title:link.task_title,task_status:link.task_status,task_due_date:link.task_due_date}:agreement;}),open_questions:parseModelJson(row.open_questions_json)||[]}))});
}

export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);
 if(!user)return json({error:"Необходим вход"},401);
 const body=await readJson(request)||{};
 if(body.action==="link_tasks"){
  const meetingId=String(body.meeting_id||"");
  const meetingRow=await env.DB.prepare("SELECT id,agreements_json FROM meeting_notes WHERE id=? AND user_id=?").bind(meetingId,user.id).first();
  if(!meetingRow)return json({error:"Протокол не найден"},404);
  const agreements=parseModelJson(meetingRow.agreements_json)||[];
  const links=Array.isArray(body.links)?body.links.slice(0,20):[];
  if(!links.length)return json({error:"Нет задач для привязки"},400);
  const statements=[];
  for(const link of links){
   const index=Number(link.agreement_index),taskId=String(link.task_id||"");
   if(!Number.isInteger(index)||index<0||index>=agreements.length||!taskId)return json({error:"Некорректная связь поручения и задачи"},400);
   const taskRow=await env.DB.prepare("SELECT id FROM tasks WHERE id=? AND user_id=?").bind(taskId,user.id).first();
   if(!taskRow)return json({error:"Одна из задач не найдена"},404);
   statements.push(env.DB.prepare("INSERT INTO meeting_task_links (user_id,meeting_id,agreement_index,task_id) VALUES (?,?,?,?) ON CONFLICT(meeting_id,agreement_index) DO UPDATE SET task_id=excluded.task_id,user_id=excluded.user_id").bind(user.id,meetingId,index,taskId));
  }
  await env.DB.batch(statements);
  return json({ok:true,linked:statements.length});
 }
 if(body.action==="save"){
  const title=String(body.title||"").trim().slice(0,180);
  const meetingDate=String(body.meeting_date||"");
  const transcript=String(body.transcript||"").trim().slice(0,12000);
  if(!title||!isValidMeetingDate(meetingDate))return json({error:"Укажи название и корректную дату встречи"},400);
  const [projects,clients]=await Promise.all([
   env.DB.prepare("SELECT id,client_id FROM projects WHERE user_id=?").bind(user.id).all(),
   env.DB.prepare("SELECT id FROM clients WHERE user_id=?").bind(user.id).all()
  ]);
  const links=normalizeMeetingLinks(body.project_id,body.client_id,projects.results,clients.results);
  const projectIds=new Set(projects.results.map(x=>x.id)),clientIds=new Set(clients.results.map(x=>x.id));
  const decisions=cleanMeetingItems(body.decisions),agreements=normalizeMeetingAgreements(body.agreements,projectIds,clientIds),questions=cleanMeetingItems(body.open_questions);
  const values=[links.project_id,links.client_id,title,meetingDate,String(body.participants||"").slice(0,1000),String(body.summary||"").slice(0,5000),JSON.stringify(decisions),JSON.stringify(agreements),JSON.stringify(questions),transcript];
  const existingId=String(body.id||"");
  if(existingId){
   const result=await env.DB.prepare("UPDATE meeting_notes SET project_id=?,client_id=?,title=?,meeting_date=?,participants=?,summary=?,decisions_json=?,agreements_json=?,open_questions_json=?,transcript=?,updated_at=datetime('now') WHERE id=? AND user_id=?")
    .bind(...values,existingId,user.id).run();
   if(!result.meta.changes)return json({error:"Протокол не найден"},404);
   return json({ok:true,id:existingId,updated:true});
  }
  const id=newId();
  await env.DB.prepare("INSERT INTO meeting_notes (id,user_id,project_id,client_id,title,meeting_date,participants,summary,decisions_json,agreements_json,open_questions_json,transcript) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
   .bind(id,user.id,...values).run();
  return json({ok:true,id});
 }
 if(body.action!=="analyze")return json({error:"Неизвестное действие"},400);
 const transcript=String(body.transcript||"").trim().slice(0,12000);
 if(transcript.length<15)return json({error:"Добавь текст встречи (не менее 15 символов)"},400);
 if(!env.AI)return json({error:"Для разбора встречи необходимо подключить Workers AI"},503);
 const [projects,clients,settings]=await Promise.all([
  env.DB.prepare("SELECT id,title,client_id,direction_id,expected_result,status FROM projects WHERE user_id=? AND status NOT IN ('done','archived') ORDER BY updated_at DESC LIMIT 50").bind(user.id).all(),
  env.DB.prepare("SELECT id,name,direction_id,status FROM clients WHERE user_id=? AND status!='closed' ORDER BY updated_at DESC LIMIT 100").bind(user.id).all(),
  env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first()
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
  const links=normalizeMeetingLinks(parsed.project_id,parsed.client_id,projects.results,clients.results);
  return json({ok:true,source:"ai",transcript,title:String(parsed.title||"Встреча").slice(0,180),meeting_date:isValidMeetingDate(parsed.meeting_date)?parsed.meeting_date:today,participants:String(parsed.participants||"").slice(0,1000),project_id:links.project_id,client_id:links.client_id,summary:String(parsed.summary||"").slice(0,5000),decisions:cleanMeetingItems(parsed.decisions),agreements:normalizeMeetingAgreements(parsed.agreements,projectIds,clientIds),proposed_actions:cleanMeetingItems(parsed.proposed_actions),open_questions:cleanMeetingItems(parsed.open_questions),clarifying_questions:cleanMeetingItems(parsed.clarifying_questions)});
 }catch(error){return json({error:"Не удалось разобрать встречу. Проверь текст и попробуй ещё раз.",details:String(error?.message||error).slice(0,300)},502);}
}
