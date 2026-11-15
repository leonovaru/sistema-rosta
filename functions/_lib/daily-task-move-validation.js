export function validateDailyTaskMove({week,taskId,fromDate,toDate,minutes,rows,startTime,endTime}={}) {
 const fail=error=>({ok:false,error});
 const baseByDate=new Map();
 for(const day of week?.days||[])for(const task of day.tasks||[])if(String(task.id)===String(taskId))baseByDate.set(day.date,(baseByDate.get(day.date)||0)+Number(task.minutes||0));
 const nextByDate=new Map((rows||[]).map(row=>[row.date,Number(row.minutes)]));
 const sourceCurrent=baseByDate.get(fromDate)||0,targetCurrent=baseByDate.get(toDate)||0;
 if(sourceCurrent<minutes||nextByDate.get(fromDate)!==sourceCurrent-minutes||nextByDate.get(toDate)!==targetCurrent+minutes)return fail("Распределение задачи изменилось. Пересчитайте недельный план и подтвердите перенос заново.");
 const dates=new Set([...baseByDate.keys(),...nextByDate.keys()]);
 for(const date of dates)if(date!==fromDate&&date!==toDate&&(baseByDate.get(date)||0)!==(nextByDate.get(date)||0))return fail("Перенос изменяет дополнительные даты. Обновите предложение.");
 if(!(week?.days||[]).some(day=>day.date===fromDate&&day.working_day)||!(week?.days||[]).some(day=>day.date===toDate&&day.working_day))return fail("Исходная или целевая дата больше не является рабочим днём");
 const adjusted=new Map((week.days||[]).map(day=>[day.date,{...day,tasks:[...(day.tasks||[])],planned_task_minutes:Number(day.planned_task_minutes)||0}]));
 for(const day of adjusted.values()){
  const removed=day.tasks.filter(task=>String(task.id)===String(taskId));
  day.tasks=day.tasks.filter(task=>String(task.id)!==String(taskId));
  day.planned_task_minutes-=removed.reduce((sum,task)=>sum+Number(task.minutes||0),0);
 }
 for(const row of rows||[]){
  const day=adjusted.get(row.date);
  if(!day)return fail("Назначение выходит за пределы текущей недели");
  day.planned_task_minutes+=Number(row.minutes);
  day.tasks.push({id:taskId,minutes:Number(row.minutes)});
 }
 const target=adjusted.get(toDate);
 if(!target||target.planned_task_minutes>target.available_minutes)return fail("На целевой день больше не хватает свободной дневной ёмкости с учётом календаря и остальных задач");
 const toMinutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3,5));
 if(toMinutes(endTime)-toMinutes(startTime)<minutes)return fail("Предложенное временное окно больше не подходит по длительности");
 return {ok:true};
}
