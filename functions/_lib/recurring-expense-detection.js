const MONTHS=new Set(["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь","января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"]);
const NOISE=new Set(["оплата","платеж","платёж","перевод","покупка","списание","за","по","услуга","услуги","счет","счёт","абонентская","коммунальные"]);
function normalize(value){return String(value||"").trim().toLocaleLowerCase("ru-RU").replace(/ё/g,"е").replace(/\s+/g," ");}
function stem(word){
 let w=word.replace(/[^а-яa-z0-9]/g,"");
 if(w.length<5)return w;
 for(const suffix of ["иями","ями","ами","его","ого","ему","ому","ыми","ими","ая","яя","ое","ее","ые","ие","ой","ей","ый","ий","ую","юю","ов","ев","ам","ям","ах","ях","ом","ем","а","я","ы","и","у","ю","е","о"]){
  if(w.endsWith(suffix)&&w.length-suffix.length>=4){w=w.slice(0,-suffix.length);break;}
 }
 return w;
}
function tokens(value){
 return normalize(value).split(/[^а-яa-z0-9]+/).filter(Boolean).filter(x=>!NOISE.has(x)&&!MONTHS.has(x)&&!/^20\d{2}$/.test(x)&&! /^\d{1,2}$/.test(x)).map(stem).filter(x=>x.length>=3);
}
function tokenSimilar(a,b){if(a===b)return true;if(Math.min(a.length,b.length)<5)return false;const short=a.length<b.length?a:b,long=a.length<b.length?b:a;return long.startsWith(short)&&short.length/long.length>=0.78;}
function titleSimilarity(a,b){
 const aa=[...new Set(tokens(a))],bb=[...new Set(tokens(b))];
 if(!aa.length||!bb.length)return normalize(a)===normalize(b)?1:0;
 let matches=0;const used=new Set();
 for(const x of aa){const index=bb.findIndex((y,i)=>!used.has(i)&&tokenSimilar(x,y));if(index>=0){used.add(index);matches++;}}
 return matches/Math.max(aa.length,bb.length);
}
function sameTitle(a,b){return titleSimilarity(a,b)>=0.5;}
function dayNumber(date){return Math.floor(Date.parse(date+"T12:00:00Z")/86400000);}
function dateFromDay(day){return new Date(day*86400000+43200000).toISOString().slice(0,10);}
function nextMonthlyDate(date){
 const [year,month,day]=date.split("-").map(Number);
 const next=new Date(Date.UTC(year,month,1,12));
 const last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0,12)).getUTCDate();
 return next.getUTCFullYear()+"-"+String(next.getUTCMonth()+1).padStart(2,"0")+"-"+String(Math.min(day,last)).padStart(2,"0");
}
function median(values){const sorted=[...values].sort((a,b)=>a-b);const mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;}
function futureDate(lastDate,frequency,today){
 let next=frequency==="monthly"?nextMonthlyDate(lastDate):dateFromDay(dayNumber(lastDate)+7);
 while(next<=today)next=frequency==="monthly"?nextMonthlyDate(next):dateFromDay(dayNumber(next)+7);
 return next;
}

/**
 * Finds likely recurring expenses. It tolerates changing month labels and
 * common payment wording, but only clusters within the same category.
 * No obligation is created without explicit user confirmation.
 */
export function detectRecurringExpenses(rows,{today,existingTitles=[]}={}){
 const cutoff=dayNumber(today)-190;
 const existing=existingTitles.map(x=>typeof x==="string"?{title:x,category:null}:x);
 const groups=[];
 for(const row of rows||[]){
  const title=String(row.title||"").trim(),category=String(row.category||"Прочее").trim()||"Прочее";
  const date=String(row.spent_on||""),amount=Number(row.amount);
  if(!title||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(amount)||amount<=0||dayNumber(date)<cutoff||date>today)continue;
  if(normalize(row.note).includes("оплата нерегулярного расхода"))continue;
  let group=groups.find(g=>normalize(g.category)===normalize(category)&&sameTitle(g.title,title));
  if(!group){group={title,category,rows:[]};groups.push(group);}
  group.rows.push({date,amount,title});
 }
 const suggestions=[];
 for(const group of groups){
  if(existing.some(x=>(!x.category||normalize(x.category)===normalize(group.category))&&sameTitle(x.title,group.title)))continue;
  const byDate=new Map();
  for(const item of group.rows){if(!byDate.has(item.date))byDate.set(item.date,[]);byDate.get(item.date).push(item.amount);}
  const unique=[...byDate.entries()].map(([date,amounts])=>({date,amount:median(amounts)})).sort((a,b)=>a.date.localeCompare(b.date));
  if(unique.length<3)continue;
  const intervals=unique.slice(1).map((x,i)=>dayNumber(x.date)-dayNumber(unique[i].date));
  const typical=median(intervals);
  const frequency=typical>=25&&typical<=35&&intervals.every(x=>x>=23&&x<=37)?"monthly":typical>=6&&typical<=8&&intervals.every(x=>x>=6&&x<=8)?"weekly":null;
  if(!frequency)continue;
  const typicalAmount=median(unique.map(x=>x.amount));
  if(unique.some(x=>Math.abs(x.amount-typicalAmount)/typicalAmount>0.15))continue;
  const roundedAmount=Math.round(typicalAmount*100)/100,lastDate=unique.at(-1).date;
  const nextDate=futureDate(lastDate,frequency,today);
  suggestions.push({title:group.title,category:group.category,amount:roundedAmount,frequency,next_date:nextDate,last_paid_on:lastDate,occurrences:unique.length,interval_days:Math.round(typical),confidence:"high"});
 }
 return suggestions.sort((a,b)=>a.next_date.localeCompare(b.next_date));
}
