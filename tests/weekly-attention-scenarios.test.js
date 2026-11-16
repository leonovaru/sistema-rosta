import test from "node:test";
import assert from "node:assert/strict";
import { buildWeeklyAttentionScenarios } from "../functions/_lib/weekly-attention-scenarios.js";

const days=[{date:"2026-11-16",available_minutes:240,planned_task_minutes:180,overloaded:false,tasks:[
 {id:"a",title:"Стратегия",minutes:90,cognitive_load:"high",cognitive_load_label:"Высокая концентрация",priority_score:80,priority_label:"Высокий"},
 {id:"b",title:"Позвонить",minutes:20,cognitive_load:"low",cognitive_load_label:"Низкая концентрация",priority_score:60,priority_label:"Средний"},
 {id:"c",title:"Подготовить отчёт",minutes:70,cognitive_load:"high",cognitive_load_label:"Высокая концентрация",priority_score:75,priority_label:"Средний"}
]}];
test("builds three distinct attention-aware ordering scenarios",()=>{
 const scenarios=buildWeeklyAttentionScenarios(days);
 assert.deepEqual(scenarios.map(x=>x.id),["focus_first","alternating","routine_batches"]);
 assert.equal(scenarios[0].days[0].tasks[0].id,"a");
 assert.equal(scenarios[2].days[0].tasks[0].id,"b");
 assert.equal(scenarios[1].days[0].tasks.length,3);
});
test("preserves daily capacity, task durations and source schedule",()=>{
 const before=JSON.stringify(days);
 const scenarios=buildWeeklyAttentionScenarios(days);
 for(const scenario of scenarios){
  assert.equal(scenario.days[0].planned_task_minutes,180);
  assert.equal(scenario.days[0].available_minutes,240);
  assert.equal(scenario.days[0].tasks.reduce((sum,t)=>sum+t.minutes,0),180);
 }
 assert.equal(JSON.stringify(days),before);
});
test("keeps overload warnings and returns no empty days",()=>{
 const result=buildWeeklyAttentionScenarios([{date:"2026-11-16",available_minutes:30,planned_task_minutes:60,overloaded:true,tasks:[{id:"a",title:"Task",minutes:60} ]},{date:"2026-11-17",tasks:[]}]);
 assert.equal(result[0].days.length,1);
 assert.equal(result[0].days[0].overloaded,true);
});
