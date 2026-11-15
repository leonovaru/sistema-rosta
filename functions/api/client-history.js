import { json, requireUser, readJson, newId } from "../_lib/auth.js";
import { isValidHistoryDate, normalizeInteraction } from "../_lib/client-history.js";

export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);
 if(!user)return json({error:"Необходим вход"},401);
 const clientId=new URL(request.url).searchParams.get("client_id")||"";
 const client=await env.DB.prepare("SELECT id,name FROM clients WHERE id=? AND user_id=?").bind(clientId,user.id).first();
 if(!client)return json({error:"Клиент не найден"},404);
 const [projects,tasks,meetings,interactions,income,expenses]=await Promise.all([
  env.DB.prepare("SELECT id,title,status,deadline,expected_result,updated_at FROM projects WHERE user_id=? AND client_id=? ORDER BY updated_at DESC").bind(user.id,clientId).all(),
  env.DB.prepare("SELECT t.id,t.title,t.description,t.status,t.priority,t.due_date,t.completed_at,t.created_at,t.project_id,p.title AS project_title FROM tasks t LEFT JOIN projects p ON p.id=t.project_id AND p.user_id=t.user_id WHERE t.user_id=? AND (t.client_id=? OR t.project_id IN (SELECT id FROM projects WHERE user_id=? AND client_id=?)) ORDER BY COALESCE(t.completed_at,t.due_date,t.created_at) DESC LIMIT 150").bind(user.id,clientId,user.id,clientId).all(),
  env.DB.prepare("SELECT id,title,meeting_date,participants,summary,decisions_json,agreements_json,open_questions_json,transcript,project_id FROM meeting_notes WHERE user_id=? AND client_id=? ORDER BY meeting_date DESC,created_at DESC LIMIT 100").bind(user.id,clientId).all(),
  env.DB.prepare("SELECT id,interaction_type,title,body,occurred_on,project_id,created_at FROM client_interactions WHERE user_id=? AND client_id=? ORDER BY occurred_on DESC,created_at DESC LIMIT 150").bind(user.id,clientId).all(),
  env.DB.prepare("SELECT id,note AS title,amount,received_on,note,project_id FROM income_entries WHERE user_id=? AND client_id=? ORDER BY received_on DESC,created_at DESC LIMIT 100").bind(user.id,clientId).all(),
  env.DB.prepare("SELECT id,title,category,amount,spent_on,note,project_id FROM expenses WHERE user_id=? AND client_id=? ORDER BY spent_on DESC,created_at DESC LIMIT 100").bind(user.id,clientId).all()
 ]);
 const projectNames=new Map(projects.results.map(project=>[project.id,project.title]));
 const timeline=[
  ...meetings.results.map(x=>({kind:"meeting",date:x.meeting_date,title:x.title,body:x.summary,details:{decisions:parseArray(x.decisions_json),agreements:parseArray(x.agreements_json),open_questions:parseArray(x.open_questions_json),participants:x.participants||"",transcript:x.transcript||""},project_id:x.project_id,project_title:projectNames.get(x.project_id)||"",id:x.id})),
  ...interactions.results.map(x=>({kind:x.interaction_type,date:x.occurred_on,title:x.title,body:x.body,project_id:x.project_id,project_title:projectNames.get(x.project_id)||"",id:x.id})),
  ...income.results.map(x=>({kind:"income",date:x.received_on,title:x.title||"Поступление",body:x.note,amount:Number(x.amount),project_id:x.project_id,project_title:projectNames.get(x.project_id)||"",id:x.id})),
  ...expenses.results.map(x=>({kind:"expense",date:x.spent_on,title:x.title,body:x.note,category:x.category,amount:Number(x.amount),project_id:x.project_id,project_title:projectNames.get(x.project_id)||"",id:x.id})),
  ...tasks.results.map(x=>({kind:"task",date:String(x.completed_at||x.due_date||x.created_at||"").slice(0,10),title:x.title,body:x.description,project_title:x.project_title,status:x.status,priority:x.priority,id:x.id})),
  ...projects.results.map(x=>({kind:"project",date:x.updated_at?.slice(0,10),title:x.title,body:x.expected_result,status:x.status,deadline:x.deadline,id:x.id}))
 ].filter(x=>x.date).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,250);
 return json({client,projects:projects.results,tasks:tasks.results,meetings:meetings.results.length,interactions:interactions.results.length,financial:{income:income.results.reduce((s,x)=>s+Number(x.amount||0),0),expenses:expenses.results.reduce((s,x)=>s+Number(x.amount||0),0),income_entries:income.results,expense_entries:expenses.results},timeline});
}
function parseArray(value){try{const x=JSON.parse(value||"[]");return Array.isArray(x)?x:[]}catch{return[]}}

export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);
 if(!user)return json({error:"Необходим вход"},401);
 const body=await readJson(request)||{};
 const clientId=String(body.client_id||"");
 const client=await env.DB.prepare("SELECT id FROM clients WHERE id=? AND user_id=?").bind(clientId,user.id).first();
 if(!client)return json({error:"Клиент не найден"},404);
 const item=normalizeInteraction(body);
 if(!item.title||!isValidHistoryDate(item.occurred_on))return json({error:"Укажи название записи и корректную дату"},400);
 let projectId=null;
 if(body.project_id){
  const project=await env.DB.prepare("SELECT id FROM projects WHERE id=? AND user_id=? AND client_id=?").bind(String(body.project_id),user.id,clientId).first();
  if(!project)return json({error:"Проект не относится к этому клиенту"},400);
  projectId=project.id;
 }
 const id=newId();
 await env.DB.prepare("INSERT INTO client_interactions (id,user_id,client_id,project_id,interaction_type,title,body,occurred_on) VALUES (?,?,?,?,?,?,?,?)")
  .bind(id,user.id,clientId,projectId,item.type,item.title,item.body,item.occurred_on).run();
 return json({ok:true,id},201);
}
