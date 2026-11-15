import test from "node:test";
import assert from "node:assert/strict";
import { attachWeeklyActualTime } from "../functions/_lib/weekly-actual-time.js";
const week=()=>({from:"2026-11-16",to:"2026-11-22",area_balance:[{key:"direction:d1",title:"Автоматизация",type:"income",weekly_estimated_minutes:120,target_minutes:180},{key:"life:home",title:"Дом",type:"personal",weekly_estimated_minutes:30,target_minutes:null}]});
test("adds completed timer time to the correct direction and compares it with the target",()=>{
 const result=attachWeeklyActualTime(week(),[{started_at:"2026-11-16T08:00:00.000Z",duration_minutes:90,direction_id:"d1",direction_title:"Автоматизация"},{started_at:"2026-11-17T08:00:00.000Z",duration_minutes:30,direction_id:"d1"}],"Europe/Moscow");
 const row=result.area_balance.find(x=>x.key==="direction:d1");
 assert.equal(row.actual_minutes,120);assert.equal(row.actual_sessions,2);assert.equal(row.actual_target_gap_minutes,60);
 assert.equal(result.actual_time.tracked_minutes,120);assert.equal(result.actual_time.sessions,2);
});
test("attributes a project session to its explicitly targeted project, not its direction",()=>{
 const result=attachWeeklyActualTime(week(),[{started_at:"2026-11-16T08:00:00.000Z",duration_minutes:45,project_id:"p1",project_title:"Решай360",direction_id:"d1",direction_title:"Репетиторство"}],"Europe/Moscow",[{project_id:"p1"}]);
 assert.equal(result.area_balance.find(x=>x.key==="project:p1").actual_minutes,45);
 assert.equal(result.area_balance.find(x=>x.key==="direction:d1").actual_minutes,0);
});
test("uses the user's local start day and ignores sessions outside the week or without duration",()=>{
 const result=attachWeeklyActualTime(week(),[
  {started_at:"2026-11-15T22:30:00.000Z",duration_minutes:20,life_area_id:"home"},
  {started_at:"2026-11-22T20:30:00.000Z",duration_minutes:40,life_area_id:"home"},
  {started_at:"2026-11-18T08:00:00.000Z",duration_minutes:null,life_area_id:"home"}
 ],"Europe/Moscow");
 assert.equal(result.actual_time.tracked_minutes,60);
 assert.equal(result.area_balance.find(x=>x.key==="life:home").actual_minutes,60);
});
test("does not fabricate actual time for categories with no timer entries",()=>{
 const result=attachWeeklyActualTime(week(),[]);
 assert.equal(result.area_balance.find(x=>x.key==="life:home").actual_minutes,0);
 assert.equal(result.actual_time.sessions,0);
});
