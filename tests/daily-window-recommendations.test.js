import test from "node:test";
import assert from "node:assert/strict";
import { annotateDailyWindowRecommendations } from "../functions/_lib/daily-window-recommendations.js";

test("labels uninterrupted windows by duration and historical completion evidence",()=>{
 const plans=[{date:"2026-11-16",free_windows:[
  {start_time:"09:00",end_time:"10:40",minutes:100,suggested_use:"Длинная задача без переключений"},
  {start_time:"13:00",end_time:"13:40",minutes:40,suggested_use:"Задача средней длительности"},
  {start_time:"16:00",end_time:"16:20",minutes:20,suggested_use:"Короткие задачи"}
 ]}];
 const patterns={overall:{sample_size:12,completion_rate:60},by_period:[
  {period:"Утро",sample_size:6,completion_rate:85},
  {period:"День",sample_size:5,completion_rate:40}
 ]};
 const [day]=annotateDailyWindowRecommendations(plans,patterns);
 assert.equal(day.free_windows[0].history_signal,"above_average");
 assert.equal(day.free_windows[0].observed_completion_rate,85);
 assert.match(day.free_windows[0].recommendation,/сложной задачи/);
 assert.equal(day.free_windows[1].history_signal,"below_average");
 assert.equal(day.free_windows[2].recommendation,"Лучше оставить для коротких задач и организационных дел");
});
test("does not draw historical conclusions from small samples",()=>{
 const [day]=annotateDailyWindowRecommendations([{free_windows:[{start_time:"09:00",end_time:"10:40",minutes:100}]}],{overall:{sample_size:7,completion_rate:80},by_period:[{period:"Утро",sample_size:3,completion_rate:100}]});
 assert.equal(day.free_windows[0].history_signal,"insufficient");
 assert.equal(day.free_windows[0].observed_completion_rate,null);
});
