import test from "node:test";
import assert from "node:assert/strict";
import { validateDailyTaskMove } from "../functions/_lib/daily-task-move-validation.js";

function fixture(targetLoad=30){
 return {days:[
  {date:"2026-11-16",working_day:true,available_minutes:120,planned_task_minutes:60,tasks:[{id:"a",minutes:60}]},
  {date:"2026-11-17",working_day:true,available_minutes:120,planned_task_minutes:targetLoad,tasks:[{id:"b",minutes:targetLoad}]}
 ]};
}
const common={taskId:"a",fromDate:"2026-11-16",toDate:"2026-11-17",minutes:30,startTime:"10:00",endTime:"11:00",rows:[{date:"2026-11-16",minutes:30},{date:"2026-11-17",minutes:30}]};

test("accepts a move when the source allocation is reduced and target day has capacity",()=>{
 assert.deepEqual(validateDailyTaskMove({week:fixture(),...common}),{ok:true});
});
test("rejects a stale source allocation instead of silently replacing it",()=>{
 const result=validateDailyTaskMove({week:fixture(),...common,rows:[{date:"2026-11-16",minutes:60}]});
 assert.equal(result.ok,false);
 assert.match(result.error,/Распределение задачи изменилось/);
});
test("rejects a move that would overload the target workday",()=>{
 const result=validateDailyTaskMove({week:fixture(100),...common});
 assert.equal(result.ok,false);
 assert.match(result.error,/не хватает свободной дневной ёмкости/);
});
test("rejects changes to unrelated task dates",()=>{
 const week=fixture();
 week.days.push({date:"2026-11-18",working_day:true,available_minutes:120,planned_task_minutes:30,tasks:[{id:"a",minutes:30}]});
 const rows=[{date:"2026-11-16",minutes:30},{date:"2026-11-17",minutes:60}];
 const result=validateDailyTaskMove({week,...common,rows});
 assert.equal(result.ok,false);
 assert.match(result.error,/дополнительные даты/);
});
test("rejects a target date that is no longer a working day",()=>{
 const week=fixture();week.days[1].working_day=false;
 const result=validateDailyTaskMove({week,...common});
 assert.equal(result.ok,false);
 assert.match(result.error,/не является рабочим днём/);
});
test("rejects a proposed interval shorter than the moved task remainder",()=>{
 const result=validateDailyTaskMove({week:fixture(),...common,endTime:"10:20"});
 assert.equal(result.ok,false);
 assert.match(result.error,/не подходит по длительности/);
});
