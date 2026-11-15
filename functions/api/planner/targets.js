import { json, requireUser, readJson, newId } from "../../_lib/auth.js";

export async function onRequestGet({request,env}) {
 const user=await requireUser(request,env);
 if(!user)return json({error:"Необходим вход"},401);
 const {results}=await env.DB.prepare("SELECT id,direction_id,life_area_id,target_minutes FROM weekly_time_targets WHERE user_id=?").bind(user.id).all();
 return json({targets:results});
}
export async function onRequestPut({request,env}) {
 const user=await requireUser(request,env);
 if(!user)return json({error:"Необходим вход"},401);
 const body=await readJson(request)||{};
 if(!Array.isArray(body.targets)||body.targets.length>100)return json({error:"Передан некорректный список ориентиров"},400);
 const directions=await env.DB.prepare("SELECT id FROM directions WHERE user_id=? AND active=1").bind(user.id).all();
 const areas=await env.DB.prepare("SELECT id FROM life_areas WHERE user_id=? AND active=1").bind(user.id).all();
 const directionIds=new Set(directions.results.map(x=>x.id)),areaIds=new Set(areas.results.map(x=>x.id)),seen=new Set(),normalized=[];
 for(const item of body.targets){
  const directionId=item?.direction_id?String(item.direction_id):null,lifeAreaId=item?.life_area_id?String(item.life_area_id):null;
  const minutes=Number(item?.target_minutes);
  if(Boolean(directionId)===Boolean(lifeAreaId)||!Number.isInteger(minutes)||minutes<0||minutes>10080)return json({error:"Для каждого ориентира укажи одну сферу и от 0 до 168 часов в неделю"},400);
  if((directionId&&!directionIds.has(directionId))||(lifeAreaId&&!areaIds.has(lifeAreaId)))return json({error:"Одна из сфер не найдена"},404);
  const key=directionId?"d:"+directionId:"a:"+lifeAreaId;
  if(seen.has(key))return json({error:"Сфера указана несколько раз"},400);
  seen.add(key);normalized.push({directionId,lifeAreaId,minutes});
 }
 const statements=[env.DB.prepare("DELETE FROM weekly_time_targets WHERE user_id=?").bind(user.id),...normalized.map(x=>env.DB.prepare("INSERT INTO weekly_time_targets (id,user_id,direction_id,life_area_id,target_minutes,updated_at) VALUES (?,?,?,?,?,datetime('now'))").bind(newId(),user.id,x.directionId,x.lifeAreaId,x.minutes))];
 await env.DB.batch(statements);
 return json({ok:true,saved:normalized.length});
}
