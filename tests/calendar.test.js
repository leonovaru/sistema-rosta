import test from "node:test";
import assert from "node:assert/strict";
import { expandRecurringEvents, isValidCalendarDate, isValidCalendarDateTime } from "../functions/_lib/calendar.js";

test("daily overnight series includes the occurrence that began yesterday", () => {
  const events = expandRecurringEvents([{
    id:"sleep",start_at:"2026-01-01T23:00",end_at:"2026-01-02T07:00",
    repeat_rule:"daily",repeat_until:"2026-12-31",status:"planned"
  }],"2026-11-15T00:00","2026-11-16T00:00");
  assert.deepEqual(events.map(event=>[event.start_at,event.end_at]),[
    ["2026-11-14T23:00","2026-11-15T07:00"],
    ["2026-11-15T23:00","2026-11-16T07:00"]
  ]);
});

test("weekly series is aligned to its original weekday even after a long time", () => {
  const events = expandRecurringEvents([{
    id:"meeting",start_at:"2024-01-01T10:00",end_at:"2024-01-01T11:00",
    repeat_rule:"weekly",repeat_until:"2027-12-31",status:"planned"
  }],"2026-11-15T00:00","2026-11-22T00:00");
  assert.deepEqual(events.map(event=>event.start_at),["2026-11-16T10:00"]);
});

test("one-off event crossing midnight appears in the next day's calendar", () => {
  const events = expandRecurringEvents([{
    id:"trip",start_at:"2026-11-14T23:30",end_at:"2026-11-15T01:00",
    repeat_rule:"none",status:"planned"
  }],"2026-11-15T00:00","2026-11-16T00:00");
  assert.equal(events.length,1);
  assert.equal(events[0].start_at,"2026-11-14T23:30");
  assert.equal(events[0].end_at,"2026-11-15T01:00");
});

test("includes a recurring occurrence on the final date when the range ends later that day", () => {
  const events = expandRecurringEvents([{
    id:"daily",start_at:"2026-01-01T10:00",end_at:"2026-01-01T11:00",
    repeat_rule:"daily",repeat_until:"2026-12-31",status:"planned"
  }],"2026-11-15T00:00","2026-11-16T18:00");
  assert.deepEqual(events.map(event=>event.start_at),[
    "2026-11-15T10:00",
    "2026-11-16T10:00"
  ]);
});

test("validates real calendar dates and wall-clock times, not only their string shape", () => {
  assert.equal(isValidCalendarDate("2024-02-29"),true);
  assert.equal(isValidCalendarDate("2026-02-29"),false);
  assert.equal(isValidCalendarDate("2026-04-31"),false);
  assert.equal(isValidCalendarDateTime("2026-11-15T23:59"),true);
  assert.equal(isValidCalendarDateTime("2026-11-15T24:00"),false);
  assert.equal(isValidCalendarDateTime("2026-11-15T12:60"),false);
  assert.equal(isValidCalendarDateTime("2026-02-30T12:00"),false);
});
