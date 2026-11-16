import test from "node:test";
import assert from "node:assert/strict";
import { remainingMinutesAfterBlockLogs } from "../functions/_lib/daily-block-execution.js";

test("subtracts actual minutes from done and interrupted blocks for the selected date",()=>{
 const tasks=[{id:"a",minutes:120},{id:"b",minutes:60}];
 const logs=[
  {task_id:"a",block_date:"2026-11-16",status:"done",actual_minutes:45},
  {task_id:"a",block_date:"2026-11-16",status:"interrupted",actual_minutes:15},
  {task_id:"b",block_date:"2026-11-16",status:"skipped",actual_minutes:0},
  {task_id:"a",block_date:"2026-11-17",status:"done",actual_minutes:30}
 ];
 assert.deepEqual(remainingMinutesAfterBlockLogs(tasks,logs,"2026-11-16"),[{id:"a",minutes:60},{id:"b",minutes:60}]);
});
test("removes tasks whose remaining daily estimate reaches zero",()=>{
 assert.deepEqual(remainingMinutesAfterBlockLogs([{id:"a",minutes:30}],[{task_id:"a",block_date:"2026-11-16",status:"done",actual_minutes:30}],"2026-11-16"),[]);
});
test("does not mutate tasks or execution logs",()=>{
 const tasks=[{id:"a",minutes:90}],logs=[{task_id:"a",block_date:"2026-11-16",status:"done",actual_minutes:20}],before=JSON.stringify({tasks,logs});
 remainingMinutesAfterBlockLogs(tasks,logs,"2026-11-16");
 assert.equal(JSON.stringify({tasks,logs}),before);
});
