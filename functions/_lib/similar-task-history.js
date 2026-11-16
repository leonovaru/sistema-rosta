const STOP_WORDS = new Set(["задача","сделать","нужно","надо","для","это","как","что","чтобы","по","на","в","во","и","или","с","со","из","к","от","до","при","про","мой","моя","мои","the","and","for","with","to"]);
function tokens(value=""){
 return String(value).toLowerCase().replace(/ё/g,"е").replace(/[^a-zа-я0-9]+/gi," ").split(/\s+/).filter(word=>word.length>2&&!STOP_WORDS.has(word));
}
function similarity(left,right){
 const a=new Set(tokens(left)),b=new Set(tokens(right));if(!a.size||!b.size)return 0;
 let common=0;for(const word of a)if(b.has(word))common++;
 return common/(a.size+b.size-common);
}
function median(values){const sorted=[...values].sort((a,b)=>a-b);if(!sorted.length)return null;const i=Math.floor(sorted.length/2);return sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2;}
export function findSimilarTaskHistory({title="",description="",history=[],scope={}}={}){
 const candidate=(title+" "+description).trim();
 const matches=(history||[]).filter(row=>{
  if(row.status!=="done"||Number(row.estimated_minutes)<5||Number(row.actual_minutes)<1)return false;
  if(scope.project_id&&row.project_id!==scope.project_id)return false;
  if(!scope.project_id&&scope.life_area_id&&row.life_area_id!==scope.life_area_id)return false;
  if(!scope.project_id&&!scope.life_area_id&&scope.direction_id&&row.direction_id!==scope.direction_id)return false;
  return true;
 }).map(row=>({...row,similarity:similarity(candidate,(row.title||"")+" "+(row.description||""))}))
 .filter(row=>row.similarity>=0.25).sort((a,b)=>b.similarity-a.similarity).slice(0,10);
 if(matches.length<3)return {sample_count:matches.length,minimum_samples:3,confidence:"insufficient",multiplier:null,suggested_minutes:null,examples:matches.slice(0,3).map(x=>({title:x.title,estimated_minutes:x.estimated_minutes,actual_minutes:x.actual_minutes,similarity:Number(x.similarity.toFixed(2))}))};
 const ratios=matches.map(row=>Math.min(4,Math.max(.25,Number(row.actual_minutes)/Number(row.estimated_minutes))));
 const multiplier=Number(median(ratios).toFixed(2));
 const estimate=Number(matches.reduce((sum,row)=>sum+Number(row.estimated_minutes),0)/matches.length);
 return {sample_count:matches.length,minimum_samples:3,confidence:matches.length>=6?"higher":"preliminary",multiplier,median_estimated_minutes:Math.round(estimate),suggested_minutes:null,examples:matches.slice(0,3).map(x=>({title:x.title,estimated_minutes:x.estimated_minutes,actual_minutes:x.actual_minutes,similarity:Number(x.similarity.toFixed(2))}))};
}
