const round=value=>Math.round((Number(value)||0)/5)*5;
export function buildWeeklyFocusScenarios(areaBalance=[],days=[]){
 const capacity=(days||[]).reduce((sum,day)=>sum+Math.max(0,Number(day.available_minutes)||0),0);
 const scenarios=[
  {id:"balanced",title:"Сбалансированная неделя",description:"Сохраняет пропорции текущих задач и заданных ориентиров.",score:row=>row.weekly_estimated_minutes>0?row.weekly_estimated_minutes:0},
  {id:"income",title:"Фокус на доходе",description:"Сначала задачи доходных направлений; личные обязательства не удаляются из плана.",score:row=>(row.type==="income"?1000000:0)+row.weekly_estimated_minutes},
  {id:"life",title:"Баланс личной жизни",description:"Сначала личные области, которым не хватает времени до заданного ориентира.",score:row=>(row.type==="personal"?1000000+Math.max(0,Number(row.target_gap_minutes)||0):0)+row.weekly_estimated_minutes}
 ];
 return scenarios.map(scenario=>{
  const ranked=[...(areaBalance||[])].filter(row=>row.weekly_estimated_minutes>0||row.target_minutes!==null).sort((a,b)=>scenario.score(b)-scenario.score(a));
  const required=ranked.reduce((sum,row)=>sum+Math.max(0,Number(row.weekly_estimated_minutes)||0),0);
  return {id:scenario.id,title:scenario.title,description:scenario.description,available_minutes:capacity,estimated_task_minutes:required,remaining_capacity_minutes:capacity-required,over_capacity_minutes:Math.max(0,required-capacity),focus:ranked.slice(0,5).map(row=>({title:row.title,type:row.type,minutes:round(row.weekly_estimated_minutes),target_minutes:row.target_minutes,target_gap_minutes:row.target_gap_minutes}))};
 });
}
