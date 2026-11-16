import { json, requireUser } from "../../_lib/auth.js";
import { buildRevenueScenarios } from "../../_lib/revenue-scenarios.js";
import { localDateForInstant } from "../../_lib/work-time-overlap.js";
function shift(v,n){const d=new Date(v+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function todayInZone(zone){const p=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),o=Object.fromEntries(p.map(x=>[x.type,x.value]));return o.year+"-"+o.month+"-"+o.day;}
function monthStart(v){return v.slice(0,7)+"-01";}
function n(v){const x=Number(v);return Number.isFinite(x)&&x>0?x:0;}
function workDays(settings){
 try{const parsed=JSON.parse(settings?.working_days_json||"[]");return Array.isArray(parsed)?parsed.filter(x=>Number.isInteger(Number(x))&&Number(x)>=1&&Number(x)<=7).length:5;}catch{return 5;}
}
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const settings=await env.DB.prepare("SELECT timezone,monthly_target,daily_capacity_minutes,working_days_json,work_capacity_configured FROM settings WHERE user_id=?").bind(user.id).first();
 const zone=settings?.timezone||"Europe/Moscow",today=todayInZone(zone),from=shift(today,-89),start=monthStart(today),daysInMonth=new Date(Number(today.slice(0,4)),Number(today.slice(5,7)),0).getDate(),elapsedDays=Number(today.slice(8,10)),remainingDays=Math.max(0,daysInMonth-elapsedDays);
 const [directions,monthIncome,historyIncome,tasks,timerEntries]=await Promise.all([
  env.DB.prepare("SELECT d.id,d.title,COALESCE(t.share_percent,0) share_percent,COALESCE(t.average_sale_amount,0) average_sale_amount FROM directions d LEFT JOIN direction_revenue_targets t ON t.direction_id=d.id AND t.user_id=d.user_id WHERE d.user_id=? ORDER BY d.sort_order,d.id").bind(user.id).all(),
  env.DB.prepare("SELECT direction_id,SUM(amount) revenue FROM income_entries WHERE user_id=? AND received_on>=? AND received_on<=? GROUP BY direction_id").bind(user.id,start,today).all(),
  env.DB.prepare("SELECT direction_id,SUM(amount) revenue FROM income_entries WHERE user_id=? AND received_on>=? AND received_on<=? GROUP BY direction_id").bind(user.id,from,today).all(),
  env.DB.prepare("SELECT direction_id,SUM(actual_minutes) actual_minutes FROM tasks WHERE user_id=? AND status='done' AND completed_at IS NOT NULL AND substr(completed_at,1,10)>=? AND substr(completed_at,1,10)<=? GROUP BY direction_id").bind(user.id,from,today).all(),
  env.DB.prepare("SELECT e.task_id,e.started_at,e.duration_minutes,t.status,t.completed_at,t.direction_id FROM task_time_entries e JOIN tasks t ON t.id=e.task_id AND t.user_id=e.user_id WHERE e.user_id=? AND e.ended_at IS NOT NULL AND e.started_at>=? AND e.started_at<?").bind(user.id,shift(from,-2)+"T00:00:00.000Z",shift(today,2)+"T00:00:00.000Z").all()
 ]);
 const timeByDirection=new Map(tasks.results.map(row=>[row.direction_id||"",n(row.actual_minutes)]));
 for(const entry of timerEntries.results){
  const date=localDateForInstant(entry.started_at,zone);
  if(!date||date<from||date>today)continue;
  const completed=entry.completed_at?localDateForInstant(entry.completed_at,zone):null;
  if(entry.status==="done"&&completed>=from&&completed<=today)continue;
  const key=entry.direction_id||"";
  timeByDirection.set(key,(timeByDirection.get(key)||0)+n(entry.duration_minutes));
 }
 const taskRows=[...timeByDirection].map(([direction_id,actual_minutes])=>({direction_id,actual_minutes}));
 const daily=n(settings?.daily_capacity_minutes)||300,days=workDays(settings),capacityConfigured=Boolean(settings?.work_capacity_configured);
 const weeklyCapacityHours=capacityConfigured?daily*days/60:0;
 const target=n(settings?.monthly_target)||300000;
 return json({period:{month_start:start,month_to:today,history_from:from,history_to:today,history_days:90,elapsed_days:elapsedDays,days_in_month:daysInMonth,remaining_days:remainingDays,timezone:zone},capacity_configured:capacityConfigured,work_days_per_week:days,...buildRevenueScenarios({monthlyTarget:target,directionRows:directions.results,actualRows:monthIncome.results,historyRows:historyIncome.results,taskRows,weeklyCapacityHours,elapsedDays,daysInMonth,remainingDays})});
}
