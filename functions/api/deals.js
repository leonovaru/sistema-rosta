import { json, requireUser, readJson, newId } from "../_lib/auth.js";
import { buildMonthlyDealForecast } from "../_lib/deal-forecast.js";
import { buildObservedSalesFunnel } from "../_lib/observed-sales-funnel.js";
import { buildDealDateForecast } from "../_lib/deal-date-forecast.js";
const STAGES=new Set(["contact","negotiation","proposal","awaiting_payment","won","lost"]);
const LOSS_REASONS=new Set(["price","timing","no_need","competitor","no_response","trust","scope","other"]);
const LOSS_LABELS={price:"Цена / бюджет",timing:"Сроки",no_need:"Нет потребности",competitor:"Выбрали конкурента",no_response:"Нет ответа",trust:"Недостаток доверия",scope:"Не подошёл объём / формат",other:"Другая причина"};
const validDate=value=>!value||(/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+"T00:00:00Z"))&&new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value);
async function owned(env,table,id,userId){if(!id)return true;return Boolean(await env.DB.prepare("SELECT id FROM "+table+" WHERE id=? AND user_id=?").bind(id,userId).first());}
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const rows=await env.DB.prepare("SELECT d.*,c.name client_name,dr.title direction_title,ROUND(d.amount*d.probability_percent/100,2) weighted_amount FROM deals d LEFT JOIN clients c ON c.id=d.client_id AND c.user_id=d.user_id LEFT JOIN directions dr ON dr.id=d.direction_id AND dr.user_id=d.user_id WHERE d.user_id=? AND d.archived_at IS NULL ORDER BY CASE d.stage WHEN 'awaiting_payment' THEN 0 WHEN 'proposal' THEN 1 WHEN 'negotiation' THEN 2 WHEN 'contact' THEN 3 WHEN 'won' THEN 4 ELSE 5 END,d.expected_close_date,d.updated_at DESC").bind(user.id).all();
 const [monthlyDeals,monthlyIncome,undatedDeals,firstContacts,dealStageEvents,dealFirstContacts]=await Promise.all([
  env.DB.prepare("SELECT substr(expected_payment_date,1,7) month,COUNT(*) deal_count,SUM(amount) planned_amount,SUM(amount*probability_percent/100) weighted_amount FROM deals WHERE user_id=? AND archived_at IS NULL AND stage NOT IN ('won','lost') AND expected_payment_date IS NOT NULL GROUP BY substr(expected_payment_date,1,7) ORDER BY month").bind(user.id).all(),
  env.DB.prepare("SELECT substr(received_on,1,7) month,SUM(amount) actual_amount FROM income_entries WHERE user_id=? GROUP BY substr(received_on,1,7) ORDER BY month").bind(user.id).all(),
  env.DB.prepare("SELECT COUNT(*) count,SUM(amount) amount FROM deals WHERE user_id=? AND archived_at IS NULL AND stage NOT IN ('won','lost') AND expected_payment_date IS NULL").bind(user.id).first(),
  env.DB.prepare("SELECT c.direction_id,ci.client_id,MIN(ci.occurred_on) first_contact_on FROM client_interactions ci JOIN clients c ON c.id=ci.client_id AND c.user_id=ci.user_id WHERE ci.user_id=? AND ci.interaction_type IN ('call','email','message') AND ci.occurred_on>=date('now','-89 days') AND c.direction_id IS NOT NULL GROUP BY c.direction_id,ci.client_id").bind(user.id).all(),
  env.DB.prepare("SELECT e.direction_id_snapshot AS direction_id,e.client_id_snapshot AS client_id,e.changes_json,e.created_at FROM deal_events e JOIN deals d ON d.id=e.deal_id AND d.user_id=e.user_id WHERE e.user_id=? AND d.archived_at IS NULL ORDER BY e.created_at").bind(user.id).all(),
  env.DB.prepare("SELECT d.direction_id,ci.client_id,MIN(ci.occurred_on) first_contact_on FROM deals d JOIN client_interactions ci ON ci.client_id=d.client_id AND ci.user_id=d.user_id WHERE d.user_id=? AND d.client_id IS NOT NULL AND d.direction_id IS NOT NULL AND ci.interaction_type IN ('call','email','message') GROUP BY d.direction_id,ci.client_id").bind(user.id,user.id).all() ]);
 const events=await env.DB.prepare("SELECT e.* FROM deal_events e JOIN deals d ON d.id=e.deal_id AND d.user_id=e.user_id WHERE e.user_id=? AND d.archived_at IS NULL ORDER BY e.created_at DESC LIMIT 500").bind(user.id).all();
 const eventsByDeal=new Map();for(const event of events.results){if(!eventsByDeal.has(event.deal_id))eventsByDeal.set(event.deal_id,[]);eventsByDeal.get(event.deal_id).push(event);}
 const observed=buildObservedSalesFunnel({interactionRows:firstContacts.results,dealEventRows:dealStageEvents.results});
 const cycleByDirection=new Map(observed.map(x=>[x.direction_id,x]));
 const firstContactByClient=new Map(dealFirstContacts.results.map(x=>[x.direction_id+"::"+x.client_id,x.first_contact_on]));
 const deals=buildDealDateForecast(rows.results.map(x=>({...x,amount:Number(x.amount),weighted_amount:Number(x.weighted_amount),history:eventsByDeal.get(x.id)||[]})),{cycleByDirection,firstContactByClient});
 const open=deals.filter(x=>!["won","lost"].includes(x.stage)),won=deals.filter(x=>x.stage==="won"),lost=deals.filter(x=>x.stage==="lost");
 const lossReasons=Object.entries(LOSS_LABELS).map(([key,label])=>{const items=lost.filter(x=>x.loss_reason_category===key);return {key,label,count:items.length,amount:items.reduce((s,x)=>s+x.amount,0)};}).filter(x=>x.count).sort((a,b)=>b.count-a.count);
 const {monthly_forecast,undated_open}=buildMonthlyDealForecast({dealRows:monthlyDeals.results,incomeRows:monthlyIncome.results,undatedRow:undatedDeals});
 return json({deals,summary:{open_count:open.length,open_amount:open.reduce((s,x)=>s+x.amount,0),weighted_amount:open.reduce((s,x)=>s+x.weighted_amount,0),won_amount:won.reduce((s,x)=>s+x.amount,0),lost_count:lost.length,lost_amount:lost.reduce((s,x)=>s+x.amount,0)},loss_reasons:lossReasons,monthly_forecast,undated_open});
}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request)||{},action=String(b.action||"create");
 if(action==="delete"){
  const id=String(b.id||"");if(!id)return json({error:"Сделка не найдена"},400);
  const r=await env.DB.prepare("UPDATE deals SET archived_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND user_id=? AND archived_at IS NULL").bind(id,user.id).run();
  return Number(r.meta?.changes||0)?json({ok:true}):json({error:"Сделка не найдена"},404);
 }
 const id=action==="update"?String(b.id||""):newId();
 if(action==="update"&&!id)return json({error:"Сделка не найдена"},400);
 const title=String(b.title||"").trim(),clientId=b.client_id?String(b.client_id):null,directionId=b.direction_id?String(b.direction_id):null,amount=Number(b.amount),probability=Number(b.probability_percent),stage=String(b.stage||"contact"),date=b.expected_close_date?String(b.expected_close_date):null,paymentDate=b.expected_payment_date?String(b.expected_payment_date):null,notes=String(b.notes||"").slice(0,1500),lossCategory=stage==="lost"?String(b.loss_reason_category||""):"",lossDetails=stage==="lost"?String(b.loss_reason_details||"").trim().slice(0,1200):"";
 if(!title||title.length>180||!Number.isFinite(amount)||amount<=0||amount>100000000||!Number.isInteger(probability)||probability<0||probability>100||!STAGES.has(stage)||!validDate(date)||!validDate(paymentDate)||(stage==="lost"&&(!LOSS_REASONS.has(lossCategory)||(lossCategory==="other"&&!lossDetails))))return json({error:"Проверь название, сумму, этап, вероятность, дату и причину проигрыша"},400);
 if(!(await owned(env,"clients",clientId,user.id))||!(await owned(env,"directions",directionId,user.id)))return json({error:"Клиент или направление не найдены"},404);
 if(action==="update"){
  const old=await env.DB.prepare("SELECT * FROM deals WHERE id=? AND user_id=?").bind(id,user.id).first();
  if(!old)return json({error:"Сделка не найдена"},404);
  const changes=[];
  for(const [field,label,next] of [["title","Название",title],["amount","Сумма",amount],["stage","Этап",stage],["probability_percent","Вероятность",probability],["expected_close_date","Ожидаемая дата закрытия",date],["expected_payment_date","Ожидаемая дата оплаты",paymentDate],["client_id","Клиент",clientId],["direction_id","Направление",directionId],["notes","Комментарий",notes],["loss_reason_category","Причина проигрыша",lossCategory||null],["loss_reason_details","Пояснение причины",lossDetails]])if((old[field]??null)!==(next??null))changes.push({field,label,from:old[field]??null,to:next??null});
  if(!changes.length)return json({ok:true,id,unchanged:true});
  await env.DB.batch([
   env.DB.prepare("UPDATE deals SET client_id=?,direction_id=?,title=?,amount=?,stage=?,probability_percent=?,expected_close_date=?,expected_payment_date=?,notes=?,loss_reason_category=?,loss_reason_details=?,updated_at=datetime('now') WHERE id=? AND user_id=?").bind(clientId,directionId,title,amount,stage,probability,date,paymentDate,notes,lossCategory||null,lossDetails,id,user.id),
   env.DB.prepare("INSERT INTO deal_events (id,user_id,deal_id,event_type,changes_json,direction_id_snapshot,client_id_snapshot) VALUES (?,?,?,'updated',?,?,?)").bind(newId(),user.id,id,JSON.stringify(changes),directionId,clientId)
  ]);
  return json({ok:true,id});
 }
 if(action!=="create")return json({error:"Неизвестное действие"},400);
 await env.DB.batch([
  env.DB.prepare("INSERT INTO deals (id,user_id,client_id,direction_id,title,amount,stage,probability_percent,expected_close_date,expected_payment_date,notes,loss_reason_category,loss_reason_details) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,user.id,clientId,directionId,title,amount,stage,probability,date,paymentDate,notes,lossCategory||null,lossDetails),
  env.DB.prepare("INSERT INTO deal_events (id,user_id,deal_id,event_type,changes_json,direction_id_snapshot,client_id_snapshot) VALUES (?,?,?,'created',?,?,?)").bind(newId(),user.id,id,JSON.stringify([{field:"created",label:"Сделка создана",to:title}]),directionId,clientId)
 ]);
 return json({ok:true,id},201);
}