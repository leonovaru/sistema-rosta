import { buildDailyBlockPlans } from "./daily-block-plans.js";

function partsAt(value,timeZone){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value));
 return Object.fromEntries(parts.map(part=>[part.type,part.value]));
}
function minute(value){const [h,m]=String(value||"").split(":").map(Number);return Number.isInteger(h)&&Number.isInteger(m)?h*60+m:null;}

/**
 * Rebuilds only today's remaining plan from the current local time.
 * It treats task minutes as current remaining estimates (already reduced by
 * recorded actual time in weekly workload), and never writes to the calendar.
 */
export function buildRemainingDailyPlan({days=[],calendarEvents=[],logs=[],now=new Date().toISOString(),timeZone="Europe/Moscow",startTime="09:00",focusMinutes=50,breakMinutes=10,prepBeforeMinutes=0,bufferAfterMinutes=0}={}){
 const local=partsAt(now,timeZone),today=local.year+"-"+local.month+"-"+local.day;
 const nowMinute=Number(local.hour)*60+Number(local.minute),start=minute(startTime);
 const day=(days||[]).find(item=>item.date===today);
 if(!day||!day.working_day||start===null)return null;
 const gross=Math.max(0,Number(day.gross_capacity_minutes)||0),windowEnd=start+gross;
 if(nowMinute>=windowEnd||gross<=0)return null;
 const cursor=Math.max(start,nowMinute),prep=Math.max(0,Math.min(120,Number(prepBeforeMinutes)||0)),after=Math.max(0,Math.min(120,Number(bufferAfterMinutes)||0));
 const busy=(calendarEvents||[]).filter(event=>event.status!=="cancelled"&&!["sleep","work"].includes(event.event_type)&&String(event.start_at||"").slice(0,10)===today)
  .map(event=>({start:minute(String(event.start_at).slice(11,16)),end:minute(String(event.end_at).slice(11,16))}))
  .filter(event=>event.start!==null&&event.end!==null&&event.end>event.start)
  .map(event=>({start:Math.max(cursor,event.start-prep),end:Math.min(windowEnd,event.end+after)}))
  .filter(event=>event.end>cursor&&event.start<windowEnd).sort((a,b)=>a.start-b.start);
 const gaps=[];let pointer=cursor;
 for(const event of busy){if(event.start>pointer)gaps.push({start:pointer,end:event.start});pointer=Math.max(pointer,event.end);}
 if(pointer<windowEnd)gaps.push({start:pointer,end:windowEnd});
 const available=gaps.reduce((sum,gap)=>sum+gap.end-gap.start,0);
 if(!available)return {date:today,available_minutes:0,focus_minutes:0,break_minutes:0,blocks:[],unallocated:(day.tasks||[]).filter(task=>Number(task.minutes)>0).map(task=>({task_id:task.id,title:task.title,minutes:Number(task.minutes)})),overloaded:true,remaining_plan:true};
 const completedByTask=new Map();
 for(const log of logs||[]){
  if(log.block_date!==today||!["done","interrupted"].includes(log.status))continue;
  const id=String(log.task_id),minutes=Math.max(0,Number(log.actual_minutes)||0);
  completedByTask.set(id,(completedByTask.get(id)||0)+minutes);
 }
 const remainingTasks=(day.tasks||[]).map(task=>({...task,minutes:Math.max(0,Math.max(0,Number(task.minutes)||0)-(completedByTask.get(String(task.id))||0))})).filter(task=>task.minutes>0);
 const adjustedDay={...day,gross_capacity_minutes:windowEnd-cursor,available_minutes:available,planned_task_minutes:remainingTasks.reduce((sum,task)=>sum+task.minutes,0),tasks:remainingTasks};
 const [plan]=buildDailyBlockPlans([adjustedDay],{focusMinutes,breakMinutes,startTime:local.hour+":"+local.minute,prepBeforeMinutes:prep,bufferAfterMinutes:after,calendarEvents});
 return plan?{...plan,remaining_plan:true,as_of:local.hour+":"+local.minute}:null;
}
