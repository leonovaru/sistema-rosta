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
function urgencyDays(task,date){
 if(task.urgency_days!==null&&task.urgency_days!==undefined&&Number.isFinite(Number(task.urgency_days)))return Number(task.urgency_days);
 if(!task.due_date)return Infinity;
 const a=new Date(String(task.due_date).slice(0,10)+"T12:00:00Z"),b=new Date(String(date||"").slice(0,10)+"T12:00:00Z");
 return Number.isFinite(a.getTime())&&Number.isFinite(b.getTime())?Math.round((a-b)/86400000):Infinity;
}
function availableSlots(plan,patterns){
 const slots=[];
 for(const window of plan.free_windows||[]){
  const start=Number(String(window.start_time).slice(0,2))*60+Number(String(window.start_time).slice(3,5));
  const end=Number(String(window.end_time).slice(0,2))*60+Number(String(window.end_time).slice(3,5));
  let cursor=start;
  const occupied=(plan.blocks||[]).filter(block=>block.type==="focus"||block.type==="break").map(block=>({start:Number(block.start_time.slice(0,2))*60+Number(block.start_time.slice(3,5)),end:Number(block.end_time.slice(0,2))*60+Number(block.end_time.slice(3,5))})).filter(block=>block.end>start&&block.start<end).sort((a,b)=>a.start-b.start);
  for(const block of occupied){
   if(block.start>cursor)addSlot(cursor,Math.min(block.start,end));
   cursor=Math.max(cursor,block.end);
  }
  if(cursor<end)addSlot(cursor,end);
  function addSlot(a,b){if(b-a>=10){const hh=n=>String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");const slot={start_time:hh(a),end_time:hh(b),minutes:b-a};slot.history=historyFor(slot,patterns);slots.push(slot);}}
 }
 return slots;
}
function chooseSlot(slots,minutes){
 return slots.map((slot,index)=>({slot,index,waste:slot.minutes-minutes})).filter(item=>item.waste>=0).sort((a,b)=>(b.slot.history?.rate??50)-(a.slot.history?.rate??50)||a.waste-b.waste||a.index-b.index)[0]||null;
}
function explain(task,slot,date){
 const reasons=[];
 if(task.priority_label)reasons.push("приоритет: "+task.priority_label.toLowerCase());
 const days=urgencyDays(task,date),deadline=deadlineLabel(days);if(deadline)reasons.push(deadline);
 reasons.push("остаток "+Number(task.minutes)+" мин. целиком помещается в окно");
 if(slot.history)reasons.push(slot.history.rate+"% завершения в этот период ("+slot.history.count+" наблюдений)");
 return reasons;
}
function annotatePlan(plan,sourceDay,patterns){
 const slots=availableSlots(plan,patterns),tasksById=new Map((sourceDay?.tasks||[]).map(task=>[String(task.id),task]));
 const remaining=(plan.unallocated||[]).filter(row=>row.task_id!=null&&Number(row.minutes)>0).map(row=>({...tasksById.get(String(row.task_id)),id:row.task_id,title:row.title||tasksById.get(String(row.task_id))?.title||"Задача",minutes:Number(row.minutes)})).filter(task=>task.id!=null);
 const recommendations=[],unmatched=[];
 remaining.sort((a,b)=>(Number(b.priority_score)||0)-(Number(a.priority_score)||0)||urgencyDays(a,plan.date)-urgencyDays(b,plan.date));
 for(const task of remaining){
  const chosen=chooseSlot(slots,task.minutes);
  if(!chosen){unmatched.push({task_id:task.id,title:task.title,minutes:task.minutes,reason:slots.length?"Нет свободного окна после уже запланированных блоков на "+task.minutes+" мин.":"Все доступные окна заняты запланированными блоками"});continue;}
  slots.splice(chosen.index,1);
  recommendations.push({task_id:task.id,title:task.title,minutes:task.minutes,start_time:chosen.slot.start_time,end_time:chosen.slot.end_time,window_minutes:chosen.slot.minutes,period:periodFor(chosen.slot.start_time),history_signal:chosen.slot.history?(chosen.slot.history.rate-chosen.slot.history.overall>=15?"above_average":chosen.slot.history.rate-chosen.slot.history.overall<=-15?"below_average":"similar"):"insufficient",reasons:explain(task,chosen.slot,plan.date),requires_confirmation:true});
 }
 return {...plan,task_window_recommendations:recommendations,unmatched_window_tasks:unmatched,_remaining_tasks:remaining,_available_slots:slots};
}
/**
 * Recommends only genuinely unallocated task time. Existing focus blocks and
 * breaks are removed from candidate windows. Cross-day suggestions are
 * confirmation-only and never modify assignments or deadlines.
 */
export function buildTaskWindowRecommendations(plans=[],patterns=null,days=[]){
 const dayMap=new Map((days||[]).map(day=>[day.date,day]));
 const annotated=(plans||[]).map(plan=>annotatePlan(plan,dayMap.get(plan.date),patterns));
 const reserved=new Map();
 for(const plan of annotated)for(const item of plan.task_window_recommendations||[])reserved.set(plan.date+":"+item.start_time+":"+item.end_time,true);
 for(const plan of annotated){
  const moves=[],stillUnmatched=[];
  for(const item of plan.unmatched_window_tasks||[]){
   const task=plan._remaining_tasks.find(row=>String(row.id)===String(item.task_id));
   if(!task){stillUnmatched.push(item);continue;}
   const candidates=annotated.filter(target=>target.date>plan.date&&(!task.due_date||target.date<=String(task.due_date).slice(0,10))&&dayMap.get(target.date)?.working_day&&!((dayMap.get(target.date)?.tasks||[]).some(row=>String(row.id)===String(task.id))));
   let selected=null;
   for(const target of candidates){
    const slots=(target._available_slots||[]).filter(slot=>!reserved.has(target.date+":"+slot.start_time+":"+slot.end_time));
    const chosen=chooseSlot(slots,task.minutes);
    if(chosen){selected={target,slot:chosen.slot};break;}
   }
   if(!selected){stillUnmatched.push({...item,reason:item.reason+"; не найдено подходящего свободного окна в последующие рабочие дни до дедлайна"});continue;}
   const {target,slot}=selected;
   reserved.set(target.date+":"+slot.start_time+":"+slot.end_time,true);
   moves.push({task_id:task.id,title:task.title,minutes:task.minutes,from_date:plan.date,to_date:target.date,start_time:slot.start_time,end_time:slot.end_time,period:periodFor(slot.start_time),reasons:[...explain(task,slot,target.date),"перенос на ближайший подходящий рабочий день"],requires_confirmation:true});
  }
  plan.cross_day_task_recommendations=moves;
  plan.unmatched_window_tasks=stillUnmatched;
  delete plan._remaining_tasks;delete plan._available_slots;
  plan.task_window_note="Сначала учитываются уже запланированные блоки. Нераспределённый остаток подбирается под свободное окно сегодня или в ближайший рабочий день до дедлайна. Все переносы требуют подтверждения; расписание не изменено.";
 }
 return annotated;
}
