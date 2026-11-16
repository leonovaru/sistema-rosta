import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTaskTitle, taskSimilarity, appendTaskDescription, buildProjectContext } from "../functions/api/tasks/voice-intake.js";

test("normalizes Russian task titles including ё, punctuation and case", () => {
  assert.equal(normalizeTaskTitle("Проверить Ёлку — Решай360!"), "проверить елку решай360");
});

test("detects identical and near-identical task titles", () => {
  assert.equal(taskSimilarity("Проверить диагностику Решай360", "проверить диагностику решай360"), 1);
  assert.ok(taskSimilarity("Подготовить отчёт для клиента", "Подготовить отчет для клиента") >= 0.99);
});

test("does not treat unrelated or only vaguely similar titles as duplicates", () => {
  assert.equal(taskSimilarity("Купить корм котам", "Подготовить отчёт клиенту"), 0);
  assert.ok(taskSimilarity("Проверить сайт", "Обновить список задач") < 0.85);
});

test("appends dictated details without deleting or duplicating existing description", () => {
  assert.equal(appendTaskDescription("Сверить главную страницу", "Добавить проверку мобильной версии"), "Сверить главную страницу\n\nДобавить проверку мобильной версии");
  assert.equal(appendTaskDescription("Проверить оплату", "Проверить оплату"), "Проверить оплату");
  assert.equal(appendTaskDescription("", "Новый контекст"), "Новый контекст");
});

test("builds bounded project context with open tasks and their checklist steps", () => {
  const projects = [{id:"p1",title:"Сайт клиента",description:"Обновить сайт",expected_result:"Готовый сайт",status:"active"}];
  const tasks = [
    {id:"t1",project_id:"p1",title:"Проверить главную",status:"doing",priority:"high"},
    {id:"t2",project_id:"p1",title:"Настроить форму",status:"todo",priority:"medium"},
    {id:"t3",project_id:"p2",title:"Посторонняя задача",status:"todo"}
  ];
  const steps = [{task_id:"t1",title:"Проверить мобильную версию",status:"todo"}];
  const result = buildProjectContext(projects,tasks,steps);
  assert.equal(result.length,1);
  assert.equal(result[0].open_task_count,2);
  assert.equal(result[0].open_tasks[0].steps[0].title,"Проверить мобильную версию");
  assert.equal(result[0].open_tasks[1].steps.length,0);
});
