import test from "node:test";
import assert from "node:assert/strict";
import { calculateSleepDurationMinutes } from "../functions/_lib/sleep.js";

test("sleep duration is calculated only when both timestamps are known",()=>{
  assert.equal(calculateSleepDurationMinutes(null,"2026-11-15T07:00"),null);
  assert.equal(calculateSleepDurationMinutes("2026-11-14T23:30","2026-11-15T07:00"),450);
});
test("invalid or reversed sleep interval is not reported as duration",()=>{
  assert.equal(calculateSleepDurationMinutes("bad","2026-11-15T07:00"),null);
  assert.equal(calculateSleepDurationMinutes("2026-11-15T08:00","2026-11-15T07:00"),null);
});
test("duration uses the selected timezone rather than the server timezone",()=>{
  assert.equal(calculateSleepDurationMinutes("2026-11-14T23:00","2026-11-15T07:00","Europe/Moscow"),480);
});
test("duration accounts for daylight-saving transition in Europe/Amsterdam",()=>{
  assert.equal(calculateSleepDurationMinutes("2026-10-24T23:00","2026-10-25T07:00","Europe/Amsterdam"),540);
});

test("ambiguous repeated local time during autumn DST transition is not guessed",()=>{
  assert.equal(calculateSleepDurationMinutes("2026-10-25T02:30","2026-10-25T07:00","Europe/Amsterdam"),null);
});
test("nonexistent local time during spring DST transition is rejected",()=>{
  assert.equal(calculateSleepDurationMinutes("2026-03-29T02:30","2026-03-29T07:00","Europe/Amsterdam"),null);
});
test("unambiguous times surrounding spring DST transition use elapsed time",()=>{
  assert.equal(calculateSleepDurationMinutes("2026-03-29T01:30","2026-03-29T03:30","Europe/Amsterdam"),60);
});

test("sleep duration uses the timezone recorded at each end of a trip night",()=>{
  assert.equal(calculateSleepDurationMinutes("2026-11-15T23:00","2026-11-16T08:00","Europe/Amsterdam","Europe/Moscow"),420);
});
test("ambiguous time in either event timezone makes cross-zone duration unavailable",()=>{
  assert.equal(calculateSleepDurationMinutes("2026-10-25T02:30","2026-10-25T08:00","Europe/Amsterdam","Europe/Moscow"),null);
});
