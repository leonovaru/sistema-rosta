import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyAssignmentRepairs } from "../functions/_lib/daily-assignment-repairs.js";

function baseWeek(){
 return {daily_assignment_issues:[{task_id:"a",type:"stale"}],days:[
  {date:"2026-11-16",working_day:true,available_minutes:60,tasks:[]},
  {date:"2026-11-17",working_day:true,available_minutes:60,tasks:[]},
  {date:"2026-11-18",working_day:true,available_minutes:60,tasks:[]}
 ]};
}
const task={id:"a",title:"Подготовить отчёт",status:"doing",estimated_minutes:100,actual_minutes:20,due_date:"2026-11-18"};
test("repairs changed remaining estimate while preserving preferred dates",()=>{
 const result=buildDailyAssignmentRepairs(baseWeek(),[
  {task_id:"a",allocation_date:"2026-11-16",minutes:40},
  {task_id:"a",allocation_date:"2026-11-17",minutes:40}
 ],[task]);
 assert.deepEqual(result.schedules[0].allocations,[{date:"2026-11-16",minutes:40},{date:"2026-11-17",minutes:40}]);
 assert.equal(result.proposals[0].old_minutes,80);
 assert.equal(result.proposals[0].new_minutes,80);
 assert.equal(result.requires_confirmation,true);
});
test("adds missing minutes after a task estimate increases",()=>{
 const result=buildDailyAssignmentRepairs(baseWeek(),[{task_id:"a",allocation_date:"2026-11-16",minutes:40}],[{...task,estimated_minutes:120,actual_minutes:20}]);
 assert.deepEqual(result.schedules[0].allocations,[{date:"2026-11-16",minutes:40},{date:"2026-11-17",minutes:60}]);
});
test("reduces saved minutes when the remaining estimate decreases",()=>{
 const result=buildDailyAssignmentRepairs(baseWeek(),[
  {task_id:"a",allocation_date:"2026-11-16",minutes:50},
  {task_id:"a",allocation_date:"2026-11-17",minutes:50}
 ],[{...task,estimated_minutes:70,actual_minutes:20}]);
 assert.deepEqual(result.schedules[0].allocations,[{date:"2026-11-16",minutes:50},{date:"2026-11-17",minutes:0}].filter(row=>row.minutes>0));
});
test("respects deadline and working-day capacity and reports an impossible repair",()=>{
 const week=baseWeek();week.days[1].working_day=false;week.days[2].available_minutes=10;
 const result=buildDailyAssignmentRepairs(week,[{task_id:"a",allocation_date:"2026-11-16",minutes:40}],[{...task,estimated_minutes:140,actual_minutes:20}]);
 assert.equal(result.schedules.length,0);
 assert.equal(result.unresolved[0].minutes,50);
});
test("does not displace other tasks and leaves input untouched",()=>{
 const week=baseWeek();week.days[0].tasks=[{id:"b",minutes:40}];
 const snapshot=JSON.stringify(week);
 const result=buildDailyAssignmentRepairs(week,[{task_id:"a",allocation_date:"2026-11-16",minutes:40}],[task]);
 assert.deepEqual(result.schedules[0].allocations,[{date:"2026-11-16",minutes:20},{date:"2026-11-17",minutes:60}]);
 assert.equal(JSON.stringify(week),snapshot);
});
