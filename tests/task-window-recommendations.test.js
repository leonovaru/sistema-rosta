import test from "node:test";
import assert from "node:assert/strict";
import { buildTaskWindowRecommendations } from "../functions/_lib/task-window-recommendations.js";

test("matches only unallocated task time to remaining uninterrupted windows",()=>{
 const [day]=buildTaskWindowRecommendations([{date:"2026-11-16",tasks:[
  {id:"later",title:"Подготовить обзор",minutes:45,priority_score:40,priority_label:"Средний",due_date:"2026-11-21"},
  {id:"urgent",title:"Отправить договор",minutes:30,priority_score:90,priority_label:"Высокий",due_date:"2026-11-16"}
 ],unallocated:[{task_id:"urgent",title:"Отправить договор",minutes:30},{task_id:"later",title:"Подготовить обзор",minutes:45}],blocks:[],free_windows:[
  {start_time:"09:00",end_time:"09:40",minutes:40},
  {start_time:"13:00",end_time:"14:00",minutes:60}
 ]}],null,[{date:"2026-11-16",working_day:true,tasks:[{id:"later",title:"Подготовить обзор",minutes:45,priority_score:40,priority_label:"Средний",due_date:"2026-11-21"},{id:"urgent",title:"Отправить договор",minutes:30,priority_score:90,priority_label:"Высокий",due_date:"2026-11-16"}]}]);
 assert.equal(day.task_window_recommendations.length,2);
 assert.equal(day.task_window_recommendations[0].task_id,"urgent");
 assert.equal(day.task_window_recommendations[0].start_time,"09:00");
 assert.equal(day.task_window_recommendations[1].task_id,"later");
 assert.equal(day.task_window_recommendations[1].start_time,"13:00");
 assert.equal(day.task_window_recommendations.every(item=>item.requires_confirmation),true);
 assert.match(day.task_window_recommendations[0].reasons.join(" "),/срок сегодня/);
});

test("prefers periods with better completion history when evidence is sufficient",()=>{
 const [day]=buildTaskWindowRecommendations([{date:"2026-11-16",tasks:[{id:"deep",title:"Сложная задача",minutes:60,priority_score:50,due_date:"2026-11-19",cognitive_load:"high"}],unallocated:[{task_id:"deep",title:"Сложная задача",minutes:60}],blocks:[],free_windows:[
  {start_time:"09:00",end_time:"10:10",minutes:70},
  {start_time:"14:00",end_time:"15:10",minutes:70}
 ]}],{overall:{sample_size:12,completion_rate:60},by_period:[
  {period:"Утро",sample_size:6,completion_rate:45},
  {period:"День",sample_size:6,completion_rate:85}
 ]},[{date:"2026-11-16",working_day:true,tasks:[]}]);
 assert.equal(day.task_window_recommendations[0].start_time,"14:00");
 assert.equal(day.task_window_recommendations[0].history_signal,"above_average");
 assert.match(day.task_window_recommendations[0].reasons.join(" "),/85% завершения/);
});

test("does not split a task across windows and explains when no later day fits",()=>{
 const [day]=buildTaskWindowRecommendations([{date:"2026-11-16",tasks:[{id:"long",title:"Большая задача",minutes:90}],unallocated:[{task_id:"long",title:"Большая задача",minutes:90}],blocks:[],free_windows:[
  {start_time:"09:00",end_time:"10:00",minutes:60},
  {start_time:"13:00",end_time:"14:00",minutes:60}
 ]}],null,[{date:"2026-11-16",working_day:true,tasks:[{id:"deep",title:"Сложная задача",minutes:60,priority_score:50,due_date:"2026-11-19",cognitive_load:"high"}]}]);
 assert.equal(day.task_window_recommendations.length,0);
 assert.equal(day.cross_day_task_recommendations.length,0);
 assert.equal(day.unmatched_window_tasks[0].task_id,"long");
 assert.match(day.unmatched_window_tasks[0].reason,/не найдено подходящего свободного окна/);
});

test("keeps the task order selected by the planning scenario",()=>{
 const [day]=buildTaskWindowRecommendations([{date:"2026-11-16",tasks:[
  {id:"priority",title:"Самая приоритетная",minutes:30,priority_score:100},
  {id:"focus",title:"Сложная задача",minutes:45,priority_score:30,cognitive_load:"high"}
 ],unallocated:[{task_id:"focus",title:"Сложная задача",minutes:45},{task_id:"priority",title:"Самая приоритетная",minutes:30}],blocks:[],free_windows:[
  {start_time:"09:00",end_time:"10:00",minutes:60},
  {start_time:"13:00",end_time:"13:40",minutes:40}
 ]}],null,[{date:"2026-11-16",working_day:true,tasks:[]}]);
 assert.equal(day.task_window_recommendations[0].task_id,"focus");
 assert.equal(day.task_window_recommendations[1].task_id,"priority");
});

test("subtracts already planned focus blocks and never recommends fully allocated tasks",()=>{
 const [day]=buildTaskWindowRecommendations([{date:"2026-11-16",tasks:[
  {id:"done",title:"Уже запланирована",minutes:60},
  {id:"left",title:"Остаток",minutes:30}
 ],unallocated:[{task_id:"left",title:"Остаток",minutes:30}],blocks:[
  {type:"focus",task_id:"done",start_time:"09:00",end_time:"10:00",minutes:60}
 ],free_windows:[{start_time:"09:00",end_time:"11:00",minutes:120}]}],null,[{date:"2026-11-16",working_day:true,tasks:[]}]);
 assert.equal(day.task_window_recommendations.length,1);
 assert.equal(day.task_window_recommendations[0].task_id,"left");
 assert.equal(day.task_window_recommendations[0].start_time,"10:00");
});

test("offers the nearest later working day before the deadline for an unallocated task",()=>{
 const [source]=buildTaskWindowRecommendations([
  {date:"2026-11-16",tasks:[{id:"task",title:"Подготовить презентацию",minutes:75,due_date:"2026-11-18"}],unallocated:[{task_id:"task",title:"Подготовить презентацию",minutes:75}],blocks:[],free_windows:[]},
  {date:"2026-11-17",tasks:[],unallocated:[],blocks:[],free_windows:[{start_time:"10:00",end_time:"12:00",minutes:120}]},
  {date:"2026-11-18",tasks:[],unallocated:[],blocks:[],free_windows:[{start_time:"09:00",end_time:"11:00",minutes:120}]}
 ],null,[
  {date:"2026-11-16",working_day:true,tasks:[{id:"task",title:"Сдать отчёт",minutes:60,due_date:"2026-11-17"}]},
  {date:"2026-11-17",working_day:true,tasks:[]},
  {date:"2026-11-18",working_day:true,tasks:[]}
 ]);
 assert.equal(source.cross_day_task_recommendations.length,1);
 assert.equal(source.cross_day_task_recommendations[0].to_date,"2026-11-17");
 assert.equal(source.cross_day_task_recommendations[0].start_time,"10:00");
 assert.equal(source.cross_day_task_recommendations[0].requires_confirmation,true);
});

test("does not move tasks to non-working days or beyond their deadline",()=>{
 const [source]=buildTaskWindowRecommendations([
  {date:"2026-11-16",tasks:[{id:"task",title:"Сдать отчёт",minutes:60,due_date:"2026-11-17"}],unallocated:[{task_id:"task",title:"Сдать отчёт",minutes:60}],blocks:[],free_windows:[]},
  {date:"2026-11-17",tasks:[],unallocated:[],blocks:[],free_windows:[{start_time:"09:00",end_time:"11:00",minutes:120}]},
  {date:"2026-11-18",tasks:[],unallocated:[],blocks:[],free_windows:[{start_time:"09:00",end_time:"11:00",minutes:120}]}
 ],null,[
  {date:"2026-11-16",working_day:true,tasks:[{id:"task",title:"Сдать отчёт",minutes:60,due_date:"2026-11-17"}]},
  {date:"2026-11-17",working_day:false,tasks:[]},
  {date:"2026-11-18",working_day:true,tasks:[]}
 ]);
 assert.equal(source.cross_day_task_recommendations.length,0);
 assert.equal(source.unmatched_window_tasks.length,1);
});
