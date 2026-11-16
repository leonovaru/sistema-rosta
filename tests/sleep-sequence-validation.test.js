import test from "node:test";
import assert from "node:assert/strict";
import { isValidSleepSequence } from "../functions/_lib/sleep.js";

test("sleep sequence validates all recorded timestamps, including bed and wake without asleep time",()=>{
  assert.equal(isValidSleepSequence([
    {value:"2026-11-16T22:00",timezone:"Europe/Moscow"},
    {value:null,timezone:"Europe/Moscow"},
    {value:"2026-11-17T06:00",timezone:"Europe/Moscow"}
  ]),true);
  assert.equal(isValidSleepSequence([
    {value:"2026-11-17T08:00",timezone:"Europe/Moscow"},
    {value:null,timezone:"Europe/Moscow"},
    {value:"2026-11-17T06:00",timezone:"Europe/Moscow"}
  ]),false);
});

test("sleep sequence preserves chronological order across different timezones",()=>{
  assert.equal(isValidSleepSequence([
    {value:"2026-11-16T22:00",timezone:"Europe/Moscow"},
    {value:"2026-11-16T21:30",timezone:"Europe/Amsterdam"},
    {value:"2026-11-17T05:00",timezone:"Europe/Amsterdam"}
  ]),true);
});

test("sleep sequence rejects ambiguous daylight-saving wall times",()=>{
  assert.equal(isValidSleepSequence([
    {value:"2026-10-25T02:30",timezone:"Europe/Amsterdam"},
    {value:"2026-10-25T07:00",timezone:"Europe/Amsterdam"}
  ]),false);
});
