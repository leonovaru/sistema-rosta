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
  assert.equal(result.horizons[0].days,7);
  assert.equal(result.horizons[0].projects,2);
  assert.equal(result.horizons[0].estimated_minutes,480);
  assert.equal(result.horizons[0].unestimated_tasks,3);
  assert.equal(result.horizons[0].capacity_minutes,null);
  assert.equal(result.horizons[0].over_capacity,false);
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

test("does not infer overload until weekly availability is explicitly configured", () => {
  const projects=[{id:"p",status:"active",deadline:"2026-11-20",open_estimated_minutes:2400,unestimated_open_tasks:0}];
  const unset=calculateProjectWorkload(projects,"2026-11-16",{configured:false,working_days:[1,2,3,4,5],daily_capacity_minutes:360});
  assert.equal(unset.capacity_configured,false);
  assert.equal(unset.horizons[0].capacity_minutes,null);
  assert.equal(unset.horizons[0].over_capacity,false);
});
test("compares deadline demand with explicitly configured weekdays and daily minutes", () => {
  const result=calculateProjectWorkload([{id:"p",status:"active",deadline:"2026-11-20",open_estimated_minutes:1800,unestimated_open_tasks:0}],"2026-11-16",{configured:true,working_days:[1,2,3,4,5],daily_capacity_minutes:360});
  assert.equal(result.horizons[0].capacity_minutes,1800);
  assert.equal(result.horizons[0].load_percent,100);
  assert.equal(result.horizons[0].over_capacity,false);
  const overloaded=calculateProjectWorkload([{id:"p",status:"active",deadline:"2026-11-20",open_estimated_minutes:2400,unestimated_open_tasks:0}],"2026-11-16",{configured:true,working_days:[1,2,3,4,5],daily_capacity_minutes:360});
  assert.equal(overloaded.horizons[0].over_capacity,true);
});
test("weekly capacity respects selected working days", () => {
  const result=calculateProjectWorkload([],"2026-11-16",{configured:true,working_days:[1,3,5],daily_capacity_minutes:240});
  assert.equal(result.horizons[0].capacity_minutes,720);
});

test("completed and archived projects retain history but contribute no active workload",()=>{
 const result=calculateProjectWorkload([
  {id:"done",status:"done",deadline:"2026-11-20",open_estimated_minutes:600,unestimated_open_tasks:2},
  {id:"archived",status:"archived",deadline:"2026-11-20",open_estimated_minutes:300,unestimated_open_tasks:1},
  {id:"active",status:"active",deadline:"2026-11-20",open_estimated_minutes:120,unestimated_open_tasks:0}
 ],"2026-11-16");
 assert.equal(result.projects[0].workload.estimated_minutes,0);
 assert.equal(result.projects[0].workload.unestimated_open_tasks,0);
 assert.equal(result.projects[1].workload.estimated_minutes,0);
 assert.equal(result.projects[2].workload.estimated_minutes,120);
 assert.equal(result.horizons[0].estimated_minutes,120);
});
