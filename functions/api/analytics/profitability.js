import { json, requireUser } from "../../_lib/auth.js";
import { buildProfitability } from "../../_lib/profitability.js";
import { localDateForInstant } from "../../_lib/work-time-overlap.js";
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function validDate(v){if(!DATE.test(v))return false;const d=new Date(v+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
function inZone(zone){const p=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),o=Object.fromEntries(p.map(x=>[x.type,x.value]));return o.year+"-"+o.month+"-"+o.day;}
function shift(v,n){const d=new Date(v+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const settings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first(),today=inZone(settings?.timezone||"Europe/Moscow"),url=new URL(request.url),to=String(url.searchParams.get("to")||today),from=String(url.searchParams.get("from")||shift(to,-89));
 if(!validDate(from)||!validDate(to)||from>to||Math.ceil((Date.parse(to+"T00:00:00Z")-Date.parse(from+"T00:00:00Z"))/86400000)>365)return json({error:"Укажи корректный период до 366 дней"},400);
 const [income,expenses,tasks,openTaskTime]=await Promise.all([
 env.DB.prepare("SELECT i.direction_id,COALESCE(d.title,'Без направления') direction_title,SUM(i.amount) total FROM income_entries i LEFT JOIN directions d ON d.id=i.direction_id AND d.user_id=i.user_id WHERE i.user_id=? AND i.received_on>=? AND i.received_on<=? GROUP BY i.direction_id,d.title").bind(user.id,from,to).all(),
 env.DB.prepare("SELECT e.direction_id,COALESCE(d.title,'Без направления') direction_title,SUM(e.amount) total FROM expenses e LEFT JOIN directions d ON d.id=e.direction_id AND d.user_id=e.user_id WHERE e.user_id=? AND e.spent_on>=? AND e.spent_on<=? GROUP BY e.direction_id,d.title").bind(user.id,from,to).all(),
 env.DB.prepare("SELECT t.direction_id,COALESCE(d.title,'Без направления') direction_title,COUNT(*) completed_tasks,COALESCE(SUM(t.actual_minutes),0) actual_minutes FROM tasks t LEFT JOIN directions d ON d.id=t.direction_id AND d.user_id=t.user_id WHERE t.user_id=? AND t.status='done' AND t.completed_at IS NOT NULL AND substr(t.completed_at,1,10)>=? AND substr(t.completed_at,1,10)<=? GROUP BY t.direction_id,d.title").bind(user.id,from,to).all(),
 env.DB.prepare("SELECT e.task_id,e.started_at,e.duration_minutes,t.direction_id,COALESCE(d.title,'Без направления') direction_title FROM task_time_entries e JOIN tasks t ON t.id=e.task_id AND t.user_id=e.user_id LEFT JOIN directions d ON d.id=t.direction_id AND d.user_id=t.user_id WHERE e.user_id=? AND t.status!='done' AND e.ended_at IS NOT NULL AND e.started_at>=? AND e.started_at<?").bind(user.id,shift(from,-2)+"T00:00:00.000Z",shift(to,2)+"T00:00:00.000Z").all()
 ]);
 const timezone=settings?.timezone||"Europe/Moscow",trackedByDirection=new Map();
 for(const row of openTaskTime.results){
  const localDate=localDateForInstant(row.started_at,timezone);
  if(!localDate||localDate<from||localDate>to)continue;
  const key=row.direction_id||"unassigned",current=trackedByDirection.get(key)||{direction_id:row.direction_id||null,direction_title:row.direction_title,activeTaskIds:new Set(),tracked_minutes:0};
  current.activeTaskIds.add(row.task_id);
  current.tracked_minutes+=Math.max(0,Number(row.duration_minutes)||0);
  trackedByDirection.set(key,current);
 }
 const trackedRows=[...trackedByDirection.values()].map(row=>({direction_id:row.direction_id,direction_title:row.direction_title,active_tasks:row.activeTaskIds.size,tracked_minutes:row.tracked_minutes}));
 return json({period:{from,to,timezone},...buildProfitability({incomeRows:income.results,expenseRows:expenses.results,taskRows:tasks.results,openTaskRows:trackedRows})});
}
