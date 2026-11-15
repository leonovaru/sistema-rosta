import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendarExecutionContext } from "../functions/_lib/calendar-execution-context.js";

const log=(date,start,end,status="done")=>({block_date:date,start_time:start,end_time:end,planned_minutes:40,status});
test("separates clear blocks from blocks near meetings",()=>{
 const logs=[
  log("2026-11-02","09:00","09:40","done"),
  log("2026-11-02","11:00","11:40","skipped"),
  log("2026-11-02","14:00","14:40","done")
 ];
 const events=[{event_type:"meeting",status:"planned",start_at:"2026-11-02T10:00",end_at:"2026-11-02T10:30"}];
 const result=buildCalendarExecutionContext(logs,events);
 assert.equal(result.groups.find(x=>x.context==="clear").sample_size,1);
 assert.equal(result.groups.find(x=>x.context==="nearby").sample_size,2);
 assert.equal(result.insights[0].type,"meeting_proximity");
});
test("flags calendar overlaps separately and excludes sleep and work",()=>{
 const logs=[log("2026-11-02","09:00","09:40","interrupted")];
 const events=[
  {event_type:"meeting",status:"planned",start_at:"2026-11-02T09:20",end_at:"2026-11-02T09:50"},
  {event_type:"sleep",status:"completed",start_at:"2026-11-02T08:00",end_at:"2026-11-02T09:00"},
  {event_type:"work",status:"planned",start_at:"2026-11-02T09:00",end_at:"2026-11-02T10:00"}
 ];
 const result=buildCalendarExecutionContext(logs,events);
 assert.equal(result.groups[0].context,"overlap");
 assert.equal(result.insights[0].type,"calendar_overlap");
});
test("does not infer meeting effects from insufficient samples",()=>{
 const result=buildCalendarExecutionContext([log("2026-11-02","09:00","09:40")],[{event_type:"meeting",start_at:"2026-11-02T10:00",end_at:"2026-11-02T10:30"}]);
 assert.equal(result.insights.length,0);
});
test("ignores cancelled events and invalid log intervals",()=>{
 const result=buildCalendarExecutionContext([
  log("2026-11-02","09:00","09:40"),
  {...log("2026-11-02","10:00","09:30"),status:"skipped"}
 ],[{event_type:"meeting",status:"cancelled",start_at:"2026-11-02T09:00",end_at:"2026-11-02T10:00"}]);
 assert.equal(result.groups[0].context,"clear");
 assert.equal(result.sample_size,1);
});
