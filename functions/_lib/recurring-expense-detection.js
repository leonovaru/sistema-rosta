function normalize(value){return String(value||"").trim().toLocaleLowerCase("ru-RU").replace(/ё/g,"е").replace(/\s+/g," ");}
function dayNumber(date){return Math.floor(Date.parse(date+"T12:00:00Z")/86400000);}
function dateFromDay(day){return new Date(day*86400000+43200000).toISOString().slice(0,10);}
function nextMonthlyDate(date){
 const [year,month,day]=date.split("-").map(Number);
 const next=new Date(Date.UTC(year,month,1,12));
 const last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0,12)).getUTCDate();
 return next.getUTCFullYear()+"-"+String(next.getUTCMonth()+1).padStart(2,"0")+"-"+String(Math.min(day,last)).padStart(2,"0");
}
function median(values){const sorted=[...values].sort((a,b)=>a-b);const mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;}

/**
 * Finds likely fixed recurring expenses. Suggestions are deliberately conservative:
 * exact normalized title + category, >=3 dates, stable interval and amount.
 * It never creates obligations; the user must confirm each suggestion.
 */
export function detectRecurringExpenses(rows,{today,existingTitles=[]}={}){
 const cutoff=dayNumber(today)-190;
 const existing=new Set(existingTitles.map(normalize));
 const groups=new Map();
 for(const row of rows||[]){
  const title=String(row.title||"").trim(),category=String(row.category||"Прочее").trim()||"Прочее";
  const date=String(row.spent_on||""),amount=Number(row.amount);
  if(!title||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(amount)||amount<=0||dayNumber(date)<cutoff||date>today)continue;
  if(normalize(row.note).includes("оплата нерегулярного расхода"))continue;
  const key=normalize(title)+"|"+normalize(category);
  if(!groups.has(key))groups.set(key,{title,category,rows:[]});
  groups.get(key).rows.push({date,amount});
 }
 const suggestions=[];
 for(const group of groups.values()){
  if(existing.has(normalize(group.title)))continue;
  const items=group.rows.sort((a,b)=>a.date.localeCompare(b.date));
  const unique=items.filter((x,i)=>i===0||x.date!==items[i-1].date);
  if(unique.length<3)continue;
  const intervals=unique.slice(1).map((x,i)=>dayNumber(x.date)-dayNumber(unique[i].date));
  const typical=median(intervals);
  const frequency=typical>=25&&typical<=35&&intervals.every(x=>x>=23&&x<=37)?"monthly":typical>=6&&typical<=8&&intervals.every(x=>x>=6&&x<=8)?"weekly":null;
  if(!frequency)continue;
  const typicalAmount=median(unique.map(x=>x.amount));
  if(unique.some(x=>Math.abs(x.amount-typicalAmount)/typicalAmount>0.15))continue;
  const roundedAmount=Math.round(typicalAmount*100)/100;
  const lastDate=unique.at(-1).date;
  const nextDate=frequency==="monthly"?nextMonthlyDate(lastDate):dateFromDay(dayNumber(lastDate)+Math.round(typical));
  suggestions.push({title:group.title,category:group.category,amount:roundedAmount,frequency,next_date:nextDate,last_paid_on:lastDate,occurrences:unique.length,interval_days:Math.round(typical),confidence:"high"});
 }
 return suggestions.sort((a,b)=>a.next_date.localeCompare(b.next_date));
}
