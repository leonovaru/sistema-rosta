function weekday(date){const value=new Date(date+"T12:00:00Z").getUTCDay();return value===0?7:value;}
function band(value){const hour=Number(String(value||"").slice(0,2));return hour<12?"Утро":hour<18?"День":"Вечер";}
function summarize(rows){
 const completed=rows.filter(row=>row.status==="done").length;
 const done=rows.filter(row=>row.status==="done"&&Number(row.actual_minutes)>0);
 const ratios=done.map(row=>Number(row.actual_minutes)/Number(row.planned_minutes)).sort((a,b)=>a-b);
 const middle=Math.floor(ratios.length/2),median=ratios.length?(ratios.length%2?ratios[middle]:(ratios[middle-1]+ratios[middle])/2):null;
 return {sample_size:rows.length,completed,skipped:rows.filter(row=>row.status==="skipped").length,interrupted:rows.filter(row=>row.status==="interrupted").length,completion_rate:Math.round(completed/rows.length*100),median_actual_to_planned:median===null?null:Number(median.toFixed(2)),actual_sample_size:ratios.length};
}
export function buildDailyExecutionPatterns(logs=[]){
 const valid=(logs||[]).filter(row=>["done","skipped","interrupted"].includes(row.status)&&Number(row.planned_minutes)>0&&/^\d{4}-\d{2}-\d{2}$/.test(row.block_date||""));
 const overall=summarize(valid),groups=new Map();
 for(const row of valid){const key=band(row.start_time),items=groups.get(key)||[];items.push(row);groups.set(key,items);}
 const byPeriod=["Утро","День","Вечер"].map(period=>{const rows=groups.get(period)||[];return {period,...(rows.length?summarize(rows):{sample_size:0,completed:0,skipped:0,interrupted:0,completion_rate:null,median_actual_to_planned:null,actual_sample_size:0})};}).filter(row=>row.sample_size>0);
 const weekdays=new Map();
 for(const row of valid){const key=weekday(row.block_date),items=weekdays.get(key)||[];items.push(row);weekdays.set(key,items);}
 const dayNames=["","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"];
 const byWeekday=[...weekdays.entries()].sort((a,b)=>a[0]-b[0]).map(([day,rows])=>({day,title:dayNames[day],...summarize(rows)}));
 const areas=new Map();
 for(const row of valid){
  const key=row.area_key||"unassigned",items=areas.get(key)||{key,title:row.area_title||"Не распределено",type:row.area_type||"unassigned",rows:[]};
  items.rows.push(row);areas.set(key,items);
 }
 const byArea=[...areas.values()].map(area=>({key:area.key,title:area.title,type:area.type,...summarize(area.rows)})).sort((a,b)=>b.sample_size-a.sample_size);
 const notable=byPeriod.filter(row=>overall.sample_size>=8&&row.sample_size>=4&&Math.abs(row.completion_rate-overall.completion_rate)>=20).map(row=>({type:"time_of_day",title:row.period,detail:"Завершение отмечено в "+row.completion_rate+"% блоков ("+row.completed+" из "+row.sample_size+"); общий показатель — "+overall.completion_rate+"%.",sample_size:row.sample_size}));
 const areaNotable=byArea.filter(row=>overall.sample_size>=8&&row.sample_size>=3&&Math.abs(row.completion_rate-overall.completion_rate)>=25).map(row=>({type:"area",title:row.title,detail:"В этой сфере завершено "+row.completion_rate+"% отмеченных блоков ("+row.completed+" из "+row.sample_size+"); общий показатель — "+overall.completion_rate+"%.",sample_size:row.sample_size}));
 return {sample_size:overall.sample_size,overall,by_period:byPeriod,by_weekday:byWeekday,by_area:byArea,notable:[...notable,...areaNotable],note:"Показатели отражают только явно отмеченные исходы блоков. Медиана фактического времени учитывает только завершённые блоки с указанным временем; результаты по сферам — не доказательство сложности или эффективности работы."};
}
