const round=value=>Math.round(value*10)/10;
export function buildTimeAllocationRecommendations(directions=[],availableHours=5){
 const capacity=Number(availableHours);
 if(!Number.isFinite(capacity)||capacity<=0||capacity>80)throw new Error("Количество часов должно быть от 1 до 80");
 const candidates=directions.map(row=>{
  const contributionPerHour=Number(row.contribution_per_hour),hours=Number(row.hours),revenue=Number(row.revenue),contribution=Number(row.contribution);
  const winRate=row.observed_lead_to_sale_percent===null||row.observed_lead_to_sale_percent===undefined?NaN:Number(row.observed_lead_to_sale_percent),leadSample=Number(row.qualified_clients)||0,cycle= row.avg_contact_to_won_days===null||row.avg_contact_to_won_days===undefined?NaN:Number(row.avg_contact_to_won_days),cycleSample=Number(row.contact_to_won_sample)||0;
  if(!row.direction_id||!Number.isFinite(contributionPerHour)||contributionPerHour<=0||!Number.isFinite(hours)||hours<=0||!Number.isFinite(revenue)||revenue<=0||!Number.isFinite(contribution)||contribution<=0)return null;
  const evidence=Math.min(1,Math.sqrt(Math.max(1,leadSample)/5));
  const conversionFactor=Number.isFinite(winRate)&&leadSample>=3?Math.max(.65,Math.min(1.35,.65+winRate/100)):0.85;
  const speedFactor=Number.isFinite(cycle)&&cycleSample>=3?Math.max(.75,Math.min(1.15,30/Math.max(1,cycle))):1;
  const score=contributionPerHour*conversionFactor*speedFactor*evidence;
  return {...row,allocation_score:round(score),confidence:leadSample>=5&&cycleSample>=3?"выше":"предварительная",allocation_reasons:[`вклад на час — ${Math.round(contributionPerHour)} ₽`,Number.isFinite(winRate)&&leadSample>=3?`конверсия в продажу — ${winRate}%`:"конверсия пока не подтверждена",Number.isFinite(cycle)&&cycleSample>=3?`цикл продажи — ${cycle} дн.`:"длительность цикла пока не подтверждена"]};
 }).filter(Boolean).sort((a,b)=>b.allocation_score-a.allocation_score);
 const selected=candidates.slice(0,3),total=selected.reduce((sum,x)=>sum+x.allocation_score,0);
 const recommendations=selected.map(row=>({...row,recommended_hours:round(capacity*row.allocation_score/total)}));
 return {available_hours:capacity,recommendations,excluded_directions:directions.filter(x=>!candidates.some(y=>y.direction_id===x.direction_id)).map(x=>({direction_id:x.direction_id,direction_title:x.direction_title,reason:!Number.isFinite(Number(x.contribution_per_hour))||Number(x.hours)<=0?"нет достаточного учёта времени":Number(x.contribution)<=0?"положительный вклад пока не подтверждён":"недостаточно данных"})),method:"Распределение пропорционально положительному вкладу на час с осторожной поправкой на наблюдаемую конверсию, длительность цикла и объём выборки. Это предложение, не автоматическое изменение расписания."};
}
