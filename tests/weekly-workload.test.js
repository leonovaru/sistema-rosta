import test from "node:test";
import assert from "node:assert/strict";
import { buildWeeklyWorkload } from "../functions/_lib/weekly-workload.js";
const base={today:"2026-11-16",workingDays:[1,2,3,4,5],dailyCapacityMinutes:360,configured:true,calendarDays:[{date:"2026-11-16",busy_minutes:120},{date:"2026-11-17",busy_minutes:60}]};
test("calculates weekly capacity after calendar commitments",()=>{
 const result=buildWeeklyWorkload({...base,tasks:[]});
 assert.equal(result.summary.gross_capacity_minutes,1800);
 assert.equal(result.summary.calendar_busy_minutes,180);
 assert.equal(result.summary.available_minutes,1620);
 assert.equal(result.days.length,7);
 assert.equal(result.days[5].working_day,false);
});
test("distributes deadline-bound active tasks across eligible working days",()=>{
 const tasks=[{id:"a",title:"Task A",status:"todo",due_date:"2026-11-17",estimated_minutes:240},{id:"b",title:"Task B",status:"doing",due_date:"2026-11-20",estimated_minutes:300,actual_minutes:60}];
 const result=buildWeeklyWorkload({...base,tasks});
 assert.equal(result.summary.estimated_task_minutes,480);
 assert.equal(result.summary.estimated_task_count,2);
 assert.equal(result.days[0].planned_task_minutes,168);
 assert.equal(result.days[1].planned_task_minutes,168);
 assert.equal(result.days[2].planned_task_minutes,48);
});
test("keeps overdue, undated, waiting and unestimated tasks visible as separate counts",()=>{
 const tasks=[{id:"a",status:"todo",due_date:"2026-11-14",estimated_minutes:60},{id:"b",status:"todo",due_date:null,estimated_minutes:30},{id:"c",status:"waiting",due_date:"2026-11-17",estimated_minutes:90},{id:"d",status:"todo",due_date:"2026-11-18",estimated_minutes:null}];
 const result=buildWeeklyWorkload({...base,tasks});
 assert.equal(result.summary.overdue_task_count,1);
 assert.equal(result.summary.without_deadline_count,1);
 assert.equal(result.summary.waiting_task_count,1);
 assert.equal(result.summary.unestimated_task_count,1);
 assert.equal(result.summary.estimated_task_minutes,60);
});
test("reports overload without silently changing deadlines or capacity",()=>{
 const result=buildWeeklyWorkload({...base,dailyCapacityMinutes:60,tasks:[{id:"a",status:"todo",due_date:"2026-11-16",estimated_minutes:480}]});
 assert.equal(result.summary.over_capacity,true);
 assert.equal(result.summary.remaining_minutes,-300);
 assert.equal(result.days[0].overloaded,true);
 assert.equal(result.days[0].tasks[0].id,"a");
});
test("does not invent weekly capacity when schedule is not configured",()=>{
 const result=buildWeeklyWorkload({...base,configured:false,tasks:[{id:"a",status:"todo",due_date:"2026-11-17",estimated_minutes:120}]});
 assert.equal(result.summary.gross_capacity_minutes,0);
 assert.equal(result.configured,false);
 assert.equal(result.summary.estimated_task_minutes,120);
});
