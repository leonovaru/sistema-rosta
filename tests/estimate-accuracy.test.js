import test from "node:test";
import assert from "node:assert/strict";
import { buildEstimateAccuracy } from "../functions/_lib/estimate-accuracy.js";
test("calculates robust estimate multiplier from completed tasks",()=>{
 const tasks=[{status:"done",estimated_minutes:60,actual_minutes:90,direction_id:"d1",direction_title:"Автоматизация"},{status:"done",estimated_minutes:60,actual_minutes:120,direction_id:"d1"},{status:"done",estimated_minutes:30,actual_minutes:45,direction_id:"d1"}];
 const result=buildEstimateAccuracy(tasks);
 assert.equal(result.overall.sample_count,3);assert.equal(result.overall.recommended_estimate_multiplier,1.5);assert.equal(result.by_area[0].recommended_estimate_multiplier,1.5);
});
test("does not recommend a multiplier with fewer than three samples",()=>{
 const result=buildEstimateAccuracy([{status:"done",estimated_minutes:60,actual_minutes:90,direction_id:"d1"}]);
 assert.equal(result.overall.recommended_estimate_multiplier,null);assert.equal(result.overall.confidence,"insufficient");
});
test("ignores open tasks, missing estimates, and invalid actual time",()=>{
 const result=buildEstimateAccuracy([{status:"todo",estimated_minutes:60,actual_minutes:90},{status:"done",estimated_minutes:null,actual_minutes:90},{status:"done",estimated_minutes:60,actual_minutes:0}]);
 assert.equal(result.overall.sample_count,0);assert.equal(result.overall.median_error_percent,null);
});
test("uses median so one extreme task does not dominate the recommendation",()=>{
 const result=buildEstimateAccuracy([1,1.2,1.3,4].map(ratio=>({status:"done",estimated_minutes:60,actual_minutes:60*ratio,direction_id:"d"})));
 assert.equal(result.overall.recommended_estimate_multiplier,1.25);
});
