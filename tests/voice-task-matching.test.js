import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTaskTitle, taskSimilarity } from "../functions/api/tasks/voice-intake.js";

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
