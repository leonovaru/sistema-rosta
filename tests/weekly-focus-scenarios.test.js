import test from "node:test";
import assert from "node:assert/strict";
import { buildWeeklyFocusScenarios } from "../functions/_lib/weekly-focus-scenarios.js";
const areas=[
 {title:"Автоматизация",type:"income",weekly_estimated_minutes:180,target_minutes:240,target_gap_minutes:60},
 {title:"Дом",type:"personal",weekly_estimated_minutes:60,target_minutes:180,target_gap_minutes:120},
 {title:"Решай360",type:"project",weekly_estimated_minutes:120,target_minutes:null,target_gap_minutes:null}
];
const days=[{available_minutes:240},{available_minutes:180}];
test("provides three distinct focus scenarios without changing total capacity or task load",()=>{
 const result=buildWeeklyFocusScenarios(areas,days);
 assert.deepEqual(result.map(x=>x.id),["balanced","income","life"]);
 for(const scenario of result){assert.equal(scenario.available_minutes,420);assert.equal(scenario.estimated_task_minutes,360);assert.equal(scenario.remaining_capacity_minutes,60);}
});
test("income focus ranks income directions first",()=>{
 const result=buildWeeklyFocusScenarios(areas,days);
 assert.equal(result.find(x=>x.id==="income").focus[0].title,"Автоматизация");
});
test("life-balance focus prioritizes personal areas with the largest target gap",()=>{
 const result=buildWeeklyFocusScenarios(areas,days);
 assert.equal(result.find(x=>x.id==="life").focus[0].title,"Дом");
});
test("reports overload instead of inventing additional capacity",()=>{
 const result=buildWeeklyFocusScenarios(areas,[{available_minutes:100}]);
 assert.equal(result[0].over_capacity_minutes,260);
 assert.equal(result[0].remaining_capacity_minutes,-260);
});
test("does not create focus for empty unconfigured areas",()=>{
 const result=buildWeeklyFocusScenarios([{title:"Коты",type:"personal",weekly_estimated_minutes:0,target_minutes:null,target_gap_minutes:null}],[]);
 assert.equal(result.every(x=>x.focus.length===0),true);
});
