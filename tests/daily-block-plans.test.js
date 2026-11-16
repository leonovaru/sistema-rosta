import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyBlockPlans, buildDailyBlockScenarios } from "../functions/_lib/daily-block-plans.js";

test("splits long tasks into focus blocks with recovery breaks",()=>{
 const [day]=buildDailyBlockPlans([{date:"2026-11-16",available_minutes:130,planned_task_minutes:110,tasks:[{id:"a",title:"Анализ",minutes:90,cognitive_load:"high"},{id:"b",title:"Ответить",minutes:20}]}]);
 assert.deepEqual(day.blocks.map(block=>[block.type,block.minutes]),[["focus",50],["break",10],["focus",40],["focus",10],["break",10],["focus",10]]);
 assert.equal(day.focus_minutes,110);
 assert.equal(day.break_minutes,20);
});
test("does not exceed available time and reports unallocated task minutes",()=>{
 const [day]=buildDailyBlockPlans([{date:"2026-11-16",available_minutes:60,planned_task_minutes:90,tasks:[{id:"a",title:"Задача",minutes:90}]}]);
 assert.equal(day.focus_minutes+day.break_minutes,60);
 assert.equal(day.unallocated.reduce((sum,row)=>sum+row.minutes,0),40);
 assert.equal(day.overloaded,true);
});
test("does not mutate source days and skips empty days",()=>{
 const days=[{date:"2026-11-16",available_minutes:90,planned_task_minutes:30,tasks:[{id:"a",title:"Задача",minutes:30}]},{date:"2026-11-17",available_minutes:60,tasks:[]}];
 const before=JSON.stringify(days);
 assert.equal(buildDailyBlockPlans(days).length,1);
 assert.equal(JSON.stringify(days),before);
});
test("allows custom focus and break durations within safe bounds",()=>{
 const [day]=buildDailyBlockPlans([{date:"x",available_minutes:80,planned_task_minutes:70,tasks:[{title:"Task",minutes:70}]}],{focusMinutes:35,breakMinutes:5});
 assert.equal(day.focus_minutes,70);
 assert.equal(day.break_minutes,5);
});

test("uses user-selected focus and break durations",()=>{
 const [day]=buildDailyBlockPlans([{date:"2026-11-16",available_minutes:90,planned_task_minutes:70,tasks:[{id:"a",title:"Работа",minutes:70}]}],{focusMinutes:35,breakMinutes:5});
 assert.deepEqual(day.blocks.map(block=>[block.type,block.minutes]),[["focus",35],["break",5],["focus",35]]);
 assert.equal(day.focus_minutes,70);
 assert.equal(day.break_minutes,5);
});

test("keeps empty working days available as future task-move candidates in scenarios",()=>{
 const scenarios=buildDailyBlockScenarios([
  {date:"2026-11-16",working_day:true,available_minutes:60,gross_capacity_minutes:60,planned_task_minutes:90,tasks:[{id:"a",title:"Большая задача",minutes:90}]},
  {date:"2026-11-17",working_day:true,available_minutes:120,gross_capacity_minutes:120,planned_task_minutes:0,tasks:[]}
 ]);
 assert.equal(scenarios.length,3);
 for(const scenario of scenarios){
  const target=scenario.plans.find(plan=>plan.date==="2026-11-17");
  assert.ok(target);
  assert.equal(target.blocks.length,0);
  assert.equal(target.free_windows[0].minutes,120);
 }
});
