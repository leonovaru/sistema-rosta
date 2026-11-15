import test from "node:test";
import assert from "node:assert/strict";
import { addDays, addPeriod } from "../functions/_lib/finance.js";

test("weekly obligations advance by seven calendar days",()=>{
  assert.equal(addPeriod("2026-11-15","weekly"),"2026-11-22");
});
test("monthly obligations clamp dates at the end of shorter months",()=>{
  assert.equal(addPeriod("2026-01-31","monthly"),"2026-02-28");
  assert.equal(addPeriod("2024-01-31","monthly"),"2024-02-29");
});
test("monthly obligations advance across year boundaries",()=>{
  assert.equal(addPeriod("2026-12-31","monthly"),"2027-01-31");
});
test("one-off obligations do not repeat",()=>{
  assert.equal(addPeriod("2026-11-15","once"),null);
});
test("date arithmetic handles leap day",()=>{
  assert.equal(addDays("2024-02-28",1),"2024-02-29");
});
