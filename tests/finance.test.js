import test from "node:test";
import assert from "node:assert/strict";
import { addDays, addPeriod, nextIrregularDate } from "../functions/_lib/finance.js";

test("weekly obligations advance by seven calendar days",()=>{
  assert.equal(addPeriod("2026-11-15","weekly"),"2026-11-22");
});
test("monthly obligations clamp dates at the end of shorter months",()=>{
  assert.equal(addPeriod("2026-01-31","monthly",31),"2026-02-28");
  assert.equal(addPeriod("2026-02-28","monthly",31),"2026-03-31");
  assert.equal(addPeriod("2024-01-31","monthly",31),"2024-02-29");
  assert.equal(addPeriod("2024-02-29","monthly",31),"2024-03-31");
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

test("quarterly and yearly irregular expenses keep their original calendar day",()=>{
  assert.equal(nextIrregularDate("2027-01-31","quarterly"),"2027-04-30");
  assert.equal(nextIrregularDate("2027-04-30","quarterly",31),"2027-07-31");
  assert.equal(nextIrregularDate("2028-02-29","yearly",29),"2029-02-28");
});
test("one-time irregular expenses have no next date",()=>{
  assert.equal(nextIrregularDate("2026-11-15","once"),null);
});

test("dateInZone uses the user's calendar date rather than UTC date",()=>{
 const {dateInZone}=awaitImportFinance();
 assert.equal(dateInZone("Europe/Moscow",new Date("2026-11-15T22:30:00.000Z")),"2026-11-16");
 assert.equal(dateInZone("America/Los_Angeles",new Date("2026-11-16T02:00:00.000Z")),"2026-11-15");
});
