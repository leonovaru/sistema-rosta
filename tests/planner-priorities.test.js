import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlannerItems, orderPlannerTasks } from "../functions/_lib/planner-priorities.js";

test("keeps in-progress and overdue tasks ahead of later work", () => {
  const tasks = [
    { id: "future", status: "todo", due_date: "2026-11-20", priority: "high" },
    { id: "today", status: "todo", due_date: "2026-11-15", priority: "medium" },
    { id: "overdue", status: "todo", due_date: "2026-11-10", priority: "low" },
    { id: "doing", status: "doing", due_date: null, priority: "medium" }
  ];
  assert.deepEqual(orderPlannerTasks(tasks, "2026-11-15").map(task => task.id), ["doing", "overdue", "today"]);
});

test("forces unfinished in-progress tasks into the plan and removes duplicate ids", () => {
  const tasks = [
    { id: "doing", title: "Начатая", status: "doing", estimated_minutes: 40 },
    { id: "todo", title: "Новая", status: "todo", estimated_minutes: 30 }
  ];
  const items = normalizePlannerItems([{ task_id: "todo", minutes: 30 }, { task_id: "doing", minutes: 40 }], tasks, 90);
  assert.deepEqual(items.map(item => item.task_id), ["doing", "todo"]);
  assert.equal(items.filter(item => item.task_id === "doing").length, 1);
});

test("caps AI duration at 125 percent of the estimate", () => {
  const tasks = [{ id: "a", title: "Задача", status: "todo", estimated_minutes: 40 }];
  const [item] = normalizePlannerItems([{ task_id: "a", minutes: 500 }], tasks, 100);
  assert.equal(item.minutes, 50);
});

test("does not exceed available capacity and ignores unknown task ids", () => {
  const tasks = [
    { id: "a", title: "A", status: "todo", estimated_minutes: 60 },
    { id: "b", title: "B", status: "todo", estimated_minutes: 60 }
  ];
  const items = normalizePlannerItems([{ task_id: "missing", minutes: 20 }, { task_id: "a", minutes: 60 }, { task_id: "b", minutes: 60 }], tasks, 60);
  assert.deepEqual(items.map(item => item.task_id), ["a"]);
});

test("excludes waiting tasks from the daily plan", () => {
  const tasks = [
    { id: "todo", title: "Можно делать", status: "todo", priority: "medium" },
    { id: "doing", title: "Уже начата", status: "doing", priority: "low" },
    { id: "waiting", title: "Ждём клиента", status: "waiting", priority: "high" }
  ];
  assert.deepEqual(orderPlannerTasks(tasks, "2026-11-15").map(task => task.id), ["doing", "todo"]);
  const normalized = normalizePlannerItems([
    { task_id: "waiting", minutes: 30 },
    { task_id: "todo", minutes: 30 }
  ], tasks, 90);
  assert.deepEqual(normalized.map(item => item.task_id), ["todo"]);
});

test("does not force a task marked waiting into the plan", () => {
  const tasks = [{ id: "waiting", title: "Ожидает ответа", status: "waiting", estimated_minutes: 45 }];
  assert.deepEqual(normalizePlannerItems([], tasks, 120), []);
});
