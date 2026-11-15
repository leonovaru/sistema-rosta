import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyBlockPlans } from "../functions/_lib/daily-block-plans.js";

test("places work blocks only in free calendar windows",()=>{
 const [day]=buildDailyBlockPlans([{date:"2026-11-16",gross_capacity_minutes:480,available_minutes:420,planned_task_minutes:120,tasks:[{id:"a",title:"Анализ",minutes:120}]}],{startTime:"09:00",focusMinutes:50,breakMinutes:10,calendarEvents:[{event_type:"meeting",status:"planned",start_at:"2026-11-16T10:00",end_at:"2026-11-16T11:00"}]});
 assert.equal(day.calendar_conflicts,0);
 assert.equal(day.blocks[0].start_time,"09:00");
 assert.equal(day.blocks[0].end_time,"09:50");
 assert.ok(day.blocks.every(block=>block.end_time<="10:00"||block.start_time>="11:00"));
});
test("keeps sleep and work events out of busy windows",()=>{
 const [day]=buildDailyBlockPlans([{date:"2026-11-16",gross_capacity_minutes:180,available_minutes:180,tasks:[{title:"Работа",minutes:60}]}],{startTime:"09:00",calendarEvents:[{event_type:"sleep",start_at:"2026-11-16T09:00",end_at:"2026-11-16T10:00"},{event_type:"work",start_at:"2026-11-16T10:00",end_at:"2026-11-16T11:00"}]});
 assert.equal(day.blocks[0].start_time,"09:00");
});
test("reports tasks that do not fit into calendar gaps",()=>{
 const [day]=buildDailyBlockPlans([{date:"2026-11-16",gross_capacity_minutes:120,available_minutes:60,tasks:[{title:"Задача",minutes:90}]}],{startTime:"09:00",calendarEvents:[{event_type:"meeting",start_at:"2026-11-16T09:30",end_at:"2026-11-16T10:30"}]});
 assert.ok(day.unallocated.length>0);
 assert.equal(day.calendar_conflicts,0);
});
