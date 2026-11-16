export function buildRecoveryInsights(entries=[],timezone="Europe/Moscow"){
 const valid=(entries||[]).map(row=>({started_at:row.started_at,ended_at:row.ended_at,duration_minutes:Math.max(0,Number(row.duration_minutes)||0)})).filter(row=>row.started_at&&row.ended_at&&row.duration_minutes>0);
 const long=valid.filter(row=>row.duration_minutes>=90),veryLong=valid.filter(row=>row.duration_minutes>=120);
 const sorted=valid.map(row=>row.duration_minutes).sort((a,b)=>a-b);
 const median=sorted.length?sorted[Math.floor(sorted.length/2)]:null;
 const longest=sorted.length?sorted[sorted.length-1]:null;
 const average=sorted.length?Math.round(sorted.reduce((sum,value)=>sum+value,0)/sorted.length):null;
 return {
  sample_sessions:valid.length,
  confidence:valid.length>=20?"higher":valid.length>=5?"preliminary":"insufficient",
  median_session_minutes:median,
  average_session_minutes:average,
  longest_session_minutes:longest,
  sessions_over_90_minutes:long.length,
  sessions_over_120_minutes:veryLong.length,
  long_session_share_percent:valid.length?Math.round(long.length/valid.length*100):0,
  guidance:valid.length<5?"Пока мало завершённых сессий, чтобы оценивать привычную нагрузку.":long.length?"В истории есть продолжительные сессии. Проверьте, не забывается ли останавливать таймер на перерывах.":"Пока не видно частых сессий длиннее 90 минут.",
  break_rule:{focus_minutes:50,break_minutes:10,optional_short_break_minutes:5},
  timezone,
  notes:["Длительность таймера не доказывает непрерывную концентрацию: таймер мог оставаться включённым во время перерыва.","Правило 50/10 — необязательная стартовая настройка, а не обязательная норма.","Система не создаёт события перерывов и не меняет календарь автоматически."]
 };
}
