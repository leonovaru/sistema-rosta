import test from "node:test";
import assert from "node:assert/strict";
import { buildCalibratedWeeklyLoad } from "../functions/_lib/calibrated-weekly-load.js";

const week={days:[
 {date:"2026-11-16",working_day:true,available_minutes:60,planned_task_minutes:50,tasks:[
  {id:"a",title:"Аудит",minutes:30,direction_id:"d1"},
  {id:"b",title:"Дом",minutes:20,life_area_id:"home"}
 ]},
 {date:"2026-11-17",working_day:true,available_minutes:90,planned_task_minutes:30,tasks:[
  {id:"c",title:"Новая задача",minutes:30,direction_id:"d2"}
 ]}
]};
const accuracy={
 minimum_samples:3,
 overall:{sample_count:8,recommended_estimate_multiplier:1.2},
 by_area:[
  {key:"direction:d1",sample_count:4,recommended_estimate_multiplier:1.5},
  {key:"life:home",sample_count:2,recommended_estimate_multiplier:null}
 ]
};

test("calibrates workload with category history and falls back to overall",()=>{
 const result=buildCalibratedWeeklyLoad(week,accuracy);
 assert.equal(result.days[0].calibrated_tasks[0].calibrated_minutes,45);
 assert.equal(result.days[0].calibrated_tasks[1].calibrated_minutes,24);
 assert.equal(result.days[1].calibrated_tasks[0].calibrated_minutes,36);
 assert.equal(result.summary.calibrated_task_minutes,105);
 assert.equal(result.summary.adjusted_task_allocations,3);
});
test("flags a day overloaded only in the calibrated scenario",()=>{
 const result=buildCalibratedWeeklyLoad(week,accuracy);
 assert.equal(result.days[0].planned_task_minutes,50);
 assert.equal(result.days[0].calibrated_overloaded,true);
 assert.equal(result.days[0].calibrated_task_minutes,69);
 assert.equal(result.summary.overloaded_days,1);
});
test("keeps original plan when there is insufficient history",()=>{
 const result=buildCalibratedWeeklyLoad(week,{minimum_samples:3,overall:{sample_count:2,recommended_estimate_multiplier:null},by_area:[]});
 assert.equal(result.summary.calibrated_task_minutes,80);
 assert.equal(result.summary.adjusted_task_allocations,0);
 assert.equal(result.days[0].calibrated_overloaded,false);
});
test("does not mutate original week allocations",()=>{
 buildCalibratedWeeklyLoad(week,accuracy);
 assert.equal(week.days[0].tasks[0].minutes,30);
 assert.equal(week.days[0].planned_task_minutes,50);
});
