import test from "node:test";
import assert from "node:assert/strict";
import { isValidDreamDate } from "../functions/api/dreams.js";
import { isValidCalendarDate } from "../functions/_lib/calendar.js";

test("dream and financial goal dates reject impossible calendar days",()=>{
  assert.equal(isValidDreamDate(null),true);
  assert.equal(isValidDreamDate(""),true);
  assert.equal(isValidDreamDate("2024-02-29"),true);
  assert.equal(isValidDreamDate("2026-02-30"),false);
  assert.equal(isValidDreamDate("2026-13-01"),false);
  assert.equal(isValidCalendarDate("2026-02-30"),false);
});
