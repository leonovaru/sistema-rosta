function shiftDate(date,days){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function monthDate(year,month,day){const last=new Date(Date.UTC(year,month+1,0)).getUTCDate();return new Date(Date.UTC(year,month,Math.min(day,last),12)).toISOString().slice(0,10);}
export function recurringTaskDates(template,from,to){
 const start=template.start_date,until=template.end_date||to,rule=template.recurrence,dates=[];
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||to<from||until<start)return dates;
 if(rule==="daily"){
  let date=start<from?from:start;
  const offset=Math.max(0,Math.ceil((Date.parse(date+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/86400000));
  date=shiftDate(start,offset);
  while(date<=to&&date<=until&&dates.length<40){dates.push(date);date=shiftDate(date,1);}
 }else if(rule==="weekly"){
  const startDate=new Date(start+"T12:00:00Z"),fromDate=new Date(from+"T12:00:00Z");
  const days=Math.max(0,Math.ceil((fromDate-startDate)/86400000));
  const firstOffset=Math.max(0,Math.ceil(days/7)*7);
  let date=shiftDate(start,firstOffset);
  while(date<=to&&date<=until&&dates.length<8){dates.push(date);date=shiftDate(date,7);}
 }else if(rule==="monthly"){
  const [y,m,d]=start.split("-").map(Number);
  let cursor=new Date(Date.UTC(y,m-1,1,12)),fromDate=new Date(from+"T12:00:00Z");
  while(cursor<fromDate)cursor.setUTCMonth(cursor.getUTCMonth()+1);
  for(let i=0;i<14;i++){
   const date=monthDate(cursor.getUTCFullYear(),cursor.getUTCMonth(),d);
   if(date>to||date>until)break;
   if(date>=start)dates.push(date);
   cursor.setUTCMonth(cursor.getUTCMonth()+1);
  }
 }
 return dates;
}
