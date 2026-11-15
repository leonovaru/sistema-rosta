import { json, requireUser, readJson, newId } from "../../_lib/auth.js";
import { applySavedDailyTaskAllocations } from "../../_lib/daily-task-assignments.js";
import { expandRecurringEvents } from "../../_lib/calendar.js";
import { calculateCalendarBusyByDay } from "../../_lib/calendar-capacity.js";
import { buildWeeklyWorkload } from "../../_lib/weekly-workload.js";
import { validateDailyTaskMove } from "../../_lib/daily-task-move-validation.js";
import { buildDailyBlockPlans } from "../../_lib/daily-block-plans.js";
function addDays(date,days){const value=new Date(date+"T12:00:00Z");value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
function localDate(timeZone){const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));return values.year+"-"+values.month+"-"+values.day;}
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const url=new URL(request.url),from=url.searchParams.get("from"),to=url.searchParams.get("to");
 if(!from||!to||!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||to<from||to>addDays(from,6))return json({error:"Укажите корректный период до 7 дней"},400);
 const {results}=await env.DB.prepare("SELECT task_id,allocation_date,minutes FROM daily_task_allocations WHERE user_id=? AND allocation_date>=? AND allocation_date<=? ORDER BY allocation_date,task_id").bind(user.id,from,to).all();
 return json({allocations:results});
}
export async function onRequestPut({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const body=await readJson(request)||{},schedules=body.schedules,move=body.move||null;
 if(!Array.isArray(schedules)||!schedules.length||schedules.length>50)return json({error:"Передан некорректный список назначений"},400);
 const settings=await env.DB.prepare("SELECT timezone,working_days_json,work_capacity_configured,daily_capacity_minutes FROM settings WHERE user_id=?").bind(user.id).first();
 const today=localDate(settings?.timezone||"Europe/Moscow"),weekEnd=addDays(today,6);
 let workingDays=[];try{workingDays=JSON.parse(settings?.working_days_json||"[]").map(Number);}catch{}
 if(Number(settings?.work_capacity_configured)!==1||!workingDays.length||Number(settings?.daily_capacity_minutes)<=0)return json({error:"Сначала настройте рабочие дни и дневную ёмкость"},400);
 const seenTasks=new Set(),normalized=[];
 for(const schedule of schedules){
  const taskId=String(schedule?.task_id||"");
  if(!taskId||seenTasks.has(taskId)||!Array.isArray(schedule.allocations)||!schedule.allocations.length||schedule.allocations.length>7)return json({error:"Проверьте список задач и их дневных назначений"},400);
  seenTasks.add(taskId);
  const task=await env.DB.prepare("SELECT id,status,due_date,estimated_minutes,actual_minutes FROM tasks WHERE id=? AND user_id=?").bind(taskId,user.id).first();
  if(!task||!["todo","doing"].includes(task.status))return json({error:"Одна из задач не найдена или уже не активна"},404);
  const remaining=Math.max(0,Number(task.estimated_minutes||0)-(task.status==="doing"?Number(task.actual_minutes||0):0));
  if(!remaining)return json({error:"У задачи нет оставшегося оценённого времени"},400);
  const seenDates=new Set();let total=0;const rows=[];
  for(const allocation of schedule.allocations){
   const date=String(allocation?.date||""),minutes=Number(allocation?.minutes);
   const parsedDate=new Date(date+"T12:00:00Z"),weekday=parsedDate.getUTCDay()||7;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==date||date<today||date>weekEnd||!workingDays.includes(weekday)||(task.due_date&&date>task.due_date)||seenDates.has(date)||!Number.isInteger(minutes)||minutes<=0||minutes>10000)return json({error:"Назначение выходит за пределы недели, рабочего дня или срока задачи"},400);
   seenDates.add(date);total+=minutes;rows.push({date,minutes});
  }
  if(total!==remaining)return json({error:"Сумма дневных назначений должна совпадать с оставшейся оценкой задачи"},400);
  normalized.push({taskId,rows});
 }
 if(move){
  const taskId=String(move.task_id||""),fromDate=String(move.from_date||""),toDate=String(move.to_date||""),moveMinutes=Number(move.minutes);
  const schedule=normalized.find(item=>item.taskId===taskId);
  if(!schedule||normalized.length!==1||!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)||!/^\d{4}-\d{2}-\d{2}$/.test(toDate)||fromDate===toDate||!Number.isInteger(moveMinutes)||moveMinutes<=0||!/^\d{2}:\d{2}$/.test(String(move.start_time||""))||!/^\d{2}:\d{2}$/.test(String(move.end_time||"")))return json({error:"Параметры переноса некорректны"},400);
  const oldTask=await env.DB.prepare("SELECT id,status,due_date,estimated_minutes,actual_minutes FROM tasks WHERE id=? AND user_id=?").bind(taskId,user.id).first();
  if(!oldTask||!["todo","doing"].includes(oldTask.status))return json({error:"Задача больше не активна"},409);
  const allTasks=await env.DB.prepare("SELECT id,title,status,due_date,estimated_minutes,actual_minutes,project_id,life_area_id,direction_id,client_id FROM tasks WHERE user_id=? AND status IN ('todo','doing','waiting')").bind(user.id).all();
  const calendarRows=await env.DB.prepare("SELECT id,title,event_type,start_at,end_at,actual_start_at,actual_end_at,status,repeat_rule,repeat_until FROM calendar_events WHERE user_id=? AND status!='cancelled' AND ((start_at < ? AND end_at > ?) OR (repeat_rule!='none' AND start_at < ? AND repeat_until >= ?)) ORDER BY start_at").bind(user.id,addDays(weekEnd,1)+"T00:00",today+"T00:00",addDays(weekEnd,1)+"T00:00",today).all();
  const events=expandRecurringEvents(calendarRows.results,today+"T00:00",addDays(weekEnd,1)+"T00:00");
  const calendarDays=calculateCalendarBusyByDay(events,today,7,workingDays);
  const baseWeek=buildWeeklyWorkload({today,workingDays,dailyCapacityMinutes:settings?.daily_capacity_minutes,configured:true,calendarDays,calendarEvents:events,tasks:allTasks.results,targets:[]});
  const existingRows=await env.DB.prepare("SELECT task_id,allocation_date,minutes FROM daily_task_allocations WHERE user_id=? AND allocation_date>=? AND allocation_date<=?").bind(user.id,today,weekEnd).all();
  applySavedDailyTaskAllocations(baseWeek,existingRows.results,allTasks.results);
  const preferences=move.preferences||{};
  const focusMinutes=Math.max(15,Math.min(120,Math.round(Number(preferences.focus_minutes)||50)));
  const breakMinutes=Math.max(3,Math.min(30,Math.round(Number(preferences.break_minutes)||10)));
  const prepBeforeMinutes=Math.max(0,Math.min(120,Math.round(Number(preferences.prep_before_minutes)||0)));
  const bufferAfterMinutes=Math.max(0,Math.min(120,Math.round(Number(preferences.buffer_after_minutes)||0)));
  const startOfDay=/^\d{2}:\d{2}$/.test(String(preferences.start_time||""))?preferences.start_time:"09:00";
  const targetDay=baseWeek.days.find(day=>day.date===toDate);
  const targetSlotPlan=targetDay?buildDailyBlockPlans([{...targetDay,tasks:targetDay.tasks?.length?targetDay.tasks:[{id:null,title:"",minutes:0}]}],{focusMinutes,breakMinutes,startTime:startOfDay,prepBeforeMinutes,bufferAfterMinutes,calendarEvents:events})[0]:null;
  const validation=validateDailyTaskMove({week:baseWeek,taskId,fromDate,toDate,minutes:moveMinutes,rows:schedule.rows,startTime:move.start_time,endTime:move.end_time,targetSlotPlan});
  if(!validation.ok)return json({error:validation.error},409);
 }
 const statements=[];
 for(const schedule of normalized){
  statements.push(env.DB.prepare("DELETE FROM daily_task_allocations WHERE user_id=? AND task_id=?").bind(user.id,schedule.taskId));
  for(const row of schedule.rows)statements.push(env.DB.prepare("INSERT INTO daily_task_allocations (id,user_id,task_id,allocation_date,minutes,updated_at) VALUES (?,?,?,?,?,datetime('now'))").bind(newId(),user.id,schedule.taskId,row.date,row.minutes));
 }
 await env.DB.batch(statements);
 return json({ok:true,saved:normalized.length});
}
