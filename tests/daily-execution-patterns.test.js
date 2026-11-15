import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyExecutionPatterns } from "../functions/_lib/daily-execution-patterns.js";

test("groups explicit block outcomes by time of day and weekday",()=>{
 const logs=[
  ...Array.from({length:4},(_,i)=>({block_date:"2026-11-0"+(2+i),start_time:"09:00",planned_minutes:40,status:"done"})),
  ...Array.from({length:4},(_,i)=>({block_date:"2026-11-0"+(2+i),start_time:"10:00",planned_minutes:40,status:"skipped"})),
  ...Array.from({length:4},(_,i)=>({block_date:"2026-11-0"+(2+i),start_time:"14:00",planned_minutes:40,status:"done"}))
 ];
 const result=buildDailyExecutionPatterns(logs);
 assert.equal(result.sample_size,12);
 assert.equal(result.by_period.find(row=>row.period==="Утро").sample_size,8);
 assert.ok(result.by_weekday.length>0);
 assert.equal(result.notable[0].type,"time_of_day");
});
test("does not infer a pattern from small samples or invalid outcomes",()=>{
 const result=buildDailyExecutionPatterns([{block_date:"2026-11-02",start_time:"09:00",planned_minutes:30,status:"skipped"}]);
 assert.equal(result.notable.length,0);
 assert.equal(result.sample_size,1);
});
test("does not treat skipped or interrupted blocks as completed",()=>{
 const result=buildDailyExecutionPatterns([
  {block_date:"2026-11-02",start_time:"09:00",planned_minutes:30,status:"interrupted"},
  {block_date:"2026-11-02",start_time:"10:00",planned_minutes:30,status:"skipped"}
 ]);
 assert.equal(result.overall.completed,0);
 assert.equal(result.overall.completion_rate,0);
});
