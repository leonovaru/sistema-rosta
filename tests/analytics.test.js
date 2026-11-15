import test from "node:test";
import assert from "node:assert/strict";
import { buildTaskAnalytics, buildTimeAnalytics } from "../functions/_lib/analytics.js";
const rows=[
{id:"1",status:"done",estimated_minutes:60,actual_minutes:90,completed_at:"2026-11-01",direction_id:"d1",direction_title:"Аудит",project_id:"p1",project_title:"Клиент А",life_area_id:null},
{id:"2",status:"todo",estimated_minutes:30,actual_minutes:0,created_at:"2026-11-02",direction_id:"d1",direction_title:"Аудит",project_id:"p1",project_title:"Клиент А",life_area_id:"home",life_area_title:"Дом"},
{id:"3",status:"done",estimated_minutes:40,actual_minutes:20,completed_at:"2026-10-30",direction_id:null,project_id:null,life_area_id:"home",life_area_title:"Дом"}
];
test("task analytics calculates overall completion, time variance and overruns",()=>{
 const a=buildTaskAnalytics(rows);assert.equal(a.summary.tasks,3);assert.equal(a.summary.completed,2);assert.equal(a.summary.estimated_minutes,130);assert.equal(a.summary.actual_minutes,110);assert.equal(a.summary.variance_minutes,-20);assert.equal(a.summary.overrun_tasks,1);
});
test("task analytics groups work by income stream, project, personal area and month",()=>{
 const a=buildTaskAnalytics(rows);assert.equal(a.by_direction[0].title,"Аудит");assert.equal(a.by_direction[0].tasks,2);assert.equal(a.by_project[0].title,"Клиент А");assert.equal(a.by_life_area.find(x=>x.title==="Дом").tasks,2);assert.deepEqual(a.by_month.map(x=>x.id),["2026-10","2026-11"]);
});
test("time analytics sums tracked sessions and calendar time by event type",()=>{
 const a=buildTimeAnalytics([{tracked_minutes:125}], [{event_type:"work",events:2,planned_minutes:120,actual_minutes:150},{event_type:"sleep",events:1,planned_minutes:480,actual_minutes:0}]);assert.equal(a.tracked_minutes,125);assert.equal(a.calendar_by_type[0].event_type,"work");assert.equal(a.calendar_by_type[0].actual_minutes,150);
});
