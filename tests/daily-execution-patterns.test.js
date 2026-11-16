import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyExecutionPatterns } from "../functions/_lib/daily-execution-patterns.js";

test("groups explicit block outcomes by time of day and weekday",()=>{
 const logs=[
  ...Array.from({length:4},(_,i)=>({block_date:"2026-11-0"+(2+i),start_time:"09:00",planned_minutes:40,status:"done"})),
  ...Array.from({length:4},(_,i)=>({block_date:"2026-11-0"+(2+i),start_time:"10:00",planned_minutes:40,status:"skipped"})),
  ...Array.from({length:4},(_,i)=>({block_date:"2026-11-0"+(2+i),start_time:"14:00",planned_minutes:40,status:"done"}))
 ];
 const result=buildDailyExecutionPatterns(logs);
 assert.equal(result.sample_size,12);
 assert.equal(result.by_period.find(row=>row.period==="Утро").sample_size,8);
 assert.ok(result.by_weekday.length>0);
 assert.equal(result.notable[0].type,"time_of_day");
});
test("does not infer a pattern from small samples or invalid outcomes",()=>{
 const result=buildDailyExecutionPatterns([{block_date:"2026-11-02",start_time:"09:00",planned_minutes:30,status:"skipped"}]);
 assert.equal(result.notable.length,0);
 assert.equal(result.sample_size,1);
});
test("does not treat skipped or interrupted blocks as completed",()=>{
 const result=buildDailyExecutionPatterns([
  {block_date:"2026-11-02",start_time:"09:00",planned_minutes:30,status:"interrupted"},
  {block_date:"2026-11-02",start_time:"10:00",planned_minutes:30,status:"skipped"}
 ]);
 assert.equal(result.overall.completed,0);
 assert.equal(result.overall.completion_rate,0);
});

test("compares execution outcomes by project and income area without inventing task categories",()=>{
 const logs=[
  {block_date:"2026-11-02",start_time:"09:00",planned_minutes:30,actual_minutes:45,status:"done",area_key:"project:p1",area_title:"Решай360",area_type:"project"},
  {block_date:"2026-11-03",start_time:"10:00",planned_minutes:30,actual_minutes:35,status:"done",area_key:"project:p1",area_title:"Решай360",area_type:"project"},
  {block_date:"2026-11-04",start_time:"11:00",planned_minutes:30,actual_minutes:0,status:"skipped",area_key:"direction:d1",area_title:"Автоматизация",area_type:"income"}
 ];
 const result=buildDailyExecutionPatterns(logs);
 const project=result.by_area.find(row=>row.key==="project:p1");
 assert.equal(project.sample_size,2);
 assert.equal(project.completion_rate,100);
 assert.equal(project.median_actual_to_planned,1.33);
 const direction=result.by_area.find(row=>row.key==="direction:d1");
 assert.equal(direction.completion_rate,0);
});
