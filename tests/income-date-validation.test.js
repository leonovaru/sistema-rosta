import test from "node:test";
import assert from "node:assert/strict";
import { isValidIncomeDate } from "../functions/api/income.js";
import { isValidRegistrationEmail } from "../functions/api/auth/register.js";
import { isValidBudgetMonth } from "../functions/api/finance/budget.js";
import { isValidProjectCashflowDate } from "../functions/api/project-cashflows.js";

test("accepts valid ISO calendar dates including leap day", () => {
  assert.equal(isValidIncomeDate("2024-02-29"), true);
  assert.equal(isValidProjectCashflowDate("2026-12-01"), true);
  assert.equal(isValidIncomeDate("2026-11-17"), true);
});

test("rejects impossible dates and malformed date strings", () => {
  for (const value of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-00-10", "2026-1-01", "not-a-date"]) {
    assert.equal(isValidIncomeDate(value), false, value);
    assert.equal(isValidProjectCashflowDate(value), false, value);
  }
});

test("validates month values used by the budget API", () => {
  assert.equal(isValidBudgetMonth("2026-11"), true);
  for (const value of ["2026-00", "2026-13", "26-11", "2026-1"]) {
    assert.equal(isValidBudgetMonth(value), false, value);
  }
});

test("validates ordinary email addresses for registration", () => {
  assert.equal(isValidRegistrationEmail("user@example.com"), true);
  assert.equal(isValidRegistrationEmail("first.last+tag@example.co.uk"), true);
  for (const value of ["", "user@", "@example.com", "user example@example.com", "user@example", "a".repeat(250)+"@example.com"]) {
    assert.equal(isValidRegistrationEmail(value), false, value);
  }
});
