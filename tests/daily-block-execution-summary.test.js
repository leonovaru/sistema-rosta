import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDailyBlockExecution } from "../functions/_lib/daily-block-execution-summary.js";

test("summarizes completed, skipped and interrupted blocks against planned minutes",()=>{
 const logs=[
  {block_date:"2026-11-16",status:"done",planned_minutes:50,actual_minutes:45},
  {block_date:"2026-11-16",status:"skipped",planned_minutes:30,actual_minutes:0},
  {block_date:"2026-11-16",status:"interrupted",planned_minutes:50,actual_minutes:20},
  {block_date:"2026-11-17",status:"done",planned_minutes:50,actual_minutes:50}
 ];
 assert.deepEqual(summarizeDailyBlockExecution(logs,"2026-11-16"),{blocks:3,done:1,skipped:1,interrupted:1,planned_minutes:130,actual_minutes:65,variance_minutes:-65,completion_rate:33});
});
test("returns an empty neutral summary when no blocks were logged",()=>{
 assert.deepEqual(summarizeDailyBlockExecution([],"2026-11-16"),{blocks:0,done:0,skipped:0,interrupted:0,planned_minutes:0,actual_minutes:0,variance_minutes:0,completion_rate:null});
});
