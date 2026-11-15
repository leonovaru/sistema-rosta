import test from "node:test";
import assert from "node:assert/strict";
import { assessWeeklyTask, attachWeeklyTaskPriority } from "../functions/_lib/weekly-task-priority.js";

test("deadline urgency and priority raise task score",()=>{
 const today="2026-11-15";
 const urgent=assessWeeklyTask({title:"Подготовить стратегию проекта",priority:"high",due_date:"2026-11-15"},today);
 const later=assessWeeklyTask({title:"Позвонить клиенту",priority:"low",due_date:"2026-11-22"},today);
 assert.ok(urgent.priority_score>later.priority_score);
 assert.equal(urgent.urgency_days,0);
 assert.equal(later.urgency_days,7);
});
test("detects likely concentration demand from task wording",()=>{
 assert.equal(assessWeeklyTask({title:"Разработать архитектуру автоматизации"}, "2026-11-15").cognitive_load,"high");
 assert.equal(assessWeeklyTask({title:"Позвонить клиенту"}, "2026-11-15").cognitive_load,"low");
 assert.equal(assessWeeklyTask({title:"Встреча"}, "2026-11-15").cognitive_load,"medium");
});
test("marks overdue tasks as most urgent",()=>{
 const result=assessWeeklyTask({title:"Отправить документ",priority:"low",due_date:"2026-11-10"},"2026-11-15");
 assert.equal(result.urgency_days,-5);
 assert.equal(result.priority_label,"Низкий");
});
test("attaches ranking to daily allocations without changing time or task data",()=>{
 const week={days:[{date:"2026-11-15",tasks:[{id:"1",title:"Позвонить",minutes:20,due_date:"2026-11-15",priority:"high"}]}]};
 attachWeeklyTaskPriority(week,[{id:"1",title:"Позвонить клиенту",description:"",status:"todo",priority:"high",due_date:"2026-11-15"}],"2026-11-15");
 assert.equal(week.days[0].tasks[0].cognitive_load,"low");
 assert.equal(week.days[0].tasks[0].minutes,20);
 assert.equal(week.priority_overview[0].id,"1");
});
