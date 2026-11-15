import test from "node:test";
import assert from "node:assert/strict";

function durationMinutes(start,end){
  if(!start||!end)return null;
  const a=new Date(start),b=new Date(end);
  if(!Number.isFinite(a.getTime())||!Number.isFinite(b.getTime())||b<=a)return null;
  return Math.round((b-a)/60000);
}
test("sleep duration is calculated only when both timestamps are known",()=>{
  assert.equal(durationMinutes(null,"2026-11-15T07:00"),null);
  assert.equal(durationMinutes("2026-11-14T23:30","2026-11-15T07:00"),450);
});
test("invalid or reversed sleep interval is not reported as duration",()=>{
  assert.equal(durationMinutes("bad","2026-11-15T07:00"),null);
  assert.equal(durationMinutes("2026-11-15T08:00","2026-11-15T07:00"),null);
});
