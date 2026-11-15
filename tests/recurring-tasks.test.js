import test from "node:test";
import assert from "node:assert/strict";
import { recurringTaskDates } from "../functions/_lib/recurring-tasks.js";

test("daily template generates dates in requested range only",()=>{
 assert.deepEqual(recurringTaskDates({start_date:"2026-11-01",recurrence:"daily"}, "2026-11-15","2026-11-18"),["2026-11-15","2026-11-16","2026-11-17","2026-11-18"]);
});
test("weekly template keeps the original weekday",()=>{
 assert.deepEqual(recurringTaskDates({start_date:"2026-11-02",recurrence:"weekly"}, "2026-11-15","2026-11-30"),["2026-11-16","2026-11-23","2026-11-30"]);
});
test("monthly template clamps to month end and returns to original day",()=>{
 assert.deepEqual(recurringTaskDates({start_date:"2026-01-31",recurrence:"monthly"}, "2026-02-01","2026-04-30"),["2026-02-28","2026-03-31","2026-04-30"]);
});
test("leap-year monthly task uses February 29",()=>{
 assert.deepEqual(recurringTaskDates({start_date:"2024-01-31",recurrence:"monthly"}, "2024-02-01","2024-03-31"),["2024-02-29","2024-03-31"]);
});
test("end date is inclusive",()=>{
 assert.deepEqual(recurringTaskDates({start_date:"2026-11-01",end_date:"2026-11-16",recurrence:"weekly"}, "2026-11-01","2026-11-30"),["2026-11-01","2026-11-08","2026-11-15"]);
});
test("daily task starting in future is not generated early",()=>{
 assert.deepEqual(recurringTaskDates({start_date:"2026-12-01",recurrence:"daily"}, "2026-11-15","2026-11-30"),[]);
});

test("monthly task is not generated for a date that has already passed this month",()=>{
 assert.deepEqual(recurringTaskDates({start_date:"2026-01-10",recurrence:"monthly"}, "2026-11-15","2026-12-15"),["2026-12-10"]);
});

test("monthly task later this month is not skipped",()=>{
 assert.deepEqual(recurringTaskDates({start_date:"2026-01-10",recurrence:"monthly"}, "2026-11-05","2026-12-05"),["2026-11-10"]);
});

import { normalizeRecurringSteps } from "../functions/_lib/recurring-tasks.js";

test("recurring template subtasks are trimmed and blank lines are ignored",()=>{
 assert.deepEqual(normalizeRecurringSteps(["  Протереть поверхности  ","","Помыть пол"]),["Протереть поверхности","Помыть пол"]);
});
test("recurring template accepts no subtasks",()=>{
 assert.deepEqual(normalizeRecurringSteps(undefined),[]);
});
test("recurring template rejects more than 30 subtasks",()=>{
 assert.equal(normalizeRecurringSteps(Array.from({length:31},(_,i)=>"Шаг "+i)),null);
});
test("recurring template rejects an overlong subtask title",()=>{
 assert.equal(normalizeRecurringSteps(["x".repeat(241)]),null);
});
