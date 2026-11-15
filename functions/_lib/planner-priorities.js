export function orderPlannerTasks(tasks, today) {
  const priority = { high: 3, medium: 2, low: 1 };
  return [...(tasks || [])].filter(task => !task.due_date || task.due_date <= today).sort((a, b) => {
    const doing = Number(b.status === "doing") - Number(a.status === "doing");
    const overdue = Number(Boolean(b.due_date && b.due_date < today)) - Number(Boolean(a.due_date && a.due_date < today));
    const due = (a.due_date || "9999-12-31").localeCompare(b.due_date || "9999-12-31");
    return doing || overdue || due || priority[b.priority] - priority[a.priority];
  });
}

export function normalizePlannerItems(items, tasks, capacity) {
  const byId = new Map((tasks || []).map(task => [task.id, task]));
  const selected = [];
  const seen = new Set();
  const append = (item, forced = false) => {
    const task = byId.get(String(item?.task_id || ""));
    if (!task || seen.has(task.id)) return;
    const estimate = Math.max(5, Math.round(Number(task.estimated_minutes) || 30));
    const proposed = Math.round(Number(item.minutes) || estimate);
    const minutes = Math.max(5, Math.min(estimate + Math.ceil(estimate * 0.25), proposed));
    selected.push({
      task_id: task.id,
      title: task.title,
      minutes,
      reason: String(item.reason || (forced ? "Продолжить начатую задачу" : "Приоритет на сегодня")).slice(0, 240)
    });
    seen.add(task.id);
  };
  for (const task of tasks || []) {
    if (task.status === "doing") append({ task_id: task.id, minutes: task.estimated_minutes, reason: "Продолжить начатую задачу" }, true);
  }
  for (const item of items || []) append(item);
  let used = 0;
  return selected.filter(item => {
    if (used + item.minutes > capacity) return false;
    used += item.minutes;
    return true;
  }).slice(0, 7);
}
