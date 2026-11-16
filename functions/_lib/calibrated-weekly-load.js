function keyFor(task){
 if(task.project_id)return "project:"+task.project_id;
 if(task.life_area_id)return "life:"+task.life_area_id;
 if(task.direction_id)return "direction:"+task.direction_id;
 return "unassigned";
}
export function buildCalibratedWeeklyLoad(week,accuracy){
 const rows=new Map((accuracy?.by_area||[]).map(row=>[row.key,row]));
 const overall=accuracy?.overall;
 const days=(week?.days||[]).map(day=>{
  const tasks=(day.tasks||[]).map(task=>{
   const row=rows.get(keyFor(task));
   const source=row?.recommended_estimate_multiplier!=null?row:overall;
   const multiplier=source?.recommended_estimate_multiplier!=null&&source.sample_count>=(accuracy?.minimum_samples||3)?Number(source.recommended_estimate_multiplier):1;
   return {...task,calibrated_minutes:Math.max(0,Math.round(Number(task.minutes||0)*multiplier)),calibration_multiplier:multiplier,calibration_samples:source?.sample_count||0};
  });
  const calibrated=tasks.reduce((sum,task)=>sum+task.calibrated_minutes,0);
  return {...day,calibrated_task_minutes:calibrated,calibrated_overloaded:day.working_day&&calibrated>day.available_minutes,calibrated_tasks:tasks};
 });
 const total=days.reduce((sum,day)=>sum+day.calibrated_task_minutes,0);
 const available=days.reduce((sum,day)=>sum+Math.max(0,Number(day.available_minutes)||0),0);
 const calibratedTasks=days.flatMap(day=>day.calibrated_tasks);
 const adjustedCount=calibratedTasks.filter(task=>task.calibration_multiplier!==1).length;
 return {days,summary:{calibrated_task_minutes:total,available_minutes:available,over_capacity_minutes:Math.max(0,total-available),overloaded_days:days.filter(day=>day.calibrated_overloaded).length,adjusted_task_allocations:adjustedCount},note:"Сценарий пересчитывает оставшиеся оценки по медианному факту завершённых задач. Он не меняет оценки, сроки или календарь; без достаточной выборки используется исходная оценка."};
}

export function toCalibratedAdjustmentDays(calibratedLoad){
 return (calibratedLoad?.days||[]).map(day=>({...day,planned_task_minutes:day.calibrated_task_minutes,tasks:(day.calibrated_tasks||[]).map(task=>({...task,minutes:task.calibrated_minutes}))}));
}
