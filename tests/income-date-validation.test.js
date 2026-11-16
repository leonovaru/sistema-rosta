import test from "node:test";
import assert from "node:assert/strict";
import { isValidIncomeDate } from "../functions/api/income.js";

test("accepts valid ISO calendar dates including leap day", () => {
  assert.equal(isValidIncomeDate("2024-02-29"), true);
  assert.equal(isValidIncomeDate("2026-11-17"), true);
});

test("rejects impossible dates and malformed date strings", () => {
  for (const value of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-00-10", "2026-1-01", "not-a-date"]) {
    assert.equal(isValidIncomeDate(value), false, value);
  }
});
