import { json, requireUser, readJson } from "../../_lib/auth.js";
import { buildSalesPlan } from "../../_lib/sales-plan.js";
import { buildObservedSalesFunnel } from "../../_lib/observed-sales-funnel.js";
const validPct=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=100?n:null;};
function month(zone){const p=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),v=Object.fromEntries(p.map(x=>[x.type,x.value]));const days=new Date(Number(v.year),Number(v.month),0).getDate();return {day:Number(v.day),days,start:v.year+"-"+v.month+"-01",today:v.year+"-"+v.month+"-"+v.day};}
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const settings=await env.DB.prepare("SELECT timezone,monthly_target FROM settings WHERE user_id=?").bind(user.id).first(),zone=settings?.timezone||"Europe/Moscow",m=month(zone);
 const [dirs,income,pipeline,interactions,dealEvents]=await Promise.all([
  env.DB.prepare("SELECT d.id direction_id,d.title,COALESCE(t.share_percent,0) share_percent,COALESCE(t.average_sale_amount,0) average_sale_amount,COALESCE(f.contact_to_lead_percent,40) contact_to_lead_percent,COALESCE(f.lead_to_sale_percent,20) lead_to_sale_percent,CASE WHEN f.direction_id IS NULL THEN 1 ELSE 0 END assumptions_default FROM directions d LEFT JOIN direction_revenue_targets t ON t.direction_id=d.id AND t.user_id=d.user_id LEFT JOIN direction_sales_funnels f ON f.direction_id=d.id AND f.user_id=d.user_id WHERE d.user_id=? ORDER BY d.sort_order,d.id").bind(user.id).all(),
  env.DB.prepare("SELECT direction_id,SUM(amount) actual FROM income_entries WHERE user_id=? AND received_on>=? AND received_on<=? GROUP BY direction_id").bind(user.id,m.start,m.today).all(),
  env.DB.prepare("SELECT c.direction_id,COUNT(*) potential_clients,SUM(CASE WHEN EXISTS(SELECT 1 FROM client_interactions ci WHERE ci.user_id=c.user_id AND ci.client_id=c.id AND ci.occurred_on>=date(?,'-29 days') AND ci.occurred_on<=?) THEN 1 ELSE 0 END) contacted_clients FROM clients c WHERE c.user_id=? AND c.status='lead' AND c.direction_id IS NOT NULL GROUP BY c.direction_id").bind(m.today,m.today,user.id).all(),
  env.DB.prepare("SELECT DISTINCT c.direction_id,ci.client_id FROM client_interactions ci JOIN clients c ON c.id=ci.client_id AND c.user_id=ci.user_id WHERE ci.user_id=? AND ci.occurred_on>=date(?,'-89 days') AND ci.occurred_on<=? AND c.direction_id IS NOT NULL").bind(user.id,m.today,m.today).all(),
  env.DB.prepare("SELECT d.direction_id,d.client_id,e.changes_json FROM deal_events e JOIN deals d ON d.id=e.deal_id AND d.user_id=e.user_id WHERE e.user_id=? AND e.created_at>=datetime(date(?,'-89 days')) AND e.created_at<datetime(?,'+1 day') AND d.client_id IS NOT NULL AND d.direction_id IS NOT NULL").bind(user.id,m.today,m.today).all()
 ]);
 const actual=new Map(income.results.map(x=>[x.direction_id||"",Number(x.actual)||0]));
 const pipelineByDirection=new Map(pipeline.results.map(x=>[x.direction_id,{potential_clients:Number(x.potential_clients)||0,contacted_clients:Number(x.contacted_clients)||0}]));
 const observedByDirection=new Map(buildObservedSalesFunnel({interactionRows:interactions.results,dealEventRows:dealEvents.results}).map(x=>[x.direction_id,x]));
 const allSharesZero=dirs.results.length>0&&dirs.results.every(d=>Number(d.share_percent)===0);
 const directions=dirs.results.map(d=>({...d,...(pipelineByDirection.get(d.direction_id)||{potential_clients:0,contacted_clients:0}),...(observedByDirection.get(d.direction_id)||{}),remaining_target:Math.max(0,(Number(settings?.monthly_target)||300000)*(allSharesZero?100/dirs.results.length:Number(d.share_percent))/100-(actual.get(d.direction_id)||0))}));
 return json({period:{days_remaining:Math.max(1,m.days-m.day+1),day:m.day,days_in_month:m.days,timezone:zone},observed_funnel_period_days:90,suggested_funnel_assumptions:{contact_to_lead_percent:40,lead_to_sale_percent:20},directions:buildSalesPlan(directions,Math.max(1,m.days-m.day+1)).map((x,i)=>({...x,assumptions_default:Boolean(dirs.results[i].assumptions_default),observed_contact_to_lead_percent:directions[i].observed_contact_to_lead_percent??null,observed_lead_to_sale_percent:directions[i].observed_lead_to_sale_percent??null,observed_contacted_clients:directions[i].observed_contacted_clients||0,observed_qualified_clients:directions[i].qualified_clients||0,observed_won_clients:directions[i].won_clients||0,can_suggest_observed: Boolean(directions[i].can_suggest)}))});
}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const body=await readJson(request),rows=Array.isArray(body?.directions)?body.directions:null;
 if(!rows||rows.length>50)return json({error:"Передай список направлений"},400);
 const owned=await env.DB.prepare("SELECT id FROM directions WHERE user_id=?").bind(user.id).all(),ids=new Set(owned.results.map(x=>x.id)),seen=new Set(),statements=[];
 for(const row of rows){const id=String(row?.direction_id||""),contact=validPct(row?.contact_to_lead_percent),close=validPct(row?.lead_to_sale_percent);if(!ids.has(id)||seen.has(id)||contact===null||close===null)return json({error:"Проверь направления и проценты конверсии от 0 до 100"},400);seen.add(id);statements.push(env.DB.prepare("INSERT INTO direction_sales_funnels (user_id,direction_id,contact_to_lead_percent,lead_to_sale_percent) VALUES (?,?,?,?) ON CONFLICT(user_id,direction_id) DO UPDATE SET contact_to_lead_percent=excluded.contact_to_lead_percent,lead_to_sale_percent=excluded.lead_to_sale_percent,updated_at=datetime('now')").bind(user.id,id,contact,close));}
 if(seen.size!==ids.size)return json({error:"Обнови страницу: состав направлений изменился"},400);
 if(statements.length)await env.DB.batch(statements);
 return json({ok:true});
}
