import { json, requireUser, readJson, newId } from "../_lib/auth.js";
export function isCharityPersonAvailableForProject(person,projectId){return Boolean(person)&&(!person.project_id||person.project_id===projectId);}
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function validDate(v){if(!DATE.test(String(v||"")))return false;const d=new Date(v+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
function amount(v){const n=Number(v);return Number.isFinite(n)&&n>0&&n<=1000000000?n:null;}
async function owned(env,table,id,userId){return Boolean(await env.DB.prepare("SELECT id FROM "+table+" WHERE id=? AND user_id=?").bind(id,userId).first());}
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const [projects,people,transactions]=await Promise.all([
  env.DB.prepare("SELECT p.*,(SELECT COALESCE(SUM(t.amount),0) FROM charity_transactions t WHERE t.project_id=p.id AND t.user_id=p.user_id AND t.type='donation') donations,(SELECT COALESCE(SUM(t.amount),0) FROM charity_transactions t WHERE t.project_id=p.id AND t.user_id=p.user_id AND t.type='expense') expenses,(SELECT COUNT(*) FROM charity_people cp WHERE cp.project_id=p.id AND cp.user_id=p.user_id) people_count FROM charity_projects p WHERE p.user_id=? ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,p.created_at DESC").bind(user.id).all(),
  env.DB.prepare("SELECT cp.*,p.title AS project_title FROM charity_people cp LEFT JOIN charity_projects p ON p.id=cp.project_id AND p.user_id=cp.user_id WHERE cp.user_id=? ORDER BY cp.created_at DESC LIMIT 200").bind(user.id).all(),
  env.DB.prepare("SELECT t.*,p.title AS project_title,cp.name AS person_name FROM charity_transactions t JOIN charity_projects p ON p.id=t.project_id AND p.user_id=t.user_id LEFT JOIN charity_people cp ON cp.id=t.person_id AND cp.user_id=t.user_id WHERE t.user_id=? ORDER BY t.occurred_on DESC,t.created_at DESC LIMIT 100").bind(user.id).all()
 ]);
 const totals=projects.results.reduce((a,p)=>({donations:a.donations+Number(p.donations),expenses:a.expenses+Number(p.expenses)}),{donations:0,expenses:0});
 return json({projects:projects.results,people:people.results,transactions:transactions.results,summary:{...totals,net:totals.donations-totals.expenses,active_projects:projects.results.filter(p=>p.status==="active").length}});
}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request)||{},id=newId(),type=String(b.type||"");
 if(type==="project"){
  const title=String(b.title||"").trim(),target=Number(b.target_amount||0);
  if(!title||title.length>180||!Number.isFinite(target)||target<0||target>1000000000)return json({error:"Проверь название и целевую сумму проекта"},400);
  if((b.start_date&&!validDate(b.start_date))||(b.end_date&&!validDate(b.end_date)))return json({error:"Проверь даты проекта"},400);
  await env.DB.prepare("INSERT INTO charity_projects (id,user_id,title,organization,purpose,target_amount,start_date,end_date,notes) VALUES (?,?,?,?,?,?,?,?,?)").bind(id,user.id,title,String(b.organization||"").slice(0,180),String(b.purpose||"").slice(0,2000),target,b.start_date||null,b.end_date||null,String(b.notes||"").slice(0,3000)).run();
  return json({ok:true,id},201);
 }
 if(type==="transaction"){
  const projectId=String(b.project_id||""),value=amount(b.amount),title=String(b.title||"").trim(),date=String(b.occurred_on||"");
  if(!await owned(env,"charity_projects",projectId,user.id))return json({error:"Благотворительный проект не найден"},404);
  if(!value||!title||title.length>180||!validDate(date)||!["donation","expense"].includes(b.transaction_type))return json({error:"Проверь тип, название, сумму и дату операции"},400);
  const personId=b.person_id?String(b.person_id):null;
  if(personId){
   const person=await env.DB.prepare("SELECT id,project_id FROM charity_people WHERE id=? AND user_id=?").bind(personId,user.id).first();
   if(!person)return json({error:"Контакт не найден"},404);
   if(!isCharityPersonAvailableForProject(person,projectId))return json({error:"Выбранный контакт относится к другому благотворительному проекту"},409);
  }
  await env.DB.prepare("INSERT INTO charity_transactions (id,user_id,project_id,person_id,type,category,title,amount,occurred_on,note) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id,user.id,projectId,personId,b.transaction_type,String(b.category||"").slice(0,80),title,value,date,String(b.note||"").slice(0,1000)).run();
  return json({ok:true,id},201);
 }
 if(type==="person"){
  const name=String(b.name||"").trim(),role=String(b.role||"");
  if(!name||name.length>160||!["partner","volunteer","supporter"].includes(role))return json({error:"Проверь имя и роль участника"},400);
  const projectId=b.project_id?String(b.project_id):null;
  if(projectId&&!await owned(env,"charity_projects",projectId,user.id))return json({error:"Проект не найден"},404);
  await env.DB.prepare("INSERT INTO charity_people (id,user_id,project_id,name,role,contact,notes) VALUES (?,?,?,?,?,?,?)").bind(id,user.id,projectId,name,role,String(b.contact||"").slice(0,240),String(b.notes||"").slice(0,1000)).run();
  return json({ok:true,id},201);
 }
 return json({error:"Неизвестный тип записи"},400);
}
export async function onRequestPatch({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request)||{},id=String(b.id||"");
 if(!id)return json({error:"Не выбрана запись"},400);
 if(b.type==="project"){
  if(!["active","paused","completed","archived"].includes(b.status))return json({error:"Неизвестный статус"},400);
  const r=await env.DB.prepare("UPDATE charity_projects SET status=?,updated_at=datetime('now') WHERE id=? AND user_id=?").bind(b.status,id,user.id).run();
  if(!r.meta.changes)return json({error:"Проект не найден"},404);
 }else return json({error:"Неизвестный тип записи"},400);
 return json({ok:true});
}
export async function onRequestDelete({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request)||{},id=String(b.id||"");
 if(b.type==="transaction"){
  const r=await env.DB.prepare("DELETE FROM charity_transactions WHERE id=? AND user_id=?").bind(id,user.id).run();
  if(!r.meta.changes)return json({error:"Операция не найдена"},404);
 }else if(b.type==="person"){
  const r=await env.DB.prepare("DELETE FROM charity_people WHERE id=? AND user_id=?").bind(id,user.id).run();
  if(!r.meta.changes)return json({error:"Участник не найден"},404);
 }else return json({error:"Удаление этого типа записи не поддерживается"},400);
 return json({ok:true});
}
