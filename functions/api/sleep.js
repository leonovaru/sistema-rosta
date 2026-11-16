import { json, requireUser, readJson, newId } from "../_lib/auth.js";
import { isValidSleepSequence, resolveSleepWallTime } from "../_lib/sleep.js";

const DATE=/^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const SOURCES=["manual","app","push","health_import"];
const CONFIDENCE=["exact","approximate","imported"];
export function normalizeSleepLimit(value){
  const parsed=Number(value||30);
  return Number.isFinite(parsed)?Math.min(90,Math.max(1,Math.trunc(parsed))):30;
}

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
  const url=new URL(request.url),limit=normalizeSleepLimit(url.searchParams.get("limit"));
  const {results}=await env.DB.prepare("SELECT * FROM sleep_sessions WHERE user_id=? ORDER BY sleep_date DESC LIMIT ?").bind(user.id,limit).all();
  const settings=await env.DB.prepare("SELECT sleep_target_minutes FROM settings WHERE user_id=?").bind(user.id).first();
  return json({sessions:results,sleep_target_minutes:settings?.sleep_target_minutes==null?null:Number(settings.sleep_target_minutes)});
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
    const bedTimezone=row.bed_timezone||row.timezone||timezone;
    const asleepTimezone=row.asleep_timezone||row.timezone||timezone;
    const wakeTimezone=row.wake_timezone||row.timezone||timezone;
    const sequence=action==="bed"
      ? [{value,timezone},{value:row.fell_asleep_at,timezone:asleepTimezone},{value:row.woke_at,timezone:wakeTimezone}]
      : [{value:row.went_to_bed_at,timezone:bedTimezone},{value,timezone},{value:row.woke_at,timezone:wakeTimezone}];
    if(!isValidSleepSequence(sequence))return json({error:action==="bed"
      ?"Время отхода ко сну должно быть раньше засыпания и пробуждения"
      :"Проверьте последовательность: отход ко сну, засыпание, пробуждение"},400);
    const field=action==="bed"?"went_to_bed_at":"fell_asleep_at";
    const source=action==="bed"?"bed_source":"asleep_source";
    const confidence=action==="bed"?"bed_confidence":"asleep_confidence";
    const timezoneField=action==="bed"?"bed_timezone":"asleep_timezone";
    await env.DB.prepare(`UPDATE sleep_sessions SET ${field}=?,${timezoneField}=?,${source}='app',${confidence}='exact',updated_at=datetime('now') WHERE id=? AND user_id=?`).bind(value,timezone,row.id,user.id).run();
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
    const lastSleepTimezone=row.fell_asleep_at?(row.asleep_timezone||row.timezone||timezone):(row.bed_timezone||row.timezone||timezone);
    if(lastSleepTime){
      const a=resolveSleepWallTime(lastSleepTime,lastSleepTimezone),b=resolveSleepWallTime(wakeAt,timezone);
      if(a===null||b===null||b<=a)return json({error:"Время пробуждения должно быть позже времени отхода ко сну. Проверьте часовой пояс и время"},400);
    }
    const saved=await env.DB.prepare("UPDATE sleep_sessions SET woke_at=?,wake_date=?,wake_source=?,wake_confidence='exact',wake_timezone=?,updated_at=datetime('now') WHERE id=? AND user_id=? AND woke_at IS NULL").bind(wakeAt,today,body?.source==="push"?"push":"app",timezone,row.id,user.id).run();
    if(!saved.meta.changes)return json({ok:true,duplicate:true,session:await env.DB.prepare("SELECT * FROM sleep_sessions WHERE id=? AND user_id=?").bind(row.id,user.id).first()});
    return json({ok:true,session:await env.DB.prepare("SELECT * FROM sleep_sessions WHERE id=? AND user_id=?").bind(row.id,user.id).first()});
  }
  if(action==="edit"){
    const id=String(body?.id||"");
    if(!id)return json({error:"Запись не выбрана"},400);
    for(const key of ["went_to_bed_at","fell_asleep_at","woke_at"])if(!validateTime(body[key]))return json({error:"Проверь дату и время"},400);
    const existing=await env.DB.prepare("SELECT * FROM sleep_sessions WHERE id=? AND user_id=?").bind(id,user.id).first();
    if(!existing)return json({error:"Запись не найдена"},404);
    const bed=body.went_to_bed_at||null,asleep=body.fell_asleep_at||null,wake=body.woke_at||null;
    const bedTimezone=String(body.bed_timezone||existing.bed_timezone||existing.timezone||timezone);
    const asleepTimezone=String(body.asleep_timezone||existing.asleep_timezone||existing.timezone||timezone);
    const wakeTimezone=String(body.wake_timezone||existing.wake_timezone||existing.timezone||timezone);
    if(!validTimezone(bedTimezone)||!validTimezone(asleepTimezone)||!validTimezone(wakeTimezone))return json({error:"Проверьте часовой пояс. Нужен формат IANA, например Europe/Amsterdam"},400);
    if(!isValidSleepSequence([
      {value:bed,timezone:bedTimezone},
      {value:asleep,timezone:asleepTimezone},
      {value:wake,timezone:wakeTimezone}
    ]))return json({error:"Проверьте последовательность времени и часовые пояса: отход ко сну, засыпание, пробуждение"},400);
    const source=(v)=>SOURCES.includes(v)?v:"manual";
    const confidence=(v)=>CONFIDENCE.includes(v)?v:"approximate";
    const note=String(body?.note||"").trim().slice(0,1000);
    const result=await env.DB.prepare(`UPDATE sleep_sessions SET went_to_bed_at=?,fell_asleep_at=?,woke_at=?,wake_date=?,bed_timezone=?,asleep_timezone=?,wake_timezone=?,bed_source=?,asleep_source=?,wake_source=?,bed_confidence=?,asleep_confidence=?,wake_confidence=?,note=?,updated_at=datetime('now') WHERE id=? AND user_id=?`)
      .bind(bed,asleep,wake,wake?wake.slice(0,10):null,bedTimezone,asleepTimezone,wakeTimezone,source(body.bed_source),source(body.asleep_source),source(body.wake_source),confidence(body.bed_confidence),confidence(body.asleep_confidence),confidence(body.wake_confidence),note,id,user.id).run();
    if(!result.meta.changes)return json({error:"Запись не найдена"},404);
    return json({ok:true});
  }
  if(action==="goal"){
    const raw=body?.sleep_target_minutes;
    const target=raw===null||raw===""?null:Number(raw);
    if(target!==null&&(!Number.isInteger(target)||target<180||target>720||target%15!==0))return json({error:"Цель сна должна быть от 180 до 720 минут с шагом 15 минут или быть пустой"},400);
    await env.DB.prepare("UPDATE settings SET sleep_target_minutes=?,updated_at=datetime('now') WHERE user_id=?").bind(target,user.id).run();
    return json({ok:true,sleep_target_minutes:target});
  }
  if(action==="delete"){
    const id=String(body?.id||"");if(!id)return json({error:"Запись не выбрана"},400);
    const result=await env.DB.prepare("DELETE FROM sleep_sessions WHERE id=? AND user_id=?").bind(id,user.id).run();
    if(!result.meta.changes)return json({error:"Запись не найдена"},404);
    return json({ok:true});
  }
  return json({error:"Неизвестное действие"},400);
}
