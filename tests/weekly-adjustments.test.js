import test from "node:test";
import assert from "node:assert/strict";
import { buildWeeklyAdjustmentProposals } from "../functions/_lib/weekly-adjustments.js";
const days=[
 {date:"2026-11-16",working_day:true,available_minutes:60,planned_task_minutes:120,tasks:[{id:"a",title:"Подготовить материалы",minutes:120,due_date:"2026-11-18"}]},
 {date:"2026-11-17",working_day:true,available_minutes:120,planned_task_minutes:0,tasks:[]},
 {date:"2026-11-18",working_day:true,available_minutes:90,planned_task_minutes:0,tasks:[]}
];
test("proposes moving a non-high-priority task block into spare capacity before its deadline",()=>{
 const result=buildWeeklyAdjustmentProposals(days,[{id:"a",title:"Подготовить материалы",priority:"low",due_date:"2026-11-18"}]);
 assert.equal(result.moves.length,1);
 assert.deepEqual({from:result.moves[0].from,to:result.moves[0].to,minutes:result.moves[0].minutes},{from:"2026-11-16",to:"2026-11-17",minutes:60});
 assert.equal(result.projected_days[0].planned_task_minutes,60);
 assert.equal(result.projected_days[1].planned_task_minutes,60);
 assert.equal(result.unresolved_overload_minutes,0);
});
test("does not propose moving high-priority tasks or tasks beyond their deadline",()=>{
 const result=buildWeeklyAdjustmentProposals(days,[
  {id:"a",title:"Срочная задача",priority:"high",due_date:"2026-11-18"}
 ]);
 assert.equal(result.moves.length,0);
 assert.equal(result.unresolved_overload_minutes,60);
});
test("does not mutate original day allocations",()=>{
 const before=days[0].planned_task_minutes;
 buildWeeklyAdjustmentProposals(days,[{id:"a",priority:"low",due_date:"2026-11-18"}]);
 assert.equal(days[0].planned_task_minutes,before);
 assert.equal(days[0].tasks[0].minutes,120);
});
