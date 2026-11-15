import { json, requireUser, readJson, newId } from "../../_lib/auth.js";
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function validDate(v){if(!DATE.test(v))return false;const d=new Date(v+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
const clean=(v,n)=>String(v||"").trim().slice(0,n);
export async function onRequestGet({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const rows=await env.DB.prepare("SELECT * FROM irregular_expenses WHERE user_id=? ORDER BY active DESC,next_date,title").bind(user.id).all();
 return json({items:rows.results});
}
export async function onRequestPost({request,env}){
 const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
 const b=await readJson(request)||{},action=String(b.action||"");
 if(action==="delete"){
  const r=await env.DB.prepare("DELETE FROM irregular_expenses WHERE id=? AND user_id=?").bind(clean(b.id,100),user.id).run();
  if(!r.meta.changes)return json({error:"Расход не найден"},404);return json({ok:true});
 }
 const title=clean(b.title,180),category=clean(b.category,80)||"Нерегулярные расходы",amount=Number(b.amount),date=String(b.next_date||""),frequency=String(b.frequency||"once"),notes=clean(b.notes,500);
 if(!title||!Number.isFinite(amount)||amount<=0||amount>100000000||!validDate(date)||!["once","yearly","quarterly"].includes(frequency))return json({error:"Проверь название, сумму, дату и периодичность"},400);
 if(action==="update"){
  const r=await env.DB.prepare("UPDATE irregular_expenses SET title=?,category=?,amount=?,next_date=?,frequency=?,notes=?,active=?,updated_at=datetime('now') WHERE id=? AND user_id=?").bind(title,category,amount,date,frequency,notes,b.active===false?0:1,clean(b.id,100),user.id).run();
  if(!r.meta.changes)return json({error:"Расход не найден"},404);return json({ok:true});
 }
 const id=newId();
 await env.DB.prepare("INSERT INTO irregular_expenses (id,user_id,title,category,amount,next_date,frequency,notes) VALUES (?,?,?,?,?,?,?,?)").bind(id,user.id,title,category,amount,date,frequency,notes).run();
 return json({ok:true,id},201);
}
