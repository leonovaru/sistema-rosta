import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSleepLimit } from "../functions/api/sleep.js";

test("sleep history limit defaults to 30 and clamps to 1..90", () => {
  assert.equal(normalizeSleepLimit(null), 30);
  assert.equal(normalizeSleepLimit(""), 30);
  assert.equal(normalizeSleepLimit("1"), 1);
  assert.equal(normalizeSleepLimit("90"), 90);
  assert.equal(normalizeSleepLimit("120"), 90);
  assert.equal(normalizeSleepLimit("-4"), 1);
});

test("sleep history limit safely normalizes decimals and invalid values", () => {
  assert.equal(normalizeSleepLimit("4.8"), 4);
  assert.equal(normalizeSleepLimit("not-a-number"), 30);
  assert.equal(normalizeSleepLimit("Infinity"), 30);
});
