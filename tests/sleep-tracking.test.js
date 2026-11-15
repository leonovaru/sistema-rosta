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
