import test from "node:test";
import assert from "node:assert/strict";
import { isMorningDeliveryWindow, localClock } from "../workers/morning-push/index.js";

test("morning push window follows the user's timezone",()=>{
  assert.equal(isMorningDeliveryWindow(new Date("2026-11-15T03:00:00.000Z"),"Europe/Moscow"),true);
  assert.equal(isMorningDeliveryWindow(new Date("2026-11-15T03:00:00.000Z"),"Europe/Amsterdam"),false);
});

test("delivery retry window includes 06:00 through 06:10, not later minutes",()=>{
  assert.equal(isMorningDeliveryWindow(new Date("2026-11-15T03:00:00.000Z"),"Europe/Moscow"),true);
  assert.equal(isMorningDeliveryWindow(new Date("2026-11-15T03:10:00.000Z"),"Europe/Moscow"),true);
  assert.equal(isMorningDeliveryWindow(new Date("2026-11-15T03:11:00.000Z"),"Europe/Moscow"),false);
  assert.equal(isMorningDeliveryWindow(new Date("2026-11-15T04:00:00.000Z"),"Europe/Moscow"),false);
});

test("local clock respects daylight-saving offsets",()=>{
  const before=new Date("2026-10-25T00:30:00.000Z");
  const after=new Date("2026-10-25T01:30:00.000Z");
  assert.equal(localClock(before,"Europe/Amsterdam").hour,"02");
  assert.equal(localClock(after,"Europe/Amsterdam").hour,"02");
});
