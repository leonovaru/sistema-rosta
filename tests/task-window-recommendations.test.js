import test from "node:test";
import assert from "node:assert/strict";
import { buildTaskWindowRecommendations } from "../functions/_lib/task-window-recommendations.js";

test("matches urgent and high-priority tasks to a fitting uninterrupted window",()=>{
 const [day]=buildTaskWindowRecommendations([{date:"2026-11-16",tasks:[
  {id:"later",title:"Подготовить обзор",minutes:45,priority_score:40,priority_label:"Средний",urgency_days:5,cognitive_load:"medium"},
  {id:"urgent",title:"Отправить договор",minutes:30,priority_score:90,priority_label:"Высокий",urgency_days:0,cognitive_load:"low"}
 ],free_windows:[
  {start_time:"09:00",end_time:"09:40",minutes:40},
  {start_time:"13:00",end_time:"14:00",minutes:60}
 ]}]);
 assert.equal(day.task_window_recommendations.length,2);
 assert.equal(day.task_window_recommendations[0].task_id,"urgent");
 assert.equal(day.task_window_recommendations[0].start_time,"09:00");
 assert.equal(day.task_window_recommendations[1].task_id,"later");
 assert.equal(day.task_window_recommendations[1].start_time,"13:00");
 assert.equal(day.task_window_recommendations.every(item=>item.requires_confirmation),true);
 assert.match(day.task_window_recommendations[0].reasons.join(" "),/срок сегодня/);
});

test("prefers periods with better completion history when evidence is sufficient",()=>{
 const [day]=buildTaskWindowRecommendations([{date:"2026-11-16",tasks:[{id:"deep",title:"Сложная задача",minutes:60,priority_score:50,urgency_days:3,cognitive_load:"high"}],free_windows:[
  {start_time:"09:00",end_time:"10:10",minutes:70},
  {start_time:"14:00",end_time:"15:10",minutes:70}
 ]}],{overall:{sample_size:12,completion_rate:60},by_period:[
  {period:"Утро",sample_size:6,completion_rate:45},
  {period:"День",sample_size:6,completion_rate:85}
 ]});
 assert.equal(day.task_window_recommendations[0].start_time,"14:00");
 assert.equal(day.task_window_recommendations[0].history_signal,"above_average");
 assert.match(day.task_window_recommendations[0].reasons.join(" "),/85% завершения/);
});

test("does not split a task across windows and explains when no window fits",()=>{
 const [day]=buildTaskWindowRecommendations([{date:"2026-11-16",tasks:[{id:"long",title:"Большая задача",minutes:90,priority_score:70}],free_windows:[
  {start_time:"09:00",end_time:"10:00",minutes:60},
  {start_time:"13:00",end_time:"14:00",minutes:60}
 ]}]);
 assert.equal(day.task_window_recommendations.length,0);
 assert.equal(day.unmatched_window_tasks[0].task_id,"long");
 assert.match(day.unmatched_window_tasks[0].reason,/самое длинное — 60 мин/);
});
