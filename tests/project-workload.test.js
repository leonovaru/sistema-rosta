import test from "node:test";
import assert from "node:assert/strict";
import { calculateProjectWorkload } from "../functions/_lib/project-workload.js";

test("project workload calculates remaining effort and weekday pace", () => {
  const result = calculateProjectWorkload([
    { id:"p1", status:"active", deadline:"2026-11-20", open_estimated_minutes:600, unestimated_open_tasks:1 }
  ], "2026-11-16");
  assert.equal(result.projects[0].workload.estimated_hours, 10);
  assert.equal(result.projects[0].workload.workdays_to_deadline, 5);
  assert.equal(result.projects[0].workload.required_hours_per_workday, 2);
  assert.equal(result.projects[0].workload.estimate_complete, false);
});

test("deadline horizons aggregate competing project workload without inventing estimates", () => {
  const result = calculateProjectWorkload([
    { id:"a", status:"active", deadline:"2026-11-20", open_estimated_minutes:300, unestimated_open_tasks:2 },
    { id:"b", status:"waiting", deadline:"2026-11-22", open_estimated_minutes:180, unestimated_open_tasks:1 },
    { id:"c", status:"done", deadline:"2026-11-19", open_estimated_minutes:900, unestimated_open_tasks:0 },
    { id:"d", status:"active", deadline:null, open_estimated_minutes:60, unestimated_open_tasks:0 }
  ], "2026-11-16");
  assert.deepEqual(result.horizons[0], { days:7, projects:2, estimated_minutes:480, unestimated_tasks:3 });
  assert.equal(result.projects[2].workload.required_hours_per_workday, null);
  assert.equal(result.projects[3].workload.days_to_deadline, null);
});

test("overdue deadlines do not pretend there are remaining workdays", () => {
  const result = calculateProjectWorkload([
    { id:"x", status:"active", deadline:"2026-11-14", open_estimated_minutes:120, unestimated_open_tasks:0 }
  ], "2026-11-16");
  assert.equal(result.projects[0].workload.days_to_deadline, -2);
  assert.equal(result.projects[0].workload.workdays_to_deadline, null);
  assert.equal(result.projects[0].workload.required_hours_per_workday, null);
});
