import test from "node:test";
import assert from "node:assert/strict";
import { applySavedDailyTaskAllocations } from "../functions/_lib/daily-task-assignments.js";

test("saved allocations replace automatic day splits without changing task totals",()=>{
 const week={days:[
  {date:"2026-11-16",working_day:true,available_minutes:120,planned_task_minutes:60,tasks:[{id:"a",title:"Задача",minutes:60}]},
  {date:"2026-11-17",working_day:true,available_minutes:120,planned_task_minutes:60,tasks:[{id:"a",title:"Задача",minutes:60}]}
 ]};
 applySavedDailyTaskAllocations(week,[
  {task_id:"a",allocation_date:"2026-11-16",minutes:30},
  {task_id:"a",allocation_date:"2026-11-17",minutes:90}
 ]);
 assert.deepEqual(week.days.map(day=>day.tasks[0].minutes),[30,90]);
 assert.deepEqual(week.days.map(day=>day.planned_task_minutes),[30,90]);
 assert.equal(week.daily_assignments_applied,1);
});
test("ignores assignments outside the visible week and preserves unrelated tasks",()=>{
 const week={days:[{date:"2026-11-16",working_day:true,available_minutes:60,planned_task_minutes:90,tasks:[{id:"a",title:"A",minutes:60},{id:"b",title:"B",minutes:30}]}]};
 applySavedDailyTaskAllocations(week,[
  {task_id:"a",allocation_date:"2026-11-17",minutes:60},
  {task_id:"a",allocation_date:"2026-11-16",minutes:45}
 ]);
 assert.deepEqual(week.days[0].tasks.map(task=>task.id),["b","a"]);
 assert.equal(week.days[0].tasks[1].minutes,45);
 assert.equal(week.days[0].planned_task_minutes,75);
});
