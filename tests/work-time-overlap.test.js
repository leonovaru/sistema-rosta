import test from "node:test";
import assert from "node:assert/strict";
import { taskTimeIntervalsForLocalDay, calculateUnionWorkMinutes } from "../functions/_lib/work-time-overlap.js";

test("converts tracked task time into the configured local day", () => {
  const intervals = taskTimeIntervalsForLocalDay([
    { started_at: "2026-11-15T08:00:00.000Z", ended_at: "2026-11-15T10:00:00.000Z" }
  ], "2026-11-15", "Europe/Amsterdam");
  assert.deepEqual(intervals, [{ start: 9 * 60, end: 11 * 60 }]);
});

test("clips a tracked session that crosses local midnight to the selected day", () => {
  const intervals = taskTimeIntervalsForLocalDay([
    { started_at: "2026-11-14T22:30:00.000Z", ended_at: "2026-11-15T02:00:00.000Z" }
  ], "2026-11-15", "Europe/Amsterdam");
  assert.deepEqual(intervals, [{ start: 30, end: 180 }]);
});

test("uses the current time for an active timer and ignores invalid intervals", () => {
  const intervals = taskTimeIntervalsForLocalDay([
    { started_at: "2026-11-15T08:00:00.000Z", ended_at: null },
    { started_at: "invalid", ended_at: null }
  ], "2026-11-15", "Europe/Amsterdam", Date.parse("2026-11-15T09:30:00.000Z"));
  assert.deepEqual(intervals, [{ start: 9 * 60, end: 10 * 60 + 30 }]);
});

test("merges task timer and calendar work intervals so overlapping time is counted once", () => {
  const minutes = calculateUnionWorkMinutes(
    [{ start: 9 * 60, end: 10 * 60 + 30 }, { start: 12 * 60, end: 13 * 60 }],
    [{ start: 10 * 60, end: 11 * 60 }, { start: 12 * 60 + 30, end: 13 * 30 }]
  );
  assert.equal(minutes, 150);
});
