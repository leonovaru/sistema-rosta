import {json,requireUser,readJson,newId} from "../_lib/auth.js";
import {summarizeProjectCashflow} from "../_lib/project-cashflow.js";
import {isClientSelectable,isProjectSelectable} from "../_lib/workspace-entity-availability.js";
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function validDate(v){if(!DATE.test(v))return false;const d=new Date(v+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
async function projectForUser(env,userId,projectId){return env.DB.prepare("SELECT id,client_id,status FROM projects WHERE id=? AND user_id=?").bind(projectId,userId).first();}
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const url=new URL(request.url),projectId=url.searchParams.get("project_id");
 if(!projectId)return json({error:"Не указан проект"},400);
 const project=await projectForUser(env,user.id,projectId);if(!project)return json({error:"Проект не найден"},404);
 const rows=await env.DB.prepare("SELECT p.id,p.flow_type,p.title,p.amount,p.expected_date,p.note,p.status,p.created_at,COALESCE(SUM(r.amount),0) AS realized_amount FROM planned_cashflows p LEFT JOIN planned_cashflow_realizations r ON r.planned_cashflow_id=p.id AND r.user_id=p.user_id WHERE p.user_id=? AND p.project_id=? AND p.archived_at IS NULL GROUP BY p.id ORDER BY p.expected_date,p.id").bind(user.id,projectId).all();
 const items=rows.results.map(x=>({...x,amount:Number(x.amount),realized_amount:Number(x.realized_amount)}));
 const [incomeRows,expenseRows]=await Promise.all([
  env.DB.prepare("SELECT i.id,i.amount,i.received_on,i.note,i.direction_title_snapshot FROM income_entries i WHERE i.user_id=? AND (i.project_id=? OR i.project_id_snapshot=?) AND NOT EXISTS (SELECT 1 FROM planned_cashflow_realizations r WHERE r.income_entry_id=i.id) ORDER BY i.received_on DESC LIMIT 100").bind(user.id,projectId,projectId).all(),
  env.DB.prepare("SELECT e.id,e.amount,e.spent_on,e.title,e.direction_title_snapshot FROM expenses e WHERE e.user_id=? AND (e.project_id=? OR e.project_id_snapshot=?) AND NOT EXISTS (SELECT 1 FROM planned_cashflow_realizations r WHERE r.expense_id=e.id) ORDER BY e.spent_on DESC LIMIT 100").bind(user.id,projectId,projectId).all()
 ]);
 const settings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:settings?.timezone||"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 return json({project_id:projectId,items,actual_candidates:{income:incomeRows.results,expense:expenseRows.results},forecast:summarizeProjectCashflow(items,{today})});
}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request),projectId=String(b.project_id||""),type=String(b.flow_type||""),title=String(b.title||"").trim(),amount=Number(b.amount),date=String(b.expected_date||"");
 const project=await projectForUser(env,user.id,projectId);if(!project)return json({error:"Проект не найден"},404);
 if(!isProjectSelectable(project)||project.status==="done")return json({error:"Нельзя добавлять плановые платежи в завершённый или архивный проект"},409);
 if(project.client_id){const client=await env.DB.prepare("SELECT status FROM clients WHERE id=? AND user_id=?").bind(project.client_id,user.id).first();if(!isClientSelectable(client))return json({error:"Нельзя создавать платежи для закрытого клиента"},409);}
 if(!title||title.length>180||!Number.isFinite(amount)||amount<=0||amount>100000000||!validDate(date)||!["income","expense"].includes(type))return json({error:"Проверь название, сумму, дату и тип записи"},400);
 const id=newId();await env.DB.prepare("INSERT INTO planned_cashflows(id,user_id,flow_type,title,amount,expected_date,note,project_id,client_id) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,user.id,type,title,amount,date,String(b.note||"").slice(0,500),projectId,project.client_id||null).run();
 return json({ok:true,id},201);
}
export async function onRequestPatch({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request),id=String(b.id||""),action=String(b.action||"");
 if(action!=="link"){
  const status=String(b.status||"");
  if(!id||status!=="cancelled")return json({error:"Изменить статус можно только на «Убрано из графика»; исполнение рассчитывается по связанным операциям"},400);
  const result=await env.DB.prepare("UPDATE planned_cashflows SET status=? WHERE id=? AND user_id=? AND archived_at IS NULL AND project_id IN (SELECT id FROM projects WHERE user_id=?)").bind(status,id,user.id,user.id).run();
  if(!result.meta.changes)return json({error:"Плановая запись не найдена"},404);
  return json({ok:true});
 }
 const plan=await env.DB.prepare("SELECT id,project_id,flow_type,amount,status FROM planned_cashflows WHERE id=? AND user_id=? AND archived_at IS NULL").bind(id,user.id).first();
 if(!plan)return json({error:"Плановый платёж не найден"},404);
 if(plan.status==="cancelled")return json({error:"Убранный из графика платёж нельзя исполнить"},409);
 const actualId=String(b.actual_id||"");
 if(!actualId)return json({error:"Выбери фактическую операцию"},400);
 const isIncome=plan.flow_type==="income";
 const actual=isIncome
  ? await env.DB.prepare("SELECT id,amount FROM income_entries WHERE id=? AND user_id=? AND (project_id=? OR project_id_snapshot=?)").bind(actualId,user.id,plan.project_id,plan.project_id).first()
  : await env.DB.prepare("SELECT id,amount FROM expenses WHERE id=? AND user_id=? AND (project_id=? OR project_id_snapshot=?)").bind(actualId,user.id,plan.project_id,plan.project_id).first();
 if(!actual)return json({error:"Фактическая операция не найдена в этом проекте или не соответствует типу платежа"},404);
 const linked=await env.DB.prepare("SELECT id FROM planned_cashflow_realizations WHERE user_id=? AND "+(isIncome?"income_entry_id=?":"expense_id=?")+" LIMIT 1").bind(user.id,actualId).first();
 if(linked)return json({error:"Эта операция уже связана с другим плановым платежом"},409);
 const total=await env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM planned_cashflow_realizations WHERE user_id=? AND planned_cashflow_id=?").bind(user.id,id).first();
 const next=Number(total?.total||0)+Number(actual.amount);
 if(next>Number(plan.amount)+0.005)return json({error:"Сумма связанных операций превышает плановый платёж. Проверь выбранные операции."},409);
 const realizationId=newId();
 try{
  await env.DB.batch([
   env.DB.prepare("INSERT INTO planned_cashflow_realizations(id,user_id,planned_cashflow_id,income_entry_id,expense_id,amount) VALUES(?,?,?,?,?,?)").bind(realizationId,user.id,id,isIncome?actualId:null,isIncome?null:actualId,Number(actual.amount)),
   env.DB.prepare("UPDATE planned_cashflows SET status=CASE WHEN (SELECT COALESCE(SUM(amount),0) FROM planned_cashflow_realizations WHERE user_id=? AND planned_cashflow_id=?)>=amount-0.005 THEN 'realized' ELSE 'planned' END WHERE id=? AND user_id=? AND archived_at IS NULL").bind(user.id,id,id,user.id)
  ]);
 }catch(error){
  const message=String(error?.message||error);
  if(/UNIQUE constraint failed|Плановый платёж недоступен или превышен|Связь не соответствует фактической операции/.test(message)){
   return json({error:"Операция уже связана, платёж изменился или больше недоступен. Обнови график и проверь остаток."},409);
  }
  throw error;
 }
 return json({ok:true,realized_amount:next,remaining_amount:Math.max(0,Number(plan.amount)-next)});
}
export async function onRequestDelete({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request),id=String(b.id||"");if(!id)return json({error:"Не указана запись"},400);
 const result=await env.DB.prepare("UPDATE planned_cashflows SET archived_at=datetime('now'),status='cancelled' WHERE id=? AND user_id=? AND archived_at IS NULL AND project_id IN (SELECT id FROM projects WHERE user_id=?)").bind(id,user.id,user.id).run();
 if(!result.meta.changes)return json({error:"Плановая запись не найдена"},404);
 return json({ok:true});
}
