function periodFor(time){const hour=Number(String(time||"").slice(0,2));return hour<12?"Утро":hour<18?"День":"Вечер";}
function deadlineLabel(days){
 if(!Number.isFinite(days))return null;
 if(days<0)return "срок уже прошёл";
 if(days===0)return "срок сегодня";
 if(days===1)return "срок завтра";
 return "до срока "+days+" дн.";
}
function historyFor(window,patterns){
 const overall=patterns?.overall||{},period=(patterns?.by_period||[]).find(row=>row.period===periodFor(window.start_time));
 const enough=Number(overall.sample_size)>=8&&Number(period?.sample_size)>=4&&Number.isFinite(Number(overall.completion_rate))&&Number.isFinite(Number(period?.completion_rate));
 return enough?{rate:Number(period.completion_rate),count:Number(period.sample_size),overall:Number(overall.completion_rate)}:null;
}
function taskUrgency(task){
 if(task.urgency_days!==null&&task.urgency_days!==undefined&&Number.isFinite(Number(task.urgency_days)))return Number(task.urgency_days);
 if(!task.due_date)return Infinity;
 const a=new Date(String(task.due_date).slice(0,10)+"T12:00:00Z"),b=new Date(String(task.date||"").slice(0,10)+"T12:00:00Z");
 return Number.isFinite(a.getTime())&&Number.isFinite(b.getTime())?Math.round((a-b)/86400000):Infinity;
}
export function buildTaskWindowRecommendations(plans=[],patterns=null){
 return (plans||[]).map(day=>{
  const windows=(day.free_windows||[]).filter(window=>Number(window.minutes)>0).map(window=>({...window,history:historyFor(window,patterns)}));
  const tasks=(day.tasks||[]).filter(task=>task.id&&Number(task.minutes)>0).map(task=>({...task,urgency_days:taskUrgency({...task,date:day.date})}));
  const plannedOrder=new Map();
  (day.blocks||[]).filter(block=>block.type==="focus"&&block.task_id!=null).forEach((block,index)=>{const key=String(block.task_id);if(!plannedOrder.has(key))plannedOrder.set(key,index);});
  tasks.sort((a,b)=>{
   const ai=plannedOrder.has(String(a.id))?plannedOrder.get(String(a.id)):Infinity,bi=plannedOrder.has(String(b.id))?plannedOrder.get(String(b.id)):Infinity;
   return ai-bi||(Number(b.priority_score)||0)-(Number(a.priority_score)||0)||a.urgency_days-b.urgency_days||(a.cognitive_load==="high"?-1:0)-(b.cognitive_load==="high"?-1:0)||Number(b.minutes)-Number(a.minutes);
  });
  const used=new Set(),recommendations=[],unmatched=[];
  for(const task of tasks){
   const candidates=windows.map((window,index)=>({window,index,history:window.history,waste:Number(window.minutes)-Number(task.minutes)}))
    .filter(item=>!used.has(item.index)&&item.waste>=0)
    .sort((a,b)=>{
     const ah=a.history?.rate??50,bh=b.history?.rate??50;
     return bh-ah||a.waste-b.waste||a.index-b.index;
    });
   if(!candidates.length){
    const longest=Math.max(0,...windows.map(window=>Number(window.minutes)||0));
    unmatched.push({task_id:task.id,title:task.title||"Задача",minutes:Number(task.minutes),reason:windows.length?("Нет свободного непрерывного окна на "+Number(task.minutes)+" мин. (самое длинное — "+longest+" мин.)"):"На этот день не найдено свободных окон"});
    continue;
   }
   const chosen=candidates[0];used.add(chosen.index);
   const reasons=[];
   if(task.priority_label)reasons.push("приоритет: "+task.priority_label.toLowerCase());
   const deadline=deadlineLabel(task.urgency_days);if(deadline)reasons.push(deadline);
   reasons.push("оценка "+Number(task.minutes)+" мин. целиком помещается в окно");
   if(chosen.history)reasons.push(chosen.history.rate+"% завершения в этот период ("+chosen.history.count+" наблюдений)");
   recommendations.push({task_id:task.id,title:task.title||"Задача",minutes:Number(task.minutes),start_time:chosen.window.start_time,end_time:chosen.window.end_time,window_minutes:Number(chosen.window.minutes),period:periodFor(chosen.window.start_time),history_signal:chosen.history?(chosen.history.rate-chosen.history.overall>=15?"above_average":chosen.history.rate-chosen.history.overall<=-15?"below_average":"similar"):"insufficient",reasons,requires_confirmation:true});
  }
  return {...day,task_window_recommendations:recommendations,unmatched_window_tasks:unmatched,task_window_note:"Подбор учитывает приоритет, близость срока, длительность и подтверждённую историю по времени суток. Это предложение: расписание и дедлайны не изменены."};
 });
}
