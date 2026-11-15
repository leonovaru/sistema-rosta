import { json, requireUser } from "../../_lib/auth.js";
import { buildRevenueScenarios } from "../../_lib/revenue-scenarios.js";
function shift(v,n){const d=new Date(v+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function todayInZone(zone){const p=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),o=Object.fromEntries(p.map(x=>[x.type,x.value]));return o.year+"-"+o.month+"-"+o.day;}
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const settings=await env.DB.prepare("SELECT timezone,monthly_target,daily_capacity_minutes FROM settings WHERE user_id=?").bind(user.id).first(),zone=settings?.timezone||"Europe/Moscow",today=todayInZone(zone),from=shift(today,-89);
 const [directions,income,tasks]=await Promise.all([
  env.DB.prepare("SELECT d.id,d.title,COALESCE(t.share_percent,0) share_percent,COALESCE(t.average_sale_amount,0) average_sale_amount FROM directions d LEFT JOIN direction_revenue_targets t ON t.direction_id=d.id AND t.user_id=d.user_id WHERE d.user_id=? ORDER BY d.sort_order,d.id").bind(user.id).all(),
  env.DB.prepare("SELECT direction_id,SUM(amount) revenue FROM income_entries WHERE user_id=? AND received_on>=? AND received_on<=? GROUP BY direction_id").bind(user.id,from,today).all(),
  env.DB.prepare("SELECT direction_id,SUM(actual_minutes) actual_minutes FROM tasks WHERE user_id=? AND status='done' AND completed_at IS NOT NULL AND substr(completed_at,1,10)>=? AND substr(completed_at,1,10)<=? GROUP BY direction_id").bind(user.id,from,today).all()
 ]);
 const daily=n(settings?.daily_capacity_minutes)||300;
 return json({period:{from,to:today,days:90,timezone:zone},...buildRevenueScenarios({monthlyTarget:settings?.monthly_target||300000,directionRows:directions.results,actualRows:income.results,taskRows:tasks.results,weeklyCapacityHours:daily*5/60})});
}
function n(v){const x=Number(v);return Number.isFinite(x)&&x>0?x:0;}
