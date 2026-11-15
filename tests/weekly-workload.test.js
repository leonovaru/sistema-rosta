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

test("summarizes task load by personal areas, income directions and unassigned work",()=>{
 const result=buildWeeklyWorkload({...base,tasks:[
  {id:"a",status:"todo",life_area_id:"home",life_area_title:"Дом",estimated_minutes:120},
  {id:"b",status:"doing",life_area_id:"cats",life_area_title:"Коты",estimated_minutes:90,actual_minutes:30},
  {id:"c",status:"todo",direction_id:"d1",direction_title:"Автоматизация",estimated_minutes:180},
  {id:"d",status:"todo",project_id:"p1",project_title:"Личный проект",estimated_minutes:60},
  {id:"e",status:"todo",estimated_minutes:null}
 ]});
 const areas=Object.fromEntries(result.area_balance.map(x=>[x.title,x]));
 assert.equal(areas.Дом.estimated_minutes,120);
 assert.equal(areas.Коты.estimated_minutes,60);
 assert.equal(areas.Автоматизация.type,"income");
 assert.equal(areas["Личный проект"].type,"project");
 assert.equal(areas["Не распределено"].unestimated_count,1);
});
test("summarizes calendar commitments by event type and duration",()=>{
 const result=buildWeeklyWorkload({...base,tasks:[],calendarEvents:[
  {event_type:"meeting",start_at:"2026-11-16T10:00",end_at:"2026-11-16T11:30"},
  {event_type:"hobby",start_at:"2026-11-17T18:00",end_at:"2026-11-17T20:00"},
  {event_type:"sleep",start_at:"2026-11-17T23:00",end_at:"2026-11-18T07:00"}
 ]});
 const events=Object.fromEntries(result.calendar_balance.map(x=>[x.type,x]));
 assert.equal(events.meeting.minutes,90);
 assert.equal(events.hobby.minutes,120);
 assert.equal(events.sleep.minutes,480);
});

test("compares weekly planned task time with explicitly configured personal and income targets",()=>{
 const result=buildWeeklyWorkload({...base,targets:[
  {life_area_id:"home",title:"Дом",target_minutes:180},
  {direction_id:"d1",title:"Автоматизация",target_minutes:120},
  {life_area_id:"cats",title:"Коты",target_minutes:0}
 ],tasks:[
  {id:"a",status:"todo",due_date:"2026-11-16",life_area_id:"home",life_area_title:"Дом",estimated_minutes:240},
  {id:"b",status:"todo",due_date:"2026-11-17",direction_id:"d1",direction_title:"Автоматизация",estimated_minutes:60}
 ]});
 const rows=Object.fromEntries(result.area_balance.map(x=>[x.title,x]));
 assert.equal(rows.Дом.weekly_estimated_minutes,240);
 assert.equal(rows.Дом.target_gap_minutes,-60);
 assert.equal(rows.Дом.target_status,"above");
 assert.equal(rows.Автоматизация.target_status,"below");
 assert.equal(rows.Коты.target_status,"on_target");
});
test("does not invent targets for areas without a saved target",()=>{
 const result=buildWeeklyWorkload({...base,tasks:[{id:"a",status:"todo",due_date:"2026-11-16",life_area_id:"home",life_area_title:"Дом",estimated_minutes:30}]});
 assert.equal(result.area_balance[0].target_minutes,null);
 assert.equal(result.area_balance[0].target_status,"not_set");
});

test("uses an explicitly targeted project as its own bucket instead of double-counting its direction",()=>{
 const result=buildWeeklyWorkload({...base,targets:[{project_id:"p1",title:"Решай360",target_minutes:240}],tasks:[
  {id:"a",status:"todo",due_date:"2026-11-16",project_id:"p1",project_title:"Решай360",direction_id:"d1",direction_title:"Репетиторство",estimated_minutes:120},
  {id:"b",status:"todo",due_date:"2026-11-16",direction_id:"d1",direction_title:"Репетиторство",estimated_minutes:60}
 ]});
 const rows=Object.fromEntries(result.area_balance.map(x=>[x.title,x]));
 assert.equal(rows.Решай360.weekly_estimated_minutes,120);
 assert.equal(rows.Репетиторство.weekly_estimated_minutes,60);
 assert.equal(rows.Решай360.target_status,"below");
});
