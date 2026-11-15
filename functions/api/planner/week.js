import { json, requireUser } from "../../_lib/auth.js";
import { expandRecurringEvents } from "../../_lib/calendar.js";
import { calculateCalendarBusyByDay } from "../../_lib/calendar-capacity.js";
import { buildWeeklyWorkload } from "../../_lib/weekly-workload.js";
import { buildWeeklyAdjustmentProposals } from "../../_lib/weekly-adjustments.js";
import { buildWeeklyFocusScenarios } from "../../_lib/weekly-focus-scenarios.js";
import { attachWeeklyActualTime } from "../../_lib/weekly-actual-time.js";
import { buildEstimateAccuracy } from "../../_lib/estimate-accuracy.js";
import { buildCalibratedWeeklyLoad, toCalibratedAdjustmentDays } from "../../_lib/calibrated-weekly-load.js";
import { attachWeeklyTaskPriority } from "../../_lib/weekly-task-priority.js";
import { buildWeeklyAttentionScenarios } from "../../_lib/weekly-attention-scenarios.js";
import { buildDailyRhythmInsights } from "../../_lib/daily-rhythm-insights.js";
import { buildRecoveryInsights } from "../../_lib/recovery-insights.js";
import { buildDailyBlockPlans, buildDailyBlockScenarios } from "../../_lib/daily-block-plans.js";
function localDate(timeZone){const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));return values.year+"-"+values.month+"-"+values.day;}
function addDays(date,days){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);
 if(!user)return json({error:"Необходим вход"},401);
 const settings=await env.DB.prepare("SELECT timezone,daily_capacity_minutes,work_capacity_configured,working_days_json FROM settings WHERE user_id=?").bind(user.id).first();
 const timezone=settings?.timezone||"Europe/Moscow",today=localDate(timezone),end=addDays(today,6),endExclusive=addDays(end,1);
 let workingDays=[];try{workingDays=JSON.parse(settings?.working_days_json||"[]");}catch{}
 const [calendarRows,taskRows,targetRows,timeRows,completedRows,rhythmTimeRows,sleepRows]=await Promise.all([
  env.DB.prepare("SELECT id,title,event_type,start_at,end_at,actual_start_at,actual_end_at,status,mode,location,repeat_rule,repeat_until FROM calendar_events WHERE user_id=? AND status!='cancelled' AND ((start_at < ? AND end_at > ?) OR (repeat_rule!='none' AND start_at < ? AND repeat_until >= ?)) ORDER BY start_at").bind(user.id,endExclusive+"T00:00",today+"T00:00",endExclusive+"T00:00",today).all(),
  env.DB.prepare("SELECT t.id,t.title,t.description,t.status,t.priority,t.due_date,t.estimated_minutes,t.actual_minutes,COALESCE(t.direction_id,p.direction_id,c.direction_id) AS direction_id,d.title AS direction_title,t.life_area_id,la.title AS life_area_title,t.project_id,p.title AS project_title,t.client_id,c.name AS client_name FROM tasks t LEFT JOIN projects p ON p.id=t.project_id AND p.user_id=t.user_id LEFT JOIN clients c ON c.id=t.client_id AND c.user_id=t.user_id LEFT JOIN directions d ON d.id=COALESCE(t.direction_id,p.direction_id,c.direction_id) LEFT JOIN life_areas la ON la.id=t.life_area_id AND la.user_id=t.user_id WHERE t.user_id=? AND t.status IN ('todo','doing','waiting') ORDER BY t.due_date IS NULL,t.due_date,CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END").bind(user.id).all(),
  env.DB.prepare("SELECT wt.direction_id,wt.life_area_id,wt.project_id,wt.target_minutes,COALESCE(d.title,la.title,p.title) AS title FROM weekly_time_targets wt LEFT JOIN directions d ON d.id=wt.direction_id AND d.user_id=wt.user_id LEFT JOIN life_areas la ON la.id=wt.life_area_id AND la.user_id=wt.user_id LEFT JOIN projects p ON p.id=wt.project_id AND p.user_id=wt.user_id WHERE wt.user_id=?").bind(user.id).all(),
  env.DB.prepare("SELECT e.started_at,e.duration_minutes,t.direction_id,d.title AS direction_title,t.life_area_id,la.title AS life_area_title,t.project_id,p.title AS project_title,t.client_id,c.name AS client_name FROM task_time_entries e JOIN tasks t ON t.id=e.task_id AND t.user_id=e.user_id LEFT JOIN projects p ON p.id=t.project_id AND p.user_id=t.user_id LEFT JOIN clients c ON c.id=t.client_id AND c.user_id=t.user_id LEFT JOIN directions d ON d.id=COALESCE(t.direction_id,p.direction_id,c.direction_id) LEFT JOIN life_areas la ON la.id=t.life_area_id AND la.user_id=t.user_id WHERE e.user_id=? AND e.ended_at IS NOT NULL AND e.started_at>=? AND e.started_at<? ORDER BY e.started_at").bind(user.id,addDays(today,-1)+"T00:00:00.000Z",addDays(endExclusive,1)+"T00:00:00.000Z").all(),
  env.DB.prepare("SELECT t.estimated_minutes,t.actual_minutes,t.status,t.direction_id,d.title AS direction_title,t.life_area_id,la.title AS life_area_title,t.project_id,p.title AS project_title FROM tasks t LEFT JOIN projects p ON p.id=t.project_id AND p.user_id=t.user_id LEFT JOIN directions d ON d.id=COALESCE(t.direction_id,p.direction_id) LEFT JOIN life_areas la ON la.id=t.life_area_id AND la.user_id=t.user_id WHERE t.user_id=? AND t.status='done' AND t.completed_at>=datetime('now','-90 days') AND t.estimated_minutes IS NOT NULL AND t.actual_minutes IS NOT NULL").bind(user.id).all(),
  env.DB.prepare("SELECT started_at,ended_at,duration_minutes FROM task_time_entries WHERE user_id=? AND ended_at IS NOT NULL AND started_at>=datetime('now','-90 days') AND duration_minutes>0 ORDER BY started_at").bind(user.id).all(),
  env.DB.prepare("SELECT fell_asleep_at,woke_at,timezone,asleep_timezone,wake_timezone FROM sleep_sessions WHERE user_id=? AND sleep_date>=date('now','-90 days') AND fell_asleep_at IS NOT NULL AND woke_at IS NOT NULL ORDER BY sleep_date").bind(user.id).all()
 ]);
 const events=expandRecurringEvents(calendarRows.results,today+"T00:00",endExclusive+"T00:00");
 const calendarDays=calculateCalendarBusyByDay(events,today,7,workingDays);
 const configured=Number(settings?.work_capacity_configured)===1&&workingDays.length>0&&Number(settings?.daily_capacity_minutes)>0;
 const week=buildWeeklyWorkload({today,workingDays,dailyCapacityMinutes:settings?.daily_capacity_minutes,configured,calendarDays,calendarEvents:events,tasks:taskRows.results,targets:targetRows.results});
 attachWeeklyTaskPriority(week,taskRows.results,today);
 attachWeeklyActualTime(week,timeRows.results,timezone,targetRows.results);
 week.estimate_accuracy=buildEstimateAccuracy(completedRows.results);
 week.calibrated_load=buildCalibratedWeeklyLoad(week,week.estimate_accuracy);
 week.adjustment_proposals=buildWeeklyAdjustmentProposals(week.days,taskRows.results);
 const calibratedDays=toCalibratedAdjustmentDays(week.calibrated_load);
 week.calibrated_adjustment_proposals=buildWeeklyAdjustmentProposals(calibratedDays,taskRows.results);

 week.focus_scenarios=buildWeeklyFocusScenarios(week.area_balance,week.days);
 week.attention_scenarios=buildWeeklyAttentionScenarios(week.days);
 week.daily_rhythm=buildDailyRhythmInsights(rhythmTimeRows.results,sleepRows.results,timezone);
 week.recovery_insights=buildRecoveryInsights(rhythmTimeRows.results,timezone);
 const url=new URL(request.url),focusMinutes=Number(url.searchParams.get("focus_minutes"))||50,breakMinutes=Number(url.searchParams.get("break_minutes"))||10,prepBeforeMinutes=Math.max(0,Math.min(120,Number(url.searchParams.get("prep_before_minutes"))||0)),bufferAfterMinutes=Math.max(0,Math.min(120,Number(url.searchParams.get("buffer_after_minutes"))||0));
 week.daily_block_preferences={focus_minutes:focusMinutes,break_minutes:breakMinutes,prep_before_minutes:prepBeforeMinutes,buffer_after_minutes:bufferAfterMinutes};
 const dailyBlockOptions={focusMinutes,breakMinutes,startTime:url.searchParams.get("start_time")||"09:00",prepBeforeMinutes,bufferAfterMinutes,calendarEvents:events};
 week.daily_block_plans=buildDailyBlockPlans(week.days,dailyBlockOptions);
 week.daily_block_scenarios=buildDailyBlockScenarios(week.days,dailyBlockOptions);
 return json({week});
}
