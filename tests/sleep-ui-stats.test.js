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

const clockMatch = app.match(/function averageSleepClock\(sessions,days,timeField\)\{([\s\S]*?)\n\}/);
assert.ok(clockMatch, "averageSleepClock must remain available for sleep analytics");
function runClock(sessions, days, field = "fell_asleep_at", today = "2026-11-15") {
  const sleepLocalDate = () => today;
  const shiftDate = (date, offset) => {
    const value = new Date(date + "T12:00:00Z");
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  };
  return new Function("sessions", "days", "timeField", "sleepLocalDate", "shiftDate", clockMatch[1])(
    sessions, days, field, sleepLocalDate, shiftDate
  );
}
test("average sleep clock handles times around midnight using circular mean", () => {
  const result = runClock([
    { sleep_date: "2026-11-14", fell_asleep_at: "2026-11-14T23:50" },
    { sleep_date: "2026-11-15", fell_asleep_at: "2026-11-15T00:10" }
  ], 7);
  assert.equal(result.time, 0);
  assert.equal(result.count, 2);
  assert.equal(result.variation, 10);
});
test("average sleep clock ignores invalid values and does not invent a mean for opposite times", () => {
  const result = runClock([
    { sleep_date: "2026-11-14", fell_asleep_at: "2026-11-14T06:00" },
    { sleep_date: "2026-11-15", fell_asleep_at: "2026-11-15T18:00" },
    { sleep_date: "2026-11-15", fell_asleep_at: "bad" }
  ], 7);
  assert.equal(result.time, null);
  assert.equal(result.count, 2);
  assert.equal(result.variation, null);
});
const variabilityMatch = app.match(/function sleepDurationVariability\(sessions,days\)\{([\s\S]*?)\n\}/);
assert.ok(variabilityMatch, "sleepDurationVariability must remain available for sleep analytics");
function runVariability(sessions, days, today = "2026-11-15") {
  const sleepLocalDate = () => today;
  const shiftDate = (date, offset) => {
    const value = new Date(date + "T12:00:00Z");
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  };
  const sleepDuration = (start, end) => start && end ? Number(start) : null;
  return new Function("sessions", "days", "sleepLocalDate", "shiftDate", "sleepDuration", variabilityMatch[1])(
    sessions, days, sleepLocalDate, shiftDate, sleepDuration
  );
}
test("sleep duration variability is standard deviation and requires at least two full nights", () => {
  assert.deepEqual(runVariability([
    { sleep_date: "2026-11-14", fell_asleep_at: "400", woke_at: "yes" },
    { sleep_date: "2026-11-15", fell_asleep_at: "500", woke_at: "yes" }
  ], 7), { minutes: 50, count: 2 });
  assert.deepEqual(runVariability([
    { sleep_date: "2026-11-15", fell_asleep_at: "400", woke_at: "yes" }
  ], 7), { minutes: null, count: 1 });
});

const chartMatch = app.match(/function renderSleepDurationChart\(sessions,days=30\)\{([\s\S]*?)\n\}/);
assert.ok(chartMatch, "renderSleepDurationChart must remain available for the sleep UI");
function runChart(sessions, days = 30, today = "2026-11-15") {
  const sleepLocalDate = () => today;
  const shiftDate = (date, offset) => {
    const value = new Date(date + "T12:00:00Z");
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  };
  const sleepDuration = (start, end) => start && end ? Number(start) : null;
  const sleepDurationLabel = minutes => minutes + " мин";
  const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  return new Function("sessions", "days", "sleepLocalDate", "shiftDate", "sleepDuration", "sleepDurationLabel", "escapeHtml", chartMatch[1])(
    sessions, days, sleepLocalDate, shiftDate, sleepDuration, sleepDurationLabel, escapeHtml
  );
}
test("30-day sleep chart renders one bar per local date and leaves missing nights blank", () => {
  const html = runChart([
    { sleep_date: "2026-11-14", fell_asleep_at: "480", woke_at: "yes" },
    { sleep_date: "2026-11-15", fell_asleep_at: null, woke_at: "yes" }
  ]);
  assert.equal((html.match(/class="sleep-chart-day"/g) || []).length, 30);
  assert.equal((html.match(/class="sleep-chart-bar"/g) || []).length, 1);
  assert.equal((html.match(/class="sleep-chart-missing"/g) || []).length, 29);
  assert.match(html, /1 полных ночей из 30 календарных дней/);
});
test("sleep chart excludes dates outside its selected window", () => {
  const html = runChart([
    { sleep_date: "2026-10-16", fell_asleep_at: "480", woke_at: "yes" },
    { sleep_date: "2026-11-15", fell_asleep_at: "420", woke_at: "yes" }
  ]);
  assert.equal((html.match(/class="sleep-chart-bar"/g) || []).length, 1);
  assert.match(html, /420 мин/);
  assert.doesNotMatch(html, /480 мин/);
});

const goalMatch = app.match(/function sleepGoalComparison\\(sessions,days,targetMinutes\\)\\{([\\s\\S]*?)\\n\\}/);
assert.ok(goalMatch, "sleepGoalComparison must remain available for sleep analytics");
function runGoal(sessions, days, target, today = "2026-11-15") {
  const sleepLocalDate = () => today;
  const shiftDate = (date, offset) => {
    const value = new Date(date + "T12:00:00Z");
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  };
  const sleepDuration = (start, end) => start && end ? Number(start) : null;
  return new Function("sessions", "days", "targetMinutes", "sleepLocalDate", "shiftDate", "sleepDuration", goalMatch[1])(
    sessions, days, target, sleepLocalDate, shiftDate, sleepDuration
  );
}
test("sleep goal comparison is opt-in and ignores incomplete nights", () => {
  const sessions = [
    { sleep_date: "2026-11-14", fell_asleep_at: "480", woke_at: "yes" },
    { sleep_date: "2026-11-15", fell_asleep_at: "450", woke_at: "yes" },
    { sleep_date: "2026-11-15", fell_asleep_at: null, woke_at: "yes" }
  ];
  assert.deepEqual(runGoal(sessions, 7, null), { target: null, average: null, delta: null, count: 0, below: 0, atOrAbove: 0 });
  assert.deepEqual(runGoal(sessions, 7, 480), { target: 480, average: 465, delta: -15, count: 2, below: 1, atOrAbove: 1 });
});
test("sleep goal comparison does not invent an average without complete nights", () => {
  assert.deepEqual(runGoal([{ sleep_date: "2026-11-15", fell_asleep_at: null, woke_at: "yes" }], 7, 480), {
    target: 480, average: null, delta: null, count: 0, below: 0, atOrAbove: 0
  });
});
