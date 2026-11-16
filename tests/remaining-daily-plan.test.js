import test from "node:test";
import assert from "node:assert/strict";
import { buildRemainingDailyPlan } from "../functions/_lib/remaining-daily-plan.js";

const day={date:"2026-11-16",working_day:true,gross_capacity_minutes:480,available_minutes:420,tasks:[{id:"task-1",title:"Подготовить отчёт",minutes:180,cognitive_load:"high"}]};
test("replans only the remaining part of today from local current time",()=>{
 const plan=buildRemainingDailyPlan({days:[day],now:"2026-11-16T09:00:00.000Z",timeZone:"Europe/Moscow",startTime:"09:00"});
 assert.equal(plan.date,"2026-11-16");
 assert.equal(plan.as_of,"12:00");
 assert.ok(plan.blocks.length>0);
 assert.ok(plan.blocks.every(block=>block.start_time>="12:00"));
 assert.equal(plan.focus_minutes,180);
});
test("reserves preparation and recovery buffers around future meetings",()=>{
 const events=[{status:"confirmed",event_type:"meeting",start_at:"2026-11-16T13:00:00",end_at:"2026-11-16T14:00:00"}];
 const plan=buildRemainingDailyPlan({days:[day],calendarEvents:events,now:"2026-11-16T09:00:00.000Z",timeZone:"Europe/Moscow",startTime:"09:00",prepBeforeMinutes:15,bufferAfterMinutes:15});
 assert.ok(plan.blocks.every(block=>block.end_time<="12:45"||block.start_time>="14:15"));
 assert.equal(plan.available_minutes,210);
});
test("ignores calendar events already finished before the current time",()=>{
 const events=[{status:"confirmed",event_type:"meeting",start_at:"2026-11-16T10:00:00",end_at:"2026-11-16T11:00:00"}];
 const plan=buildRemainingDailyPlan({days:[day],calendarEvents:events,now:"2026-11-16T09:00:00.000Z",timeZone:"Europe/Moscow",startTime:"09:00",prepBeforeMinutes:20,bufferAfterMinutes:20});
 assert.equal(plan.available_minutes,300);
 assert.ok(plan.blocks.every(block=>block.start_time>="12:00"));
});
test("does not invent a plan on a non-working day or after the work window",()=>{
 assert.equal(buildRemainingDailyPlan({days:[{...day,working_day:false}],now:"2026-11-16T09:00:00.000Z",timeZone:"Europe/Moscow"}),null);
 assert.equal(buildRemainingDailyPlan({days:[day],now:"2026-11-16T15:00:00.000Z",timeZone:"Europe/Moscow",startTime:"09:00"}),null);
});
test("does not mutate weekly tasks or calendar events",()=>{
 const days=[{...day,tasks:day.tasks.map(task=>({...task}))}],events=[{status:"confirmed",event_type:"meeting",start_at:"2026-11-16T13:00:00",end_at:"2026-11-16T14:00:00"}];
 const before=JSON.stringify({days,events});
 buildRemainingDailyPlan({days,calendarEvents:events,now:"2026-11-16T09:00:00.000Z",timeZone:"Europe/Moscow",startTime:"09:00"});
 assert.equal(JSON.stringify({days,events}),before);
});
