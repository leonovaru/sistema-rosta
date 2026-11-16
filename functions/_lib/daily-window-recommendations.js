function periodFor(time){const hour=Number(String(time||"").slice(0,2));return hour<12?"Утро":hour<18?"День":"Вечер";}
export function annotateDailyWindowRecommendations(plans=[],patterns=null){
 const overall=Number(patterns?.overall?.completion_rate);
 const enoughOverall=Number(patterns?.overall?.sample_size)>=8;
 const periods=new Map((patterns?.by_period||[]).map(row=>[row.period,row]));
 return (plans||[]).map(day=>({...day,free_windows:(day.free_windows||[]).map(window=>{
  const period=periodFor(window.start_time),history=periods.get(period),hasEvidence=enoughOverall&&Number(history?.sample_size)>=4&&Number.isFinite(Number(history?.completion_rate));
  const difference=hasEvidence&&Number.isFinite(overall)?Number(history.completion_rate)-overall:null;
  return {...window,period,observed_completion_rate:hasEvidence?Number(history.completion_rate):null,observations:hasEvidence?Number(history.sample_size):0,history_signal:difference===null?"insufficient":difference>=15?"above_average":difference<=-15?"below_average":"similar",recommendation:window.minutes>=90?(difference!==null&&difference>=15?"Подходящее окно для сложной задачи: здесь чаще отмечалось завершение блоков":"Кандидат на глубокую работу — длинное непрерывное окно"):window.minutes>=30?"Подходит для одной задачи средней длительности":"Лучше оставить для коротких задач и организационных дел"};
 })}));
}
