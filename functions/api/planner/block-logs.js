import { json, requireUser, readJson, newId } from "../_lib/auth.js";

function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||"")))return false;const date=new Date(value+"T12:00:00Z");return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
function validTime(value){return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||""));}
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const url=new URL(request.url),from=url.searchParams.get("from"),to=url.searchParams.get("to");
 if(!validDate(from)||!validDate(to)||to<from||to>new Date(new Date(from+"T12:00:00Z").getTime()+6*86400000).toISOString().slice(0,10))return json({error:"Укажите корректный период до 7 дней"},400);
 const {results}=await env.DB.prepare("SELECT l.id,l.task_id,t.title AS task_title,l.block_date,l.start_time,l.end_time,l.planned_minutes,l.actual_minutes,l.status,l.note,l.created_at,l.updated_at FROM daily_block_logs l JOIN tasks t ON t.id=l.task_id AND t.user_id=l.user_id WHERE l.user_id=? AND l.block_date>=? AND l.block_date<=? ORDER BY l.block_date,l.start_time").bind(user.id,from,to).all();
 return json({logs:results});
}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const body=await readJson(request)||{},taskId=String(body.task_id||""),date=String(body.date||""),start=String(body.start_time||""),end=String(body.end_time||""),status=String(body.status||""),planned=Number(body.planned_minutes),actual=Number(body.actual_minutes);
 if(!taskId||!validDate(date)||!validTime(start)||!validTime(end)||end<=start||!Number.isInteger(planned)||planned<1||planned>720||!["done","skipped","interrupted"].includes(status))return json({error:"Проверьте параметры блока"},400);
 if(["done","interrupted"].includes(status)&&(!Number.isInteger(actual)||actual<0||actual>720))return json({error:"Укажите фактическое время от 0 до 720 минут"},400);
 if(status==="skipped"&&actual!==0&&Number.isFinite(actual))return json({error:"Для пропущенного блока фактическое время не задаётся"},400);
 const task=await env.DB.prepare("SELECT id,status FROM tasks WHERE id=? AND user_id=?").bind(taskId,user.id).first();
 if(!task)return json({error:"Задача не найдена"},404);
 const id=newId();
 await env.DB.prepare("INSERT INTO daily_block_logs (id,user_id,task_id,block_date,start_time,end_time,planned_minutes,actual_minutes,status,note,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(user_id,task_id,block_date,start_time,end_time) DO UPDATE SET planned_minutes=excluded.planned_minutes,actual_minutes=excluded.actual_minutes,status=excluded.status,note=excluded.note,updated_at=datetime('now')").bind(id,user.id,taskId,date,start,end,planned,status,String(body.note||"").slice(0,500)||null,["done","interrupted"].includes(status)?actual:0).run();
 return json({ok:true});
}
