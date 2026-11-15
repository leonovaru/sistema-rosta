import test from "node:test";
import assert from "node:assert/strict";
import { buildRecoveryInsights } from "../functions/_lib/recovery-insights.js";

test("summarizes completed timer sessions and long-session counts",()=>{
 const entries=[25,50,90,120,150].map((minutes,index)=>({started_at:"2026-11-0"+(index+1)+"T08:00:00Z",ended_at:"2026-11-0"+(index+1)+"T08:00:00Z",duration_minutes:minutes}));
 const result=buildRecoveryInsights(entries,"UTC");
 assert.equal(result.sample_sessions,5);
 assert.equal(result.median_session_minutes,90);
 assert.equal(result.longest_session_minutes,150);
 assert.equal(result.sessions_over_90_minutes,2);
 assert.equal(result.sessions_over_120_minutes,1);
 assert.equal(result.confidence,"preliminary");
});
test("does not overstate conclusions with sparse data",()=>{
 const result=buildRecoveryInsights([{started_at:"2026-11-01T08:00:00Z",ended_at:"2026-11-01T09:00:00Z",duration_minutes:60}],"UTC");
 assert.equal(result.confidence,"insufficient");
 assert.match(result.guidance,/мало завершённых сессий/);
});
test("ignores incomplete or zero-length entries",()=>{
 const result=buildRecoveryInsights([
  {started_at:"2026-11-01T08:00:00Z",ended_at:null,duration_minutes:200},
  {started_at:"2026-11-02T08:00:00Z",ended_at:"2026-11-02T08:00:00Z",duration_minutes:0}
 ],"UTC");
 assert.equal(result.sample_sessions,0);
 assert.equal(result.longest_session_minutes,null);
});
test("provides a non-binding break rule and clear caveats",()=>{
 const result=buildRecoveryInsights([],"Europe/Moscow");
 assert.deepEqual(result.break_rule,{focus_minutes:50,break_minutes:10,optional_short_break_minutes:5});
 assert.ok(result.notes.some(note=>note.includes("непрерывную концентрацию")));
 assert.ok(result.notes.some(note=>note.includes("автоматически")));
});
