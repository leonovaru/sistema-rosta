import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const match = app.match(/function averageSleepMinutes\(sessions,days\)\{([\s\S]*?)\n\}/);
assert.ok(match, "averageSleepMinutes must remain available for the sleep UI");

function runAverage(sessions, days, today = "2026-11-15") {
  const sleepLocalDate = () => today;
  const shiftDate = (date, offset) => {
    const value = new Date(date + "T12:00:00Z");
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  };
  const sleepDuration = (start, end) => start && end ? 480 : null;
  return new Function("sessions", "days", "sleepLocalDate", "shiftDate", "sleepDuration", match[1])(
    sessions, days, sleepLocalDate, shiftDate, sleepDuration
  );
}

test("7-day sleep statistics use local date window and count incomplete records separately", () => {
  const result = runAverage([
    { sleep_date: "2026-11-09", fell_asleep_at: "2026-11-09T23:00", woke_at: "2026-11-10T07:00" },
    { sleep_date: "2026-11-10", fell_asleep_at: "2026-11-10T23:00", woke_at: "2026-11-11T07:00" },
    { sleep_date: "2026-11-11", fell_asleep_at: "2026-11-11T23:00", woke_at: null },
    { sleep_date: "2026-11-08", fell_asleep_at: "2026-11-08T23:00", woke_at: "2026-11-09T07:00" },
    { sleep_date: "2026-11-16", fell_asleep_at: "2026-11-16T23:00", woke_at: "2026-11-17T07:00" }
  ], 7);
  assert.deepEqual(result, { minutes: 480, count: 2, incompleteCount: 1 });
});

test("30-day sleep statistics can include older records and do not invent missing nights", () => {
  const result = runAverage([
    { sleep_date: "2026-10-17", fell_asleep_at: "2026-10-17T23:00", woke_at: "2026-10-18T07:00" },
    { sleep_date: "2026-10-16", fell_asleep_at: "2026-10-16T23:00", woke_at: "2026-10-17T07:00" },
    { sleep_date: "2026-11-15", fell_asleep_at: null, woke_at: "2026-11-15T07:00" }
  ], 30);
  assert.deepEqual(result, { minutes: 480, count: 1, incompleteCount: 1 });
});

test("sleep statistics report zero complete nights without treating them as zero-minute sleep", () => {
  const result = runAverage([
    { sleep_date: "2026-11-15", fell_asleep_at: null, woke_at: "2026-11-15T07:00" }
  ], 7);
  assert.deepEqual(result, { minutes: null, count: 0, incompleteCount: 1 });
});
