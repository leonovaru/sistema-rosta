import test from "node:test";
import assert from "node:assert/strict";
import { allocateTaskSlots, intersectMinuteIntervals, mergeMinuteIntervals } from "../functions/_lib/planner-scheduling.js";

test("merges overlapping and adjacent busy-free intervals without mutating input", () => {
  const source = [{ start: 600, end: 660 }, { start: 650, end: 700 }, { start: 700, end: 720 }];
  assert.deepEqual(mergeMinuteIntervals(source), [{ start: 600, end: 720 }]);
  assert.equal(source[0].end, 660);
});

test("intersects free time with explicit work windows", () => {
  assert.deepEqual(
    intersectMinuteIntervals([{ start: 480, end: 720 }, { start: 780, end: 900 }], [{ start: 540, end: 840 }]),
    [{ start: 540, end: 720 }, { start: 780, end: 840 }]
  );
});

test("allocates tasks in chronological free slots and never crosses a gap", () => {
  const result = allocateTaskSlots([
    { task_id: "a", title: "Первая", minutes: 60 },
    { task_id: "b", title: "Вторая", minutes: 45 },
    { task_id: "c", title: "Третья", minutes: 30 }
  ], [{ start: 540, end: 600 }, { start: 660, end: 750 }], "2026-11-15");
  assert.deepEqual(result.items.map(item => [item.task_id, item.scheduled, item.start_at, item.end_at]), [
    ["a", true, "2026-11-15T09:00", "2026-11-15T10:00"],
    ["b", true, "2026-11-15T11:00", "2026-11-15T11:45"],
    ["c", false, undefined, undefined]
  ]);
  assert.equal(result.scheduled_minutes, 105);
  assert.equal(result.unscheduled_count, 1);
});

test("does not schedule tasks when explicit work windows have ended", () => {
  const result = allocateTaskSlots([{ task_id: "a", minutes: 30 }], [], "2026-11-15");
  assert.equal(result.items[0].scheduled, false);
});

test("ignores invalid or zero-length intervals and rejects invalid task durations", () => {
  const result = allocateTaskSlots([{ task_id: "a", minutes: 0 }], [{ start: 800, end: 800 }, { start: 900, end: 950 }], "2026-11-15");
  assert.equal(result.items[0].scheduled, false);
  assert.equal(result.unscheduled_count, 1);
});
