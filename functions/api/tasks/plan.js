import { json, requireUser, readJson, newId } from "../../_lib/auth.js";

function parseJson(value) {
  if (typeof value !== "string") return value;
  const clean = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(clean); } catch { return null; }
}

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  if (!env.AI) return json({ error: "Для создания плана подключи Workers AI binding AI." }, 503);
  const body = await readJson(request);
  const taskId = String(body?.task_id || "");
  if (!taskId) return json({ error: "Не выбрана задача" }, 400);
  const task = await env.DB.prepare("SELECT id,title,description FROM tasks WHERE id=? AND user_id=?").bind(taskId,user.id).first();
  if (!task) return json({ error: "Задача не найдена" }, 404);
  try {
    const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: "Разбей задачу на 2–8 конкретных выполнимых шагов. Каждый шаг должен начинаться с действия и иметь проверяемый результат. Не включай абстрактные советы. Оцени активное рабочее время в минутах. Верни только JSON вида {steps:[{title:string,minutes:integer}]}. Не придумывай, что уже выполнил шаги. Ответ на русском." },
        { role: "user", content: "Задача: " + task.title + (task.description ? "\nКонтекст: " + task.description : "") }
      ],
      max_tokens: 700,
      temperature: 0.2
    });
    const parsed = parseJson(response?.response);
    if (!Array.isArray(parsed?.steps) || parsed.steps.length < 1) throw new Error("Invalid plan");
    const steps = parsed.steps.slice(0,8).map((step,index) => ({
      id: newId(),
      task_id: task.id,
      user_id: user.id,
      title: String(step?.title || "").trim().slice(0,180),
      estimated_minutes: Math.max(5,Math.min(10000,Math.round(Number(step?.minutes)||15))),
      sort_order: index
    })).filter(step => step.title);
    if (!steps.length) throw new Error("Empty plan");
    const statements = [
      env.DB.prepare("DELETE FROM task_steps WHERE task_id=? AND user_id=?").bind(task.id,user.id),
      ...steps.map(step => env.DB.prepare("INSERT INTO task_steps (id,task_id,user_id,title,estimated_minutes,sort_order) VALUES (?,?,?,?,?,?)").bind(step.id,step.task_id,step.user_id,step.title,step.estimated_minutes,step.sort_order))
    ];
    await env.DB.batch(statements);
    return json({ ok: true, steps });
  } catch {
    return json({ error: "Не удалось составить план задачи. Попробуй ещё раз." }, 502);
  }
}
