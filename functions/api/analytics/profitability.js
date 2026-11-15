import { json, requireUser } from "../../_lib/auth.js";
import { buildProfitability, attachObservedSalesMetrics } from "../../_lib/profitability.js";
import { buildObservedSalesFunnel } from "../../_lib/observed-sales-funnel.js";
import { buildTimeAllocationRecommendations } from "../../_lib/time-allocation.js";
import { localDateForInstant } from "../../_lib/work-time-overlap.js";
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function validDate(v){if(!DATE.test(v))return false;const d=new Date(v+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
function inZone(zone){const p=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),o=Object.fromEntries(p.map(x=>[x.type,x.value]));return o.year+"-"+o.month+"-"+o.day;}
function shift(v,n){const d=new Date(v+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const settings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first(),today=inZone(settings?.timezone||"Europe/Moscow"),url=new URL(request.url),to=String(url.searchParams.get("to")||today),from=String(url.searchParams.get("from")||shift(to,-89));
 if(!validDate(from)||!validDate(to)||from>to||Math.ceil((Date.parse(to+"T00:00:00Z")-Date.parse(from+"T00:00:00Z"))/86400000)>365)return json({error:"Укажи корректный период до 366 дней"},400);
 const [income,expenses,tasks,openTaskTime,interactions,dealEvents]=await Promise.all([
 env.DB.prepare("SELECT i.direction_id,COALESCE(d.title,'Без направления') direction_title,SUM(i.amount) total FROM income_entries i LEFT JOIN directions d ON d.id=i.direction_id AND d.user_id=i.user_id WHERE i.user_id=? AND i.received_on>=? AND i.received_on<=? GROUP BY i.direction_id,d.title").bind(user.id,from,to).all(),
 env.DB.prepare("SELECT e.direction_id,COALESCE(d.title,'Без направления') direction_title,SUM(e.amount) total FROM expenses e LEFT JOIN directions d ON d.id=e.direction_id AND d.user_id=e.user_id WHERE e.user_id=? AND e.spent_on>=? AND e.spent_on<=? GROUP BY e.direction_id,d.title").bind(user.id,from,to).all(),
 env.DB.prepare("SELECT t.direction_id,COALESCE(d.title,'Без направления') direction_title,COUNT(*) completed_tasks,COALESCE(SUM(t.actual_minutes),0) actual_minutes FROM tasks t LEFT JOIN directions d ON d.id=t.direction_id AND d.user_id=t.user_id WHERE t.user_id=? AND t.status='done' AND t.completed_at IS NOT NULL AND substr(t.completed_at,1,10)>=? AND substr(t.completed_at,1,10)<=? GROUP BY t.direction_id,d.title").bind(user.id,from,to).all(),
 env.DB.prepare("SELECT e.task_id,e.started_at,e.duration_minutes,t.status,t.completed_at,CASE WHEN e.attribution_captured=1 THEN e.direction_id ELSE COALESCE(t.direction_id,p.direction_id,c.direction_id) END AS direction_id,COALESCE(CASE WHEN e.attribution_captured=1 THEN e.direction_title ELSE d.title END,'Без направления') direction_title FROM task_time_entries e JOIN tasks t ON t.id=e.task_id AND t.user_id=e.user_id LEFT JOIN projects p ON p.id=t.project_id AND p.user_id=t.user_id LEFT JOIN clients c ON c.id=t.client_id AND c.user_id=t.user_id LEFT JOIN directions d ON d.id=COALESCE(t.direction_id,p.direction_id,c.direction_id) AND d.user_id=t.user_id WHERE e.user_id=? AND e.ended_at IS NOT NULL AND e.started_at>=? AND e.started_at<?").bind(user.id,shift(from,-2)+"T00:00:00.000Z",shift(to,2)+"T00:00:00.000Z").all(),
 env.DB.prepare("SELECT c.direction_id,ci.client_id,MIN(ci.occurred_on) first_contact_on FROM client_interactions ci JOIN clients c ON c.id=ci.client_id AND c.user_id=ci.user_id WHERE ci.user_id=? AND ci.interaction_type IN ('call','email','message') AND ci.occurred_on>=date(?,'-89 days') AND ci.occurred_on<=? AND c.direction_id IS NOT NULL GROUP BY c.direction_id,ci.client_id").bind(user.id,to,to).all(),
 env.DB.prepare("SELECT d.direction_id,d.client_id,e.changes_json,e.created_at FROM deal_events e JOIN deals d ON d.id=e.deal_id AND d.user_id=e.user_id WHERE e.user_id=? AND e.created_at>=datetime(date(?,'-89 days')) AND e.created_at<datetime(?,'+1 day') AND d.client_id IS NOT NULL AND d.direction_id IS NOT NULL").bind(user.id,to,to).all()
 ]);
 const timezone=settings?.timezone||"Europe/Moscow",trackedByDirection=new Map();
 for(const row of openTaskTime.results){
  const localDate=localDateForInstant(row.started_at,timezone);
  if(!localDate||localDate<from||localDate>to)continue;
  const completionDate=row.completed_at?localDateForInstant(row.completed_at,timezone):null;
  if(row.status==="done"&&completionDate>=from&&completionDate<=to)continue;
  const key=row.direction_id||"unassigned",current=trackedByDirection.get(key)||{direction_id:row.direction_id||null,direction_title:row.direction_title,activeTaskIds:new Set(),tracked_minutes:0};
  current.activeTaskIds.add(row.task_id);
  current.tracked_minutes+=Math.max(0,Number(row.duration_minutes)||0);
  trackedByDirection.set(key,current);
 }
 const trackedRows=[...trackedByDirection.values()].map(row=>({direction_id:row.direction_id,direction_title:row.direction_title,active_tasks:row.activeTaskIds.size,tracked_minutes:row.tracked_minutes}));
 const result=buildProfitability({incomeRows:income.results,expenseRows:expenses.results,taskRows:tasks.results,openTaskRows:trackedRows});
 const funnel=buildObservedSalesFunnel({interactionRows:interactions.results,dealEventRows:dealEvents.results});
 const directions=attachObservedSalesMetrics(result.directions,funnel);
 const requestedHours=Number(url.searchParams.get("available_hours")||5);
 if(!Number.isFinite(requestedHours)||requestedHours<=0||requestedHours>80)return json({error:"Укажи от 0 до 80 дополнительных часов"},400);
 const time_allocation=buildTimeAllocationRecommendations(directions,requestedHours);
 return json({period:{from,to,timezone},funnel_period_days:90,summary:result.summary,directions,time_allocation});
}
