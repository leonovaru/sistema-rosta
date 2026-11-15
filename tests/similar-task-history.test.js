import test from "node:test";
import assert from "node:assert/strict";
import { findSimilarTaskHistory } from "../functions/_lib/similar-task-history.js";

const history = [
 {title:"Подготовить аудит Google Таблицы",description:"Проверить формулы и структуру",status:"done",estimated_minutes:60,actual_minutes:90,direction_id:"d1"},
 {title:"Провести аудит таблицы продаж",description:"Проверить формулы и ошибки",status:"done",estimated_minutes:60,actual_minutes:120,direction_id:"d1"},
 {title:"Аудит таблицы расходов",description:"Проверить структуру и формулы",status:"done",estimated_minutes:30,actual_minutes:45,direction_id:"d1"},
 {title:"Убрать квартиру",description:"Купить продукты",status:"done",estimated_minutes:30,actual_minutes:30,life_area_id:"home"}
];

test("finds similar completed tasks and returns a robust median multiplier",()=>{
 const result=findSimilarTaskHistory({title:"Провести аудит Google таблицы",description:"Проверить формулы",history,scope:{direction_id:"d1"}});
 assert.equal(result.sample_count,3);
 assert.equal(result.multiplier,1.5);
 assert.equal(result.confidence,"preliminary");
});
test("uses scope filtering before similarity matching",()=>{
 const result=findSimilarTaskHistory({title:"Провести аудит Google таблицы",history,scope:{life_area_id:"home"}});
 assert.equal(result.sample_count,0);
 assert.equal(result.multiplier,null);
});
test("does not recommend a multiplier with fewer than three similar tasks",()=>{
 const result=findSimilarTaskHistory({title:"Провести аудит Google таблицы",history:history.slice(0,2),scope:{direction_id:"d1"}});
 assert.equal(result.sample_count,2);
 assert.equal(result.multiplier,null);
});
test("returns no matches for unrelated or empty task descriptions",()=>{
 const result=findSimilarTaskHistory({title:"Позвонить курьеру",history,scope:{}});
 assert.equal(result.sample_count,0);
 assert.equal(result.examples.length,0);
});
