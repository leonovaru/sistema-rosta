import { json, requireUser } from "../_lib/auth.js";
import { buildTaskAnalytics, buildTimeAnalytics } from "../_lib/analytics.js";
const DATE=/^\\d{4}-\\d{2}-\\d{2}$/;
function validDate(value){if(!DATE.test(value))return false;const d=new Date(value+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
function dateInZone(zone){const p=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return v.year+"-"+v.month+"-"+v.day;}
function shiftDate(date,days){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export async function onRequestGet({request,env}){
  const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
  const settings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
  const today=dateInZone(settings?.timezone||"Europe/Moscow"),url=new URL(request.url);
  const to=String(url.searchParams.get("to")||today),from=String(url.searchParams.get("from")||shiftDate(to,-89));
  if(!validDate(from)||!validDate(to)||from>to||Math.ceil((Date.parse(to+"T00:00:00Z")-Date.parse(from+"T00:00:00Z"))/86400000)>365)return json({error:"Укажи корректный период до 366 дней"},400);
  const [tasks,timeRows,calendarRows]=await Promise.all([
    env.DB.prepare(`SELECT t.id,t.title,t.status,t.estimated_minutes,t.actual_minutes,t.created_at,t.completed_at,t.direction_id,d.title direction_title,t.project_id,p.title project_title,t.life_area_id,a.title life_area_title
      FROM tasks t LEFT JOIN directions d ON d.id=t.direction_id AND d.user_id=t.user_id
      LEFT JOIN projects p ON p.id=t.project_id AND p.user_id=t.user_id LEFT JOIN life_areas a ON a.id=t.life_area_id AND a.user_id=t.user_id
      WHERE t.user_id=? AND ((t.completed_at IS NOT NULL AND substr(t.completed_at,1,10)>=? AND substr(t.completed_at,1,10)<=?) OR (t.status!='done' AND substr(t.created_at,1,10)<=?))`).bind(user.id,from,to,to).all(),
    env.DB.prepare("SELECT COALESCE(SUM(duration_minutes),0) tracked_minutes,COUNT(*) sessions FROM task_time_entries WHERE user_id=? AND ended_at IS NOT NULL AND substr(started_at,1,10)>=? AND substr(started_at,1,10)<=?").bind(user.id,from,to).first(),
    env.DB.prepare(`SELECT event_type,COUNT(*) events,
      SUM(CASE WHEN status!='cancelled' THEN MAX(0,(julianday(end_at)-julianday(start_at))*1440) ELSE 0 END) planned_minutes,
      SUM(CASE WHEN actual_start_at IS NOT NULL AND actual_end_at IS NOT NULL THEN MAX(0,(julianday(actual_end_at)-julianday(actual_start_at))*1440) ELSE 0 END) actual_minutes
      FROM calendar_events WHERE user_id=? AND substr(start_at,1,10)>=? AND substr(start_at,1,10)<=? GROUP BY event_type`).bind(user.id,from,to).all()
  ]);
  const taskAnalytics=buildTaskAnalytics(tasks.results),timeAnalytics=buildTimeAnalytics([timeRows||{}],calendarRows.results);
  return json({period:{from,to,timezone:settings?.timezone||"Europe/Moscow"},...taskAnalytics,time:{...timeAnalytics,sessions:Number(timeRows?.sessions||0)}});
}
