import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyBlockPlans, buildDailyBlockScenarios } from "../functions/_lib/daily-block-plans.js";

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


test("reserves preparation time before meetings and recovery time after",()=>{
 const [day]=buildDailyBlockPlans([{date:"2026-11-16",gross_capacity_minutes:240,available_minutes:180,tasks:[{id:"a",title:"Подготовка отчёта",minutes:120}]}],{
  startTime:"09:00",prepBeforeMinutes:20,bufferAfterMinutes:15,
  calendarEvents:[{event_type:"meeting",status:"planned",start_at:"2026-11-16T10:00",end_at:"2026-11-16T11:00"}]
 });
 assert.equal(day.calendar_conflicts,0);
 assert.equal(day.blocks[0].start_time,"09:00");
 assert.equal(day.blocks[0].end_time,"09:40");
 assert.ok(day.blocks.some(block=>block.start_time==="11:15"));
 assert.ok(day.blocks.every(block=>block.end_time<="09:40"||block.start_time>="11:15"));
});

test("does not apply meeting buffers to sleep or work events",()=>{
 const [day]=buildDailyBlockPlans([{date:"2026-11-16",gross_capacity_minutes:180,available_minutes:180,tasks:[{title:"Задача",minutes:60}]}],{
  startTime:"09:00",prepBeforeMinutes:30,bufferAfterMinutes:30,
  calendarEvents:[{event_type:"sleep",start_at:"2026-11-16T10:00",end_at:"2026-11-16T10:30"},{event_type:"work",start_at:"2026-11-16T11:00",end_at:"2026-11-16T11:30"}]
 });
 assert.equal(day.blocks[0].start_time,"09:00");
 assert.equal(day.calendar_conflicts,0);
});

test("builds priority, focus and flexible daily plan variants without mutating source tasks",()=>{
 const tasks=[
  {id:"routine-long",title:"Разобрать почту",minutes:40,cognitive_load:"low",score:20},
  {id:"deep",title:"Подготовить стратегию",minutes:60,cognitive_load:"high",score:50},
  {id:"urgent",title:"Срочный звонок",minutes:20,cognitive_load:"low",score:90},
  {id:"medium",title:"Сверить данные",minutes:30,cognitive_load:"medium",score:40}
 ];
 const original=tasks.map(task=>task.id);
 const scenarios=buildDailyBlockScenarios([{date:"2026-11-16",gross_capacity_minutes:300,available_minutes:300,tasks}],{startTime:"09:00",focusMinutes:120,breakMinutes:10});
 assert.deepEqual(scenarios.map(item=>item.key),["priority","focus","flexible"]);
 const titles=key=>scenarios.find(item=>item.key===key).plans[0].blocks.filter(block=>block.type==="focus").map(block=>block.task_id).filter((id,index,all)=>all.indexOf(id)===index);
 assert.deepEqual(titles("priority"),["urgent","deep","medium","routine-long"]);
 assert.deepEqual(titles("focus"),["deep","medium","urgent","routine-long"]);
 assert.deepEqual(titles("flexible"),["urgent","routine-long","medium","deep"]);
 assert.deepEqual(tasks.map(task=>task.id),original);
});
