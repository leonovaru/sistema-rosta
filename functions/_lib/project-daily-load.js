function addDays(date,days){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function weekday(date){const d=new Date(date+"T12:00:00Z").getUTCDay();return d||7;}

export function calculateProjectDailyLoad(projects=[],today,capacity=null,calendarDays=[]) {
  const workingDays=new Set((capacity?.working_days||[]).map(Number));
  const configured=capacity?.configured===true&&workingDays.size>0&&Number(capacity.daily_capacity_minutes)>0;
  if(!configured)return {configured:false,days:[],overloaded_days:0,projects_without_deadline:projects.filter(p=>["active","waiting"].includes(p.status)&&Number(p.open_estimated_minutes)>0).length};
  const calendar=new Map(calendarDays.map(d=>[d.date,Math.max(0,Number(d.busy_minutes)||0)]));
  const days=Array.from({length:30},(_,i)=>{
    const date=addDays(today,i),isWorking=workingDays.has(weekday(date));
    const gross=isWorking?Number(capacity.daily_capacity_minutes):0;
    const busy=isWorking?(calendar.get(date)||0):0;
    return {date,working_day:isWorking,gross_capacity_minutes:gross,calendar_busy_minutes:busy,available_minutes:Math.max(0,gross-busy),planned_minutes:0,projects:[],overloaded:false};
  });
  const dayIndex=new Map(days.map((d,i)=>[d.date,i]));
  const active=projects.filter(p=>["active","waiting"].includes(p.status)&&p.deadline&&p.deadline>=today&&p.deadline<=days[29].date);
  for(const project of active){
    const deadlineIndex=dayIndex.get(project.deadline);
    if(deadlineIndex===undefined)continue;
    const eligible=days.slice(0,deadlineIndex+1).filter(d=>d.working_day);
    const minutes=Math.max(0,Number(project.open_estimated_minutes)||0);
    if(!eligible.length||!minutes)continue;
    const base=Math.floor(minutes/eligible.length),remainder=minutes%eligible.length;
    eligible.forEach((day,index)=>{
      const share=base+(index<remainder?1:0);
      if(!share)return;
      day.planned_minutes+=share;
      if(!day.projects.some(p=>p.id===project.id))day.projects.push({id:project.id,title:project.title,deadline:project.deadline});
    });
  }
  for(const day of days)day.overloaded=day.working_day&&day.planned_minutes>day.available_minutes;
  return {configured:true,days:days.filter(d=>d.working_day&&(d.planned_minutes>0||d.calendar_busy_minutes>0)).map(d=>({...d,load_percent:d.available_minutes>0?Math.round(d.planned_minutes/d.available_minutes*100):d.planned_minutes>0?null:0})),overloaded_days:days.filter(d=>d.overloaded).length,projects_without_deadline:projects.filter(p=>["active","waiting"].includes(p.status)&&!p.deadline&&Number(p.open_estimated_minutes)>0).length};
}
