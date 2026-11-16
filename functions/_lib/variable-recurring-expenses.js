function dayNumber(date){return Math.floor(Date.parse(date+"T12:00:00Z")/86400000);}
function dateFromDay(day){return new Date(day*86400000+43200000).toISOString().slice(0,10);}
function nextMonth(date){const [y,m,d]=date.split("-").map(Number),next=new Date(Date.UTC(y,m,1,12)),last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0,12)).getUTCDate();return next.getUTCFullYear()+"-"+String(next.getUTCMonth()+1).padStart(2,"0")+"-"+String(Math.min(d,last)).padStart(2,"0");}
function median(values){const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
const norm=s=>String(s||"").trim().toLocaleLowerCase("ru-RU").replace(/ё/g,"е").replace(/\s+/g," ");
export function detectVariableRecurringExpenses(rows,{today,horizonDays=90}={}){
 const cutoff=dayNumber(today)-190,groups=new Map();
 for(const row of rows||[]){
  const date=String(row.spent_on||""),amount=Number(row.amount),title=norm(row.title),category=norm(row.category||"Прочее");
  if(!row.id||!title||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||!Number.isFinite(amount)||amount<=0||date>today||dayNumber(date)<cutoff)continue;
  const key=category+"|"+title;if(!groups.has(key))groups.set(key,{title:row.title,category:row.category||"Прочее",rows:[]});
  groups.get(key).rows.push({id:row.id,date,amount});
 }
 const suggestions=[],matchedIds=[];
 for(const group of groups.values()){
  const byDate=new Map();for(const x of group.rows){if(!byDate.has(x.date))byDate.set(x.date,[]);byDate.get(x.date).push(x);}
  const entries=[...byDate.values()].map(items=>({date:items[0].date,amount:items.reduce((s,x)=>s+x.amount,0),ids:items.map(x=>x.id)})).sort((a,b)=>a.date.localeCompare(b.date));
  if(entries.length<3)continue;
  const intervals=entries.slice(1).map((x,i)=>dayNumber(x.date)-dayNumber(entries[i].date));
  if(!intervals.every(x=>x>=23&&x<=37))continue;
  const amounts=entries.map(x=>x.amount),typical=median(amounts);
  if(typical<=0||Math.max(...amounts)-Math.min(...amounts)<=typical*.15||Math.max(...amounts)-Math.min(...amounts)>typical*1.5)continue;
  const last=entries.at(-1);let due=nextMonth(last.date),end=dateFromDay(dayNumber(today)+horizonDays),guard=0;
  while(due<=today&&guard++<12)due=nextMonth(due);
  const projected=[];while(due<=end&&projected.length<4){projected.push({date:due,type:"expense",title:group.title+" (оценка)",amount:Math.round(typical*100)/100,source:"variable_recurring",category:group.category});due=nextMonth(due);}
  if(!projected.length)continue;
  entries.forEach(x=>matchedIds.push(...x.ids));
  suggestions.push({title:group.title,category:group.category,estimated_amount:Math.round(typical*100)/100,amount_min:Math.min(...amounts),amount_max:Math.max(...amounts),last_paid_on:last.date,occurrences:entries.length,projected});
 }
 return {suggestions,matched_expense_ids:matchedIds,events:suggestions.flatMap(x=>x.projected)};
}
