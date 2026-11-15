import { json, requireUser } from "../../_lib/auth.js";
import { expandRecurringEvents } from "../../_lib/calendar.js";
import { calculateCalendarBusyByDay } from "../../_lib/calendar-capacity.js";
import { buildWeeklyWorkload } from "../../_lib/weekly-workload.js";
function localDate(timeZone){const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));return values.year+"-"+values.month+"-"+values.day;}
function addDays(date,days){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);
 if(!user)return json({error:"Необходим вход"},401);
 const settings=await env.DB.prepare("SELECT timezone,daily_capacity_minutes,work_capacity_configured,working_days_json FROM settings WHERE user_id=?").bind(user.id).first();
 const timezone=settings?.timezone||"Europe/Moscow",today=localDate(timezone),end=addDays(today,6),endExclusive=addDays(end,1);
 let workingDays=[];try{workingDays=JSON.parse(settings?.working_days_json||"[]");}catch{}
 const [calendarRows,taskRows]=await Promise.all([
  env.DB.prepare("SELECT id,title,event_type,start_at,end_at,actual_start_at,actual_end_at,status,mode,location,repeat_rule,repeat_until FROM calendar_events WHERE user_id=? AND status!='cancelled' AND ((start_at < ? AND end_at > ?) OR (repeat_rule!='none' AND start_at < ? AND repeat_until >= ?)) ORDER BY start_at").bind(user.id,endExclusive+"T00:00",today+"T00:00",endExclusive+"T00:00",today).all(),
  env.DB.prepare("SELECT t.id,t.title,t.status,t.priority,t.due_date,t.estimated_minutes,t.actual_minutes,t.direction_id,d.title AS direction_title FROM tasks t LEFT JOIN directions d ON d.id=t.direction_id WHERE t.user_id=? AND t.status IN ('todo','doing','waiting') ORDER BY t.due_date IS NULL,t.due_date,CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END").bind(user.id).all()
 ]);
 const events=expandRecurringEvents(calendarRows.results,today+"T00:00",endExclusive+"T00:00");
 const calendarDays=calculateCalendarBusyByDay(events,today,7,workingDays);
 const configured=Number(settings?.work_capacity_configured)===1&&workingDays.length>0&&Number(settings?.daily_capacity_minutes)>0;
 return json({week:buildWeeklyWorkload({today,workingDays,dailyCapacityMinutes:settings?.daily_capacity_minutes,configured,calendarDays,tasks:taskRows.results})});
}
