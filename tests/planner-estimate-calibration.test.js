import test from "node:test";
import assert from "node:assert/strict";
import { calibrateTaskEstimates } from "../functions/_lib/planner-priorities.js";

test("calibrates estimates by median completed-task ratio within an income direction", () => {
  const history = [
    { direction_id:"a",estimated_minutes:60,actual_minutes:90 },
    { direction_id:"a",estimated_minutes:60,actual_minutes:120 },
    { direction_id:"a",estimated_minutes:60,actual_minutes:60 },
    { direction_id:"b",estimated_minutes:60,actual_minutes:30 }
  ];
  const [task] = calibrateTaskEstimates([{ id:"new",direction_id:"a",estimated_minutes:60,status:"todo" }],history);
  assert.equal(task.planning_minutes,90);
  assert.equal(task.estimate_basis,"direction_history");
});

test("does not learn from fewer than three completed tasks and bounds outliers", () => {
  const history = [{direction_id:"a",estimated_minutes:60,actual_minutes:600},{direction_id:"a",estimated_minutes:60,actual_minutes:120}];
  const [task] = calibrateTaskEstimates([{direction_id:"a",estimated_minutes:60,status:"todo"}],history);
  assert.equal(task.planning_minutes,60);
  const [bounded] = calibrateTaskEstimates([{direction_id:"a",estimated_minutes:60,status:"todo"}],[
    ...history,{direction_id:"a",estimated_minutes:60,actual_minutes:600}
  ]);
  assert.equal(bounded.planning_minutes,120);
});

test("subtracts recorded time from an in-progress task estimate", () => {
  const [task] = calibrateTaskEstimates([{estimated_minutes:90,actual_minutes:35,status:"doing"}],[]);
  assert.equal(task.planning_minutes,55);
  assert.equal(task.estimate_basis,"remaining");
});

test("uses global history when direction history is insufficient", () => {
  const history = [
    {direction_id:"x",estimated_minutes:60,actual_minutes:90},
    {direction_id:"y",estimated_minutes:60,actual_minutes:90},
    {direction_id:"z",estimated_minutes:60,actual_minutes:90}
  ];
  const [task] = calibrateTaskEstimates([{direction_id:"new",estimated_minutes:60,status:"todo"}],history);
  assert.equal(task.planning_minutes,90);
  assert.equal(task.estimate_basis,"overall_history");
});
