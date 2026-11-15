import { json, requireUser, readJson, newId } from "../_lib/auth.js";
const STAGES=new Set(["contact","negotiation","proposal","awaiting_payment","won","lost"]);
const validDate=value=>!value||(/^\\d{4}-\\d{2}-\\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+"T00:00:00Z"))&&new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value);
async function owned(env,table,id,userId){if(!id)return true;return Boolean(await env.DB.prepare("SELECT id FROM "+table+" WHERE id=? AND user_id=?").bind(id,userId).first());}
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const rows=await env.DB.prepare("SELECT d.*,c.name client_name,dr.title direction_title,ROUND(d.amount*d.probability_percent/100,2) weighted_amount FROM deals d LEFT JOIN clients c ON c.id=d.client_id AND c.user_id=d.user_id LEFT JOIN directions dr ON dr.id=d.direction_id AND dr.user_id=d.user_id WHERE d.user_id=? ORDER BY CASE d.stage WHEN 'awaiting_payment' THEN 0 WHEN 'proposal' THEN 1 WHEN 'negotiation' THEN 2 WHEN 'contact' THEN 3 WHEN 'won' THEN 4 ELSE 5 END,d.expected_close_date,d.updated_at DESC").bind(user.id).all();
 const deals=rows.results.map(x=>({...x,amount:Number(x.amount),weighted_amount:Number(x.weighted_amount)}));
 const open=deals.filter(x=>!["won","lost"].includes(x.stage)),won=deals.filter(x=>x.stage==="won");
 return json({deals,summary:{open_count:open.length,open_amount:open.reduce((s,x)=>s+x.amount,0),weighted_amount:open.reduce((s,x)=>s+x.weighted_amount,0),won_amount:won.reduce((s,x)=>s+x.amount,0)}});
}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request)||{},action=String(b.action||"create");
 if(action==="delete"){const id=String(b.id||"");if(!id)return json({error:"Сделка не найдена"},400);const r=await env.DB.prepare("DELETE FROM deals WHERE id=? AND user_id=?").bind(id,user.id).run();return Number(r.meta?.changes||0)?json({ok:true}):json({error:"Сделка не найдена"},404);}
 const title=String(b.title||"").trim(),clientId=b.client_id?String(b.client_id):null,directionId=b.direction_id?String(b.direction_id):null,amount=Number(b.amount),probability=Number(b.probability_percent),stage=String(b.stage||"contact"),date=b.expected_close_date?String(b.expected_close_date):null,notes=String(b.notes||"").slice(0,1500);
 if(!title||title.length>180||!Number.isFinite(amount)||amount<=0||amount>100000000||!Number.isInteger(probability)||probability<0||probability>100||!STAGES.has(stage)||!validDate(date))return json({error:"Проверь название, сумму, этап, вероятность и дату оплаты"},400);
 if(!(await owned(env,"clients",clientId,user.id))||!(await owned(env,"directions",directionId,user.id)))return json({error:"Клиент или направление не найдены"},404);
 if(b.project_id&&!await owned(env,"projects",String(b.project_id),user.id))return json({error:"Проект не найден"},404);
 const id=newId();
 await env.DB.prepare("INSERT INTO deals (id,user_id,client_id,direction_id,title,amount,stage,probability_percent,expected_close_date,notes) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id,user.id,clientId,directionId,title,amount,stage,probability,date,notes).run();
 return json({ok:true,id},201);
}
