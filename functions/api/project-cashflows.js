import {json,requireUser,readJson,newId} from "../_lib/auth.js";
const DATE=/^\\d{4}-\\d{2}-\\d{2}$/;
function validDate(v){if(!DATE.test(v))return false;const d=new Date(v+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
async function projectForUser(env,userId,projectId){return env.DB.prepare("SELECT id,client_id FROM projects WHERE id=? AND user_id=?").bind(projectId,userId).first();}
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const url=new URL(request.url),projectId=url.searchParams.get("project_id");
 if(!projectId)return json({error:"Не указан проект"},400);
 const project=await projectForUser(env,user.id,projectId);if(!project)return json({error:"Проект не найден"},404);
 const rows=await env.DB.prepare("SELECT id,flow_type,title,amount,expected_date,note,status,created_at FROM planned_cashflows WHERE user_id=? AND project_id=? ORDER BY expected_date,id").bind(user.id,projectId).all();
 const items=rows.results.map(x=>({...x,amount:Number(x.amount)}));
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Moscow"}).format(new Date());
 let balance=0,minBalance=0,firstNegative=null;
 const future=items.filter(x=>x.status==="planned"&&x.expected_date>=today);
 const byDate=new Map();for(const x of future)byDate.set(x.expected_date,(byDate.get(x.expected_date)||0)+(x.flow_type==="income"?x.amount:-x.amount));
 for(const [date,delta] of [...byDate.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){balance+=delta;if(balance<minBalance){minBalance=balance;if(!firstNegative)firstNegative=date;}}
 return json({project_id:projectId,items,forecast:{planned_incoming:future.filter(x=>x.flow_type==="income").reduce((s,x)=>s+x.amount,0),planned_outgoing:future.filter(x=>x.flow_type==="expense").reduce((s,x)=>s+x.amount,0),net:balance,minimum_cumulative: minBalance,first_negative_date:firstNegative}});
}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request),projectId=String(b.project_id||""),type=String(b.flow_type||""),title=String(b.title||"").trim(),amount=Number(b.amount),date=String(b.expected_date||"");
 const project=await projectForUser(env,user.id,projectId);if(!project)return json({error:"Проект не найден"},404);
 if(!title||title.length>180||!Number.isFinite(amount)||amount<=0||amount>100000000||!validDate(date)||!["income","expense"].includes(type))return json({error:"Проверь название, сумму, дату и тип записи"},400);
 const id=newId();await env.DB.prepare("INSERT INTO planned_cashflows(id,user_id,flow_type,title,amount,expected_date,note,project_id,client_id) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,user.id,type,title,amount,date,String(b.note||"").slice(0,500),projectId,project.client_id||null).run();
 return json({ok:true,id},201);
}
export async function onRequestPatch({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request),id=String(b.id||""),status=String(b.status||"");
 if(!id||!["planned","realized","cancelled"].includes(status))return json({error:"Некорректный статус записи"},400);
 const result=await env.DB.prepare("UPDATE planned_cashflows SET status=? WHERE id=? AND user_id=? AND project_id IN (SELECT id FROM projects WHERE user_id=?)").bind(status,id,user.id,user.id).run();
 if(!result.meta.changes)return json({error:"Плановая запись не найдена"},404);
 return json({ok:true});
}
export async function onRequestDelete({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request),id=String(b.id||"");if(!id)return json({error:"Не указана запись"},400);
 const result=await env.DB.prepare("DELETE FROM planned_cashflows WHERE id=? AND user_id=? AND project_id IN (SELECT id FROM projects WHERE user_id=?)").bind(id,user.id,user.id).run();
 if(!result.meta.changes)return json({error:"Плановая запись не найдена"},404);
 return json({ok:true});
}
