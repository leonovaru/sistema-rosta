import { json, requireUser, readJson, newId } from "../_lib/auth.js";

const DATE=/^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const SOURCES=["manual","app","push","health_import"];
const CONFIDENCE=["exact","approximate","imported"];

function localParts(date,timezone){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
  return Object.fromEntries(parts.map(p=>[p.type,p.value]));
}
function shiftDate(date,days){
  const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
function validTimezone(value){
  try{new Intl.DateTimeFormat("ru-RU",{timeZone:value});return true;}catch{return false;}
}
async function ensureSession(env,userId,sleepDate,timezone){
  let row=await env.DB.prepare("SELECT * FROM sleep_sessions WHERE user_id=? AND sleep_date=?").bind(userId,sleepDate).first();
  if(row)return row;
  const id=newId();
  await env.DB.prepare("INSERT OR IGNORE INTO sleep_sessions (id,user_id,sleep_date,timezone) VALUES (?,?,?,?)").bind(id,userId,sleepDate,timezone).run();
  return await env.DB.prepare("SELECT * FROM sleep_sessions WHERE user_id=? AND sleep_date=?").bind(userId,sleepDate).first();
}
function validateTime(value){
  if(value==null||value==="")return true;
  const match=String(value).match(LOCAL_DATE_TIME);
  if(!match)return false;
  const [date,time]=String(value).split("T"),[year,month,day]=date.split("-").map(Number),[hour,minute]=time.split(":").map(Number);
  const parsed=new Date(Date.UTC(year,month-1,day,hour,minute));
  return parsed.getUTCFullYear()===year&&parsed.getUTCMonth()===month-1&&parsed.getUTCDate()===day&&hour<=23&&minute<=59;
}

export async function onRequestGet({request,env}){
  const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
  const url=new URL(request.url),limit=Math.min(90,Math.max(1,Number(url.searchParams.get("limit")||30)));
  const {results}=await env.DB.prepare("SELECT * FROM sleep_sessions WHERE user_id=? ORDER BY sleep_date DESC LIMIT ?").bind(user.id,limit).all();
  return json({sessions:results});
}

export async function onRequestPost({request,env}){
  const user=await requireUser(request,env);if(!user)return json({error:"Необходим вход"},401);
  const body=await readJson(request),action=String(body?.action||"");
  const settings=await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
  const timezone=String(body?.timezone||settings?.timezone||"Europe/Moscow");
  if(!validTimezone(timezone))return json({error:"Некорректный часовой пояс"},400);
  const now=new Date(),parts=localParts(now,timezone),today=parts.year+"-"+parts.month+"-"+parts.day;
  if(action==="bed"||action==="asleep"){
    const value=body?.at?String(body.at):parts.year+"-"+parts.month+"-"+parts.day+"T"+parts.hour+":"+parts.minute;
    if(!validateTime(value)||value.slice(0,10)!==today)return json({error:"Укажите корректное время сегодняшнего дня"},400);
    const row=await ensureSession(env,user.id,today,timezone);
    if(action==="bed"&&row.fell_asleep_at&&value>=row.fell_asleep_at)return json({error:"Отход ко сну должен быть раньше времени засыпания"},400);
    if(action==="asleep"&&row.went_to_bed_at&&value<=row.went_to_bed_at)return json({error:"Время засыпания должно быть позже отхода ко сну"},400);
    if(action==="asleep"&&row.woke_at&&value>=row.woke_at)return json({error:"Время засыпания должно быть раньше пробуждения"},400);
    const field=action==="bed"?"went_to_bed_at":"fell_asleep_at";
    const source=action==="bed"?"bed_source":"asleep_source";
    const confidence=action==="bed"?"bed_confidence":"asleep_confidence";
    await env.DB.prepare(`UPDATE sleep_sessions SET ${field}=?,${source}='app',${confidence}='exact',timezone=?,updated_at=datetime('now') WHERE id=? AND user_id=?`).bind(value,timezone,row.id,user.id).run();
    return json({ok:true,session:await env.DB.prepare("SELECT * FROM sleep_sessions WHERE id=? AND user_id=?").bind(row.id,user.id).first()});
  }
  if(action==="wake"){
    const wakeAt=body?.at?String(body.at):parts.year+"-"+parts.month+"-"+parts.day+"T"+parts.hour+":"+parts.minute;
    if(!validateTime(wakeAt)||wakeAt.slice(0,10)!==today)return json({error:"Укажите корректное время пробуждения за сегодня"},400);
    const alreadyConfirmed=await env.DB.prepare("SELECT * FROM sleep_sessions WHERE user_id=? AND wake_date=? AND woke_at IS NOT NULL ORDER BY updated_at DESC LIMIT 1").bind(user.id,today).first();
    if(alreadyConfirmed)return json({ok:true,duplicate:true,session:alreadyConfirmed});
    let row=await env.DB.prepare("SELECT * FROM sleep_sessions WHERE user_id=? AND woke_at IS NULL AND sleep_date IN (?,?) ORDER BY sleep_date DESC LIMIT 1").bind(user.id,today,shiftDate(today,-1)).first();
    if(!row)row=await ensureSession(env,user.id,shiftDate(today,-1),timezone);
    if(row.woke_at)return json({ok:true,duplicate:true,session:row});
    const lastSleepTime=row.fell_asleep_at||row.went_to_bed_at;
    if(lastSleepTime&&wakeAt<=lastSleepTime)return json({error:"Время пробуждения должно быть позже времени отхода ко сну"},400);
    const saved=await env.DB.prepare("UPDATE sleep_sessions SET woke_at=?,wake_date=?,wake_source=?,wake_confidence='exact',timezone=?,updated_at=datetime('now') WHERE id=? AND user_id=? AND woke_at IS NULL").bind(wakeAt,today,body?.source==="push"?"push":"app",timezone,row.id,user.id).run();
    if(!saved.meta.changes)return json({ok:true,duplicate:true,session:await env.DB.prepare("SELECT * FROM sleep_sessions WHERE id=? AND user_id=?").bind(row.id,user.id).first()});
    return json({ok:true,session:await env.DB.prepare("SELECT * FROM sleep_sessions WHERE id=? AND user_id=?").bind(row.id,user.id).first()});
  }
  if(action==="edit"){
    const id=String(body?.id||"");
    if(!id)return json({error:"Запись не выбрана"},400);
    for(const key of ["went_to_bed_at","fell_asleep_at","woke_at"])if(!validateTime(body[key]))return json({error:"Проверь дату и время"},400);
    const bed=body.went_to_bed_at||null,asleep=body.fell_asleep_at||null,wake=body.woke_at||null;
    if((bed&&asleep&&asleep<bed)||(asleep&&wake&&wake<=asleep)||(bed&&wake&&wake<=bed))return json({error:"Проверь последовательность времени: отход ко сну, засыпание, пробуждение"},400);
    const source=(v)=>SOURCES.includes(v)?v:"manual";
    const confidence=(v)=>CONFIDENCE.includes(v)?v:"approximate";
    const note=String(body?.note||"").trim().slice(0,1000);
    const result=await env.DB.prepare(`UPDATE sleep_sessions SET went_to_bed_at=?,fell_asleep_at=?,woke_at=?,wake_date=?,bed_source=?,asleep_source=?,wake_source=?,bed_confidence=?,asleep_confidence=?,wake_confidence=?,note=?,updated_at=datetime('now') WHERE id=? AND user_id=?`)
      .bind(body.went_to_bed_at||null,body.fell_asleep_at||null,body.woke_at||null,body.woke_at?String(body.woke_at).slice(0,10):null,source(body.bed_source),source(body.asleep_source),source(body.wake_source),confidence(body.bed_confidence),confidence(body.asleep_confidence),confidence(body.wake_confidence),note,id,user.id).run();
    if(!result.meta.changes)return json({error:"Запись не найдена"},404);
    return json({ok:true});
  }
  if(action==="delete"){
    const id=String(body?.id||"");if(!id)return json({error:"Запись не выбрана"},400);
    const result=await env.DB.prepare("DELETE FROM sleep_sessions WHERE id=? AND user_id=?").bind(id,user.id).run();
    if(!result.meta.changes)return json({error:"Запись не найдена"},404);
    return json({ok:true});
  }
  return json({error:"Неизвестное действие"},400);
}
