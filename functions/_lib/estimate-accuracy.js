function median(values){const sorted=[...values].sort((a,b)=>a-b);if(!sorted.length)return null;const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;}
function groupKey(task){if(task.project_id)return "project:"+task.project_id;if(task.life_area_id)return "life:"+task.life_area_id;if(task.direction_id)return "direction:"+task.direction_id;return "unassigned";}
export function buildEstimateAccuracy(tasks=[],{minimumSamples=3,maximumRatio=4}={}){
 const groups=new Map(),all=[];
 for(const task of tasks||[]){
  const estimate=Number(task.estimated_minutes),actual=Number(task.actual_minutes);
  if(task.status!=="done"||!Number.isFinite(estimate)||estimate<5||!Number.isFinite(actual)||actual<1)continue;
  const ratio=Math.min(maximumRatio,Math.max(0.25,actual/estimate));
  const item={ratio,error_percent:Math.abs(actual-estimate)/estimate*100,estimated_minutes:estimate,actual_minutes:actual};
  all.push(item);const key=groupKey(task);const row=groups.get(key)||{key,title:task.project_title||task.life_area_title||task.direction_title||"Без категории",type:key.split(":")[0],items:[]};row.items.push(item);groups.set(key,row);
 }
 const summarize=(items)=>{const ratios=items.map(x=>x.ratio),errors=items.map(x=>x.error_percent);const factor=median(ratios);return {sample_count:items.length,median_actual_to_estimated_ratio:factor===null?null:Number(factor.toFixed(2)),median_error_percent:errors.length?Number(median(errors).toFixed(1)):null,recommended_estimate_multiplier:items.length>=minimumSamples&&factor!==null?Number(factor.toFixed(2)):null,confidence:items.length>=8?"higher":items.length>=minimumSamples?"preliminary":"insufficient"};};
 return {period_days:90,minimum_samples:minimumSamples,overall:summarize(all),by_area:[...groups.values()].map(row=>({...row,...summarize(row.items)})).map(({items,...row})=>row).sort((a,b)=>b.sample_count-a.sample_count),note:"Расчёт только по завершённым задачам с оценкой и записанным фактом. Множитель — подсказка для будущих оценок, он не меняет задачи автоматически."};
}
