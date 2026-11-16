export function buildDailyExecutionInsights(logs=[]){
 const rows=(logs||[]).filter(row=>["done","skipped","interrupted"].includes(row.status)&&Number(row.planned_minutes)>0);
 const done=rows.filter(row=>row.status==="done"),interrupted=rows.filter(row=>row.status==="interrupted"),skipped=rows.filter(row=>row.status==="skipped");
 const ratios=done.map(row=>Math.max(0,Number(row.actual_minutes)||0)/Number(row.planned_minutes)).sort((a,b)=>a-b);
 const median=ratios.length?(ratios.length%2?ratios[(ratios.length-1)/2]:(ratios[ratios.length/2-1]+ratios[ratios.length/2])/2):null;
 const rate=(items)=>rows.length?Math.round(items.length/rows.length*100):0;
 const insights=[];
 if(done.length>=3&&median>1.2)insights.push({type:"estimate",title:"Рабочие блоки часто требуют больше времени",detail:"Медианное фактическое время завершённых блоков выше планового на "+Math.round((median-1)*100)+"%.",recommendation:"Для новых задач попробуйте увеличить оценку на 15–20% и сравните результат через неделю."});
 if(rows.length>=4&&skipped.length/rows.length>=0.25)insights.push({type:"skips",title:"Часть запланированных блоков регулярно пропускается",detail:"Пропущено "+rate(skipped)+"% отмеченных блоков.",recommendation:"Проверьте, не слишком ли много задач стоит в начале дня; оставляйте один резервный блок."});
 if(rows.length>=4&&interrupted.length/rows.length>=0.25)insights.push({type:"interruptions",title:"Есть повторяющиеся прерывания",detail:"Прервано "+rate(interrupted)+"% отмеченных блоков.",recommendation:"Попробуйте выделить для таких задач более защищённые интервалы без встреч и уведомлений."});
 if(rows.length>=5&&median!==null&&median<0.75)insights.push({type:"underestimate",title:"Некоторые блоки заканчиваются заметно раньше",detail:"Медианное фактическое время завершённых блоков составляет "+Math.round(median*100)+"% от плана.",recommendation:"Не сокращайте все оценки сразу: проверьте отдельно типы задач и повторите наблюдение."});
 return {sample_size:rows.length,completed:done.length,skipped:skipped.length,interrupted:interrupted.length,median_actual_to_planned:median,insights};
}
