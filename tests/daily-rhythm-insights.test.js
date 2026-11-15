import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyRhythmInsights } from "../functions/_lib/daily-rhythm-insights.js";

test("groups completed task timer sessions by local day period",()=>{
 const rows=[
  {started_at:"2026-11-10T07:30:00Z",duration_minutes:40},
  {started_at:"2026-11-11T08:00:00Z",duration_minutes:60},
  {started_at:"2026-11-12T13:00:00Z",duration_minutes:30},
  {started_at:"2026-11-13T19:00:00Z",duration_minutes:20},
  {started_at:"2026-11-14T02:00:00Z",duration_minutes:15}
 ];
 const result=buildDailyRhythmInsights(rows,[],"UTC");
 assert.equal(result.work.sample_sessions,5);
 assert.equal(result.work.most_tracked_period,"Утро");
 assert.equal(result.work.total_tracked_minutes,165);
 assert.equal(result.work.confidence,"preliminary");
});
test("does not infer a personal rhythm from too few observations",()=>{
 const result=buildDailyRhythmInsights([{started_at:"2026-11-10T08:00:00Z",duration_minutes:25}],[],"UTC");
 assert.equal(result.work.confidence,"insufficient");
 assert.equal(result.sleep.confidence,"insufficient");
 assert.equal(result.sleep.average_duration_minutes,null);
});
test("calculates sleep duration and averages clock times across midnight",()=>{
 const sleeps=[
  {fell_asleep_at:"2026-11-10T23:00",woke_at:"2026-11-11T07:00",timezone:"UTC"},
  {fell_asleep_at:"2026-11-11T23:30",woke_at:"2026-11-12T07:30",timezone:"UTC"},
  {fell_asleep_at:"2026-11-12T22:30",woke_at:"2026-11-13T06:30",timezone:"UTC"}
 ];
 const result=buildDailyRhythmInsights([],sleeps,"UTC");
 assert.equal(result.sleep.sample_sessions,3);
 assert.equal(result.sleep.average_duration_minutes,480);
 assert.equal(result.sleep.average_bedtime,"23:00");
 assert.equal(result.sleep.average_wake_time,"07:00");
});
test("ignores incomplete and invalid sleep records",()=>{
 const result=buildDailyRhythmInsights([],[{fell_asleep_at:"2026-11-10T23:00",woke_at:null}], "UTC");
 assert.equal(result.sleep.sample_sessions,0);
});
