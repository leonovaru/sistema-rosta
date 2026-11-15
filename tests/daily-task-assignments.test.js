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
 ],[{id:"a",title:"Задача",status:"todo",estimated_minutes:120,actual_minutes:0,due_date:"2026-11-18"}]);
 assert.deepEqual(week.days.map(day=>day.tasks[0].minutes),[30,90]);
 assert.deepEqual(week.days.map(day=>day.planned_task_minutes),[30,90]);
 assert.equal(week.daily_assignments_applied,1);
 assert.equal(week.daily_assignment_issues.length,0);
 assert.equal(week.daily_assignment_comparison[0].moved_minutes,30);
});
test("ignores assignments outside the visible week and preserves unrelated tasks",()=>{
 const week={days:[{date:"2026-11-16",working_day:true,available_minutes:60,planned_task_minutes:90,tasks:[{id:"a",title:"A",minutes:60},{id:"b",title:"B",minutes:30}]}]};
 applySavedDailyTaskAllocations(week,[
  {task_id:"a",allocation_date:"2026-11-17",minutes:60},
  {task_id:"a",allocation_date:"2026-11-16",minutes:45}
 ],[{id:"a",title:"A",status:"todo",estimated_minutes:45,actual_minutes:0,due_date:"2026-11-20"}]);
 assert.deepEqual(week.days[0].tasks.map(task=>task.id),["b","a"]);
 assert.equal(week.days[0].tasks[1].minutes,45);
 assert.equal(week.days[0].planned_task_minutes,75);
});
test("does not apply a saved schedule when the task estimate or actual progress changed",()=>{
 const week={days:[{date:"2026-11-16",working_day:true,available_minutes:120,planned_task_minutes:60,tasks:[{id:"a",title:"A",minutes:60}]}]};
 applySavedDailyTaskAllocations(week,[{task_id:"a",allocation_date:"2026-11-16",minutes:60}],
 [{id:"a",title:"A",status:"doing",estimated_minutes:90,actual_minutes:45,due_date:"2026-11-18"}]);
 assert.equal(week.daily_assignments_applied,0);
 assert.equal(week.days[0].tasks[0].minutes,60);
 assert.equal(week.daily_assignment_issues[0].type,"stale");
 assert.match(week.daily_assignment_issues[0].reason,/актуальный остаток/);
});
test("does not apply saved assignments after the deadline or on a non-working day",()=>{
 const week={days:[{date:"2026-11-16",working_day:true,available_minutes:30,planned_task_minutes:0,tasks:[]}]};
 applySavedDailyTaskAllocations(week,[{task_id:"a",allocation_date:"2026-11-16",minutes:60}],
 [{id:"a",title:"A",status:"todo",estimated_minutes:60,actual_minutes:0,due_date:"2026-11-15"}]);
 assert.equal(week.daily_assignments_applied,0);
 assert.equal(week.daily_assignment_issues[0].type,"stale");
});
test("keeps valid saved assignments visible but warns when calendar capacity no longer fits",()=>{
 const week={days:[{date:"2026-11-16",working_day:true,available_minutes:30,planned_task_minutes:60,tasks:[{id:"a",title:"A",minutes:60}]}]};
 applySavedDailyTaskAllocations(week,[{task_id:"a",allocation_date:"2026-11-16",minutes:60}],
 [{id:"a",title:"A",status:"todo",estimated_minutes:60,actual_minutes:0,due_date:"2026-11-16"}]);
 assert.equal(week.daily_assignments_applied,1);
 assert.equal(week.days[0].tasks[0].minutes,60);
 assert.equal(week.daily_assignment_issues[0].type,"capacity");
 assert.equal(week.days[0].overloaded,true);
});

test("ignores historical allocations for completed tasks without reporting stale schedule issues",()=>{
 const week={days:[{date:"2026-11-16",working_day:true,available_minutes:120,planned_task_minutes:0,tasks:[]}]};
 applySavedDailyTaskAllocations(week,[{task_id:"done-task",allocation_date:"2026-11-16",minutes:60}],
 [{id:"done-task",title:"Готово",status:"done",estimated_minutes:60,actual_minutes:60,due_date:"2026-11-16"}]);
 assert.equal(week.daily_assignments_applied,0);
 assert.deepEqual(week.daily_assignment_issues,[]);
 assert.deepEqual(week.days[0].tasks,[]);
});

test("uses recorded actual time for todo tasks after they are reopened",()=>{
 const week={days:[{date:"2026-11-16",working_day:true,available_minutes:120,planned_task_minutes:60,tasks:[{id:"a",title:"A",minutes:60}]}]};
 applySavedDailyTaskAllocations(week,[{task_id:"a",allocation_date:"2026-11-16",minutes:75}],
 [{id:"a",title:"A",status:"todo",estimated_minutes:120,actual_minutes:45,due_date:"2026-11-16"}]);
 assert.equal(week.daily_assignments_applied,1);
 assert.equal(week.days[0].tasks[0].minutes,75);
 assert.deepEqual(week.daily_assignment_issues,[]);
});
