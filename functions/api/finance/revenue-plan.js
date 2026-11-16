import { json, requireUser, readJson } from "../../_lib/auth.js";
import { buildRevenuePlan } from "../../_lib/revenue-plan.js";
const amount=value=>{const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=100000000?n:null;};
function monthContext(zone){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),v=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 const days=new Date(Number(v.year),Number(v.month),0).getDate();
 return {start:v.year+"-"+v.month+"-01",today:v.year+"-"+v.month+"-"+v.day,days,day:Number(v.day)};
}
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const settings=await env.DB.prepare("SELECT timezone,monthly_target FROM settings WHERE user_id=?").bind(user.id).first(),zone=settings?.timezone||"Europe/Moscow",month=monthContext(zone);
 const [dirs,actual]=await Promise.all([
  env.DB.prepare("SELECT d.id,d.title,COALESCE(t.share_percent,0) share_percent,COALESCE(t.average_sale_amount,0) average_sale_amount FROM directions d LEFT JOIN direction_revenue_targets t ON t.direction_id=d.id AND t.user_id=d.user_id WHERE d.user_id=? ORDER BY d.sort_order,d.id").bind(user.id).all(),
  env.DB.prepare("SELECT direction_id,SUM(amount) actual FROM income_entries WHERE user_id=? AND received_on>=? AND received_on<=? GROUP BY direction_id").bind(user.id,month.start,month.today).all()
 ]);
 return json({period:{from:month.start,to:month.today,days_in_month:month.days,day:month.day,timezone:zone},...buildRevenuePlan({monthlyTarget:settings?.monthly_target||300000,directionRows:dirs.results,actualRows:actual.results,daysInMonth:month.days,dayOfMonth:month.day})});
}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const body=await readJson(request),rows=Array.isArray(body?.directions)?body.directions:null;
 if(!rows||rows.length>50)return json({error:"Передай список направлений"},400);
 const ids=new Set(),normalized=[];let total=0;
 for(const row of rows){
  const id=String(row?.direction_id||""),share=amount(row?.share_percent),ticket=amount(row?.average_sale_amount??0);
  if(!id||ids.has(id)||share===null||share>100||ticket===null)return json({error:"Проверь доли и средний чек по направлениям"},400);
  ids.add(id);total+=share;normalized.push({id,share,ticket});
 }
 if(total>100.0001)return json({error:"Сумма долей направлений не должна превышать 100%"},400);
 const owned=await env.DB.prepare("SELECT id FROM directions WHERE user_id=?").bind(user.id).all(),ownedIds=new Set(owned.results.map(x=>x.id));
 if(normalized.some(row=>!ownedIds.has(row.id))||normalized.length!==ownedIds.size)return json({error:"Список направлений изменился. Обнови страницу и повтори"},400);
 const statements=normalized.map(row=>env.DB.prepare("INSERT INTO direction_revenue_targets (user_id,direction_id,share_percent,average_sale_amount) VALUES (?,?,?,?) ON CONFLICT(user_id,direction_id) DO UPDATE SET share_percent=excluded.share_percent,average_sale_amount=excluded.average_sale_amount,updated_at=datetime('now')").bind(user.id,row.id,row.share,row.ticket));
 if(statements.length)await env.DB.batch(statements);
 return json({ok:true,share_total:Math.round(total*100)/100});
}
