import test from "node:test";
import assert from "node:assert/strict";
import { elapsedMinutes } from "../functions/_lib/time-tracking.js";

test("rounds partial minutes up and never records zero for a started timer", () => {
  assert.equal(elapsedMinutes("2026-11-15T10:00:00.000Z","2026-11-15T10:00:01.000Z"),1);
  assert.equal(elapsedMinutes("2026-11-15T10:00:00.000Z","2026-11-15T10:01:00.000Z"),1);
  assert.equal(elapsedMinutes("2026-11-15T10:00:00.000Z","2026-11-15T10:01:01.000Z"),2);
});

test("preserves a timer session longer than 24 hours without truncation", () => {
  assert.equal(elapsedMinutes("2026-11-14T10:00:00.000Z","2026-11-16T10:00:00.000Z"),2880);
  assert.equal(elapsedMinutes("2026-11-14T10:00:00.000Z","2026-11-17T10:00:01.000Z"),4321);
});

test("rejects invalid or reversed timestamps", () => {
  assert.equal(elapsedMinutes("bad","2026-11-15T10:00:00.000Z"),null);
  assert.equal(elapsedMinutes("2026-11-15T11:00:00.000Z","2026-11-15T10:00:00.000Z"),null);
});
