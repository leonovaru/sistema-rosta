import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyReallocationProposals } from "../functions/_lib/daily-block-reallocation.js";

const options={startTime:"09:00",focusMinutes:50,breakMinutes:10};
test("proposes moving an unplaced daily allocation to a later day with enough free capacity",()=>{
 const days=[
  {date:"2026-11-16",working_day:true,gross_capacity_minutes:60,available_minutes:60,tasks:[{id:"a",title:"Подготовить отчёт",minutes:90,priority:"medium",due_date:"2026-11-18"}]},
  {date:"2026-11-17",working_day:true,gross_capacity_minutes:180,available_minutes:180,tasks:[]},
  {date:"2026-11-18",working_day:true,gross_capacity_minutes:180,available_minutes:180,tasks:[]}
 ];
 const result=buildDailyReallocationProposals(days,options);
 assert.equal(result.proposals.length,1);
 assert.equal(result.proposals[0].from,"2026-11-16");
 assert.equal(result.proposals[0].to,"2026-11-17");
 assert.equal(result.proposals[0].minutes,90);
 assert.equal(days[0].tasks.length,1);
 assert.equal(days[1].tasks.length,0);
});
test("does not propose a move beyond the task deadline",()=>{
 const days=[
  {date:"2026-11-16",working_day:true,gross_capacity_minutes:30,available_minutes:30,tasks:[{id:"a",title:"Задача",minutes:60,priority:"low",due_date:"2026-11-16"}]},
  {date:"2026-11-17",working_day:true,gross_capacity_minutes:120,available_minutes:120,tasks:[]}
 ];
 assert.equal(buildDailyReallocationProposals(days,options).proposals.length,0);
});
test("does not displace existing tasks or use a calendar-blocked destination",()=>{
 const days=[
  {date:"2026-11-16",working_day:true,gross_capacity_minutes:30,available_minutes:30,tasks:[{id:"a",title:"Переносимая",minutes:60,priority:"low",due_date:"2026-11-18"}]},
  {date:"2026-11-17",working_day:true,gross_capacity_minutes:120,available_minutes:120,tasks:[{id:"b",title:"Уже запланирована",minutes:90,priority:"high"}]},
  {date:"2026-11-18",working_day:true,gross_capacity_minutes:120,available_minutes:120,tasks:[]}
 ];
 const result=buildDailyReallocationProposals(days,{...options,calendarEvents:[{event_type:"meeting",status:"planned",start_at:"2026-11-18T09:00",end_at:"2026-11-18T11:00"}]});
 assert.equal(result.proposals.length,0);
});
test("does not move high-priority tasks and does not mutate input",()=>{
 const days=[{date:"2026-11-16",working_day:true,gross_capacity_minutes:20,available_minutes:20,tasks:[{id:"a",title:"Критичная",minutes:60,priority:"high",due_date:"2026-11-17"}]},{date:"2026-11-17",working_day:true,gross_capacity_minutes:120,available_minutes:120,tasks:[]}];
 const before=JSON.stringify(days);
 assert.equal(buildDailyReallocationProposals(days,options).proposals.length,0);
 assert.equal(JSON.stringify(days),before);
});
