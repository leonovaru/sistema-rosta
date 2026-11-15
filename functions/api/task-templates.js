import { json, requireUser, readJson, newId } from "../_lib/auth.js";
import { recurringTaskDates, normalizeRecurringSteps } from "../_lib/recurring-tasks.js";

const DATE=/^\d{4}-\d{2}-\d{2}$/;
function validDate(value){if(!DATE.test(value))return false;const date=new Date(value+"T12:00:00Z");return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;}
function todayInZone(timezone){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone||"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return p.year+"-"+p.month+"-"+p.day;
}
function shift(date,days){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}

export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);
 if(!user)return json({error:"Необходим вход"},401);
 const settings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
 const today=todayInZone(settings?.timezone),horizon=shift(today,30);
 const {results:templates}=await env.DB.prepare("SELECT t.*,a.title AS life_area_title,d.title AS direction_title,(SELECT COUNT(*) FROM tasks x WHERE x.template_id=t.id AND x.user_id=t.user_id AND x.status!='done') AS open_instances FROM task_templates t LEFT JOIN life_areas a ON a.id=t.life_area_id AND a.user_id=t.user_id LEFT JOIN directions d ON d.id=t.direction_id AND d.user_id=t.user_id WHERE t.user_id=? ORDER BY t.active DESC,t.created_at DESC").bind(user.id).all();
 const {results:steps}=await env.DB.prepare("SELECT id,template_id,title,sort_order FROM task_template_steps WHERE user_id=? ORDER BY template_id,sort_order").bind(user.id).all();
 const byTemplate=new Map();
 for(const step of steps){if(!byTemplate.has(step.template_id))byTemplate.set(step.template_id,[]);byTemplate.get(step.template_id).push(step);}
 const statements=[];
 for(const template of templates.filter(x=>x.active)){
  const dates=recurringTaskDates(template,today,horizon);
  for(const dueDate of dates){
   statements.push(env.DB.prepare("INSERT OR IGNORE INTO tasks (id,user_id,direction_id,life_area_id,title,description,status,priority,due_date,estimated_minutes,template_id) VALUES (?,?,?,?,?,?,'todo',?,?,?,?)")
    .bind(newId(),user.id,template.direction_id,template.life_area_id,template.title,template.description,template.priority,dueDate,template.estimated_minutes,template.id));
  }
 }
 for(let i=0;i<statements.length;i+=80)await env.DB.batch(statements.slice(i,i+80));
 const childStatements=[];
 for(const template of templates.filter(x=>x.active)){
  const templateSteps=byTemplate.get(template.id)||[];
  if(!templateSteps.length)continue;
  for(const dueDate of recurringTaskDates(template,today,horizon)){
   const parent=await env.DB.prepare("SELECT id FROM tasks WHERE template_id=? AND user_id=? AND due_date=?").bind(template.id,user.id,dueDate).first();
   if(!parent)continue;
   for(const step of templateSteps){
    childStatements.push(env.DB.prepare("INSERT OR IGNORE INTO tasks (id,user_id,direction_id,life_area_id,parent_task_id,title,description,status,priority,due_date,template_step_id) VALUES (?,?,?,?,?,?,?,'todo',?,?,?)")
     .bind(newId(),user.id,template.direction_id,template.life_area_id,parent.id,step.title,"",template.priority,dueDate,step.id));
   }
  }
 }
 for(let i=0;i<childStatements.length;i+=80)await env.DB.batch(childStatements.slice(i,i+80));
 return json({templates:templates.map(t=>({...t,steps:byTemplate.get(t.id)||[]})),generated_through:horizon});
}

export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);
 if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request)||{},action=String(b.action||"create");
 const id=String(b.id||"");
 if(action==="toggle"){
  if(!id)return json({error:"Шаблон не выбран"},400);
  const active=b.active?1:0;
  const r=await env.DB.prepare("UPDATE task_templates SET active=?,updated_at=datetime('now') WHERE id=? AND user_id=?").bind(active,id,user.id).run();
  if(!r.meta.changes)return json({error:"Шаблон не найден"},404);
  if(!active){const settings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();const today=todayInZone(settings?.timezone);await env.DB.prepare("DELETE FROM tasks WHERE template_id=? AND user_id=? AND due_date>? AND status=?").bind(id,user.id,today,"todo").run();}
  return json({ok:true});
 }
 if(action!=="create")return json({error:"Неизвестное действие"},400);
 const title=String(b.title||"").trim(),description=String(b.description||"").trim().slice(0,2000);
 const recurrence=String(b.recurrence||"");
 const startDate=String(b.start_date||""),endDate=b.end_date?String(b.end_date):null;
 const lifeAreaId=b.life_area_id?String(b.life_area_id):null,directionId=b.direction_id?String(b.direction_id):null;
 const priority=["low","medium","high"].includes(b.priority)?b.priority:"medium";
 const estimated=b.estimated_minutes==null||b.estimated_minutes===""?null:Math.round(Number(b.estimated_minutes));
 const steps=normalizeRecurringSteps(b.steps);
 if(!steps)return json({error:"Добавь не более 30 подзадач, до 240 символов каждая"},400);
 if(!title||title.length>240)return json({error:"Укажи название задачи (до 240 символов)"},400);
 if(!["daily","weekly","monthly"].includes(recurrence))return json({error:"Выбери повторение"},400);
 if(!validDate(startDate))return json({error:"Проверь дату начала"},400);
 if(endDate&&(!validDate(endDate)||endDate<startDate))return json({error:"Дата окончания не может быть раньше начала"},400);
 if(estimated!==null&&(!Number.isInteger(estimated)||estimated<5||estimated>10000))return json({error:"Проверь оценку времени"},400);
 for(const [table,value,label] of [["life_areas",lifeAreaId,"Личная область"],["directions",directionId,"Направление"]]){
  if(value&&!await env.DB.prepare(`SELECT id FROM ${table} WHERE id=? AND user_id=? AND active=1`).bind(value,user.id).first())return json({error:label+" не найдены"},404);
 }
 const templateId=newId();
 await env.DB.prepare("INSERT INTO task_templates (id,user_id,title,description,life_area_id,direction_id,priority,estimated_minutes,recurrence,start_date,end_date,active) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)")
  .bind(templateId,user.id,title,description,lifeAreaId,directionId,priority,estimated,recurrence,startDate,endDate).run();
 if(steps.length){
  const inserts=steps.map((step,index)=>env.DB.prepare("INSERT INTO task_template_steps (id,template_id,user_id,title,sort_order) VALUES (?,?,?,?,?)").bind(newId(),templateId,user.id,step,index));
  await env.DB.batch(inserts);
 }
 return json({ok:true,id:templateId,step_count:steps.length},201);
}
