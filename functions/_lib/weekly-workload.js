function addDays(date,days){const value=new Date(date+"T12:00:00Z");value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
function weekday(date){const day=new Date(date+"T12:00:00Z").getUTCDay();return day||7;}
function eventMinutes(event){const start=new Date(event.actual_start_at||event.start_at),end=new Date(event.actual_end_at||event.end_at);return Number.isFinite(start.getTime())&&Number.isFinite(end.getTime())?Math.max(0,Math.round((end-start)/60000)):0;}
function taskArea(task){
 if(task.life_area_id)return {key:"life:"+task.life_area_id,title:task.life_area_title||"Личная сфера",type:"personal"};
 if(task.direction_id)return {key:"direction:"+task.direction_id,title:task.direction_title||"Доходное направление",type:"income"};
 if(task.project_id)return {key:"project:"+task.project_id,title:task.project_title||"Собственный проект",type:"project"};
 if(task.client_id)return {key:"client:"+task.client_id,title:task.client_name||"Клиент без направления",type:"income"};
 return {key:"unassigned",title:"Не распределено",type:"unassigned"};
}
export function buildWeeklyWorkload({today,workingDays=[],dailyCapacityMinutes=0,configured=false,calendarDays=[],calendarEvents=[],tasks=[]}={}){
 const end=addDays(today,6),working=new Set(workingDays.map(Number));
 const days=Array.from({length:7},(_,i)=>{
  const date=addDays(today,i),isWorking=configured&&working.has(weekday(date));
  const gross=isWorking?Math.max(0,Number(dailyCapacityMinutes)||0):0;
  const busy=isWorking?Math.max(0,Number(calendarDays.find(x=>x.date===date)?.busy_minutes)||0):0;
  return {date,working_day:isWorking,gross_capacity_minutes:gross,calendar_busy_minutes:busy,available_minutes:Math.max(0,gross-busy),planned_task_minutes:0,task_count:0,overloaded:false,tasks:[]};
 });
 const eventGroups=new Map();
 for(const event of calendarEvents||[]){
  const minutes=eventMinutes(event);if(!minutes)continue;
  const type=event.event_type||"other";
  const row=eventGroups.get(type)||{type,title:({meeting:"Встречи",travel:"Поездки",hobby:"Хобби",sleep:"Сон",work:"Работа",personal:"Личные дела",other:"Прочее"})[type]||"Прочее",minutes:0,count:0};
  row.minutes+=minutes;row.count++;eventGroups.set(type,row);
 }
 const active=(tasks||[]).filter(t=>["todo","doing"].includes(t.status));
 const areaGroups=new Map();
 for(const task of active){
  const area=taskArea(task),estimate=Math.max(0,Number(task.estimated_minutes)||0),remaining=task.status==="doing"?Math.max(0,estimate-Math.max(0,Number(task.actual_minutes)||0)):estimate;
  const row=areaGroups.get(area.key)||{...area,task_count:0,estimated_minutes:0,unestimated_count:0};
  row.task_count++;row.estimated_minutes+=remaining;
  if(!Number.isFinite(Number(task.estimated_minutes))||Number(task.estimated_minutes)<=0)row.unestimated_count++;
  areaGroups.set(area.key,row);
 }
 const dueThisWeek=active.filter(t=>t.due_date&&t.due_date<=end);
 const noDeadline=active.filter(t=>!t.due_date);
 const overdue=active.filter(t=>t.due_date&&t.due_date<today);
 const unestimated=active.filter(t=>!Number.isFinite(Number(t.estimated_minutes))||Number(t.estimated_minutes)<=0);
 const waiting=(tasks||[]).filter(t=>t.status==="waiting");
 for(const task of dueThisWeek){
  const deadline=task.due_date<today?today:task.due_date;
  const eligible=days.filter(d=>d.working_day&&d.date<=deadline);
  const estimate=Math.max(0,Number(task.estimated_minutes)||0);
  const remaining=task.status==="doing"?Math.max(0,estimate-Math.max(0,Number(task.actual_minutes)||0)):estimate;
  if(!eligible.length||!remaining)continue;
  const base=Math.floor(remaining/eligible.length),remainder=remaining%eligible.length;
  eligible.forEach((day,index)=>{
   const share=base+(index<remainder?1:0);
   if(!share)return;
   day.planned_task_minutes+=share;
   day.task_count++;
   day.tasks.push({id:task.id,title:task.title,direction_title:task.direction_title||null,minutes:share,due_date:task.due_date});
  });
 }
 for(const day of days)day.overloaded=day.working_day&&day.planned_task_minutes>day.available_minutes;
 const gross=days.reduce((sum,d)=>sum+d.gross_capacity_minutes,0);
 const busy=days.reduce((sum,d)=>sum+d.calendar_busy_minutes,0);
 const available=days.reduce((sum,d)=>sum+d.available_minutes,0);
 const planned=dueThisWeek.reduce((sum,t)=>sum+(t.status==="doing"?Math.max(0,Number(t.estimated_minutes||0)-Number(t.actual_minutes||0)):Math.max(0,Number(t.estimated_minutes)||0)),0);
 return {from:today,to:end,configured,area_balance:[...areaGroups.values()].sort((a,b)=>b.estimated_minutes-a.estimated_minutes),calendar_balance:[...eventGroups.values()].sort((a,b)=>b.minutes-a.minutes),working_days:[...working].sort((a,b)=>a-b),daily_capacity_minutes:configured?Number(dailyCapacityMinutes):null,summary:{gross_capacity_minutes:gross,calendar_busy_minutes:busy,available_minutes:available,estimated_task_minutes:planned,estimated_task_count:dueThisWeek.filter(t=>Number(t.estimated_minutes)>0).length,tasks_with_deadline_count:dueThisWeek.length,unestimated_task_count:unestimated.length,overdue_task_count:overdue.length,without_deadline_count:noDeadline.length,waiting_task_count:waiting.length,remaining_minutes:available-planned,over_capacity:configured&&planned>available},days,notes:["Включены активные задачи со сроком до конца периода, включая просроченные.","Задачи без срока и задачи в ожидании показаны отдельно и не распределяются по дням.","Рабочая нагрузка распределена предварительно до дедлайна; календарные события не создают и не перемещают задачи."]};
}
