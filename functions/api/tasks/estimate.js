import { findSimilarTaskHistory } from "../../_lib/similar-task-history.js";
import { json, requireUser, readJson } from "../../_lib/auth.js";

function fallbackEstimate(title, description) {
  const text = (title + " " + description).toLowerCase();
  let minutes = 30;
  if (/создать|разработать|реализовать|настроить|автоматизац|интеграц|сайт|приложени|исследован|аудит/.test(text)) minutes = 120;
  else if (/проанализ|сравнить|подготовить|разобрать|спроектировать|написать|составить/.test(text)) minutes = 60;
  else if (/позвонить|ответить|отправить|оплатить|проверить|согласовать/.test(text)) minutes = 20;
  else if (/найти|выбрать|изучить|прочитать/.test(text)) minutes = 45;
  if (text.length > 240) minutes += 30;
  return { minutes, range_min: Math.max(10, Math.round(minutes * 0.75 / 5) * 5), range_max: Math.round(minutes * 1.5 / 5) * 5,
    rationale: "Предварительная оценка по типу и формулировке задачи. После нескольких выполненных задач её можно будет уточнять по фактическому времени.",
    delegation: "partial", delegation_reason: "ИИ может подготовить план, черновик или анализ, но результат потребуется проверить и принять.", steps: [] };
}

function extractJson(value) {
  if (typeof value !== "string") return value;
  const cleaned = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); } catch { return null; }
}

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request);
  const title = String(body?.title || "").trim();
  const description = String(body?.description || "").trim();
  if (!title || title.length > 240 || description.length > 2000) return json({ error: "Укажите задачу и краткое описание (до 2000 символов)" }, 400);

  const scope = {
    project_id: body?.project_id ? String(body.project_id) : null,
    life_area_id: body?.life_area_id ? String(body.life_area_id) : null,
    direction_id: body?.direction_id ? String(body.direction_id) : null
  };
  let similarTaskHistory = null;
  try {
    const { results: history } = await env.DB.prepare(`
      SELECT t.title,t.description,t.status,t.estimated_minutes,t.actual_minutes,t.project_id,t.life_area_id,
        COALESCE(t.direction_id,p.direction_id,c.direction_id) AS direction_id
      FROM tasks t
      LEFT JOIN projects p ON p.id=t.project_id AND p.user_id=t.user_id
      LEFT JOIN clients c ON c.id=t.client_id AND c.user_id=t.user_id
      WHERE t.user_id=? AND t.status='done' AND t.completed_at>=datetime('now','-180 days')
        AND t.estimated_minutes IS NOT NULL AND t.actual_minutes IS NOT NULL
      ORDER BY t.completed_at DESC LIMIT 300
    `).bind(user.id).all();
    similarTaskHistory = findSimilarTaskHistory({ title, description, history, scope });
  } catch {
    similarTaskHistory = null;
  }
  const withSimilarHistory = payload => ({ ...payload, ...(similarTaskHistory ? { similar_task_history: similarTaskHistory } : {}) });
  const fallback = fallbackEstimate(title, description);
  if (!env.AI) return json(withSimilarHistory({ ...fallback, source: "heuristic", note: "AI binding пока не подключён. Это ориентировочная алгоритмическая оценка." }));

  try {
    const response = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
      messages: [
        { role: "system", content: "Ты помощник по планированию работы. Оцени задачу реалистично для одного человека. Не завышай точность. Верни только JSON без markdown: {minutes: integer, range_min: integer, range_max: integer, rationale: string, delegation: 'full'|'partial'|'manual', delegation_reason: string, steps: [{title: string, minutes: integer}]}. minutes — рабочее время активного выполнения, без ожидания ответов. Разбивай на 2-5 шагов только если задача действительно крупная. delegation=full только если ИИ может подготовить готовый результат без внешних действий и решений пользователя; partial если может сделать существенную часть; manual если нужен человек/внешнее действие." },
        { role: "user", content: "Задача: " + title + (description ? "\nКонтекст: " + description : "") }
      ],
      max_tokens: 500,
      temperature: 0.2
    });
    const parsed = extractJson(response?.response);
    const minutes = Math.round(Number(parsed?.minutes));
    if (!parsed || !Number.isFinite(minutes) || minutes < 5 || minutes > 10000 || !["full","partial","manual"].includes(parsed.delegation)) throw new Error("Invalid AI response");
    const steps = Array.isArray(parsed.steps) ? parsed.steps.slice(0,5).map(step => ({
      title: String(step.title || "").slice(0,160), minutes: Math.max(5, Math.min(10000, Math.round(Number(step.minutes) || 5)))
    })) : [];
    return json(withSimilarHistory({
      minutes,
      range_min: Math.max(5, Math.round(Number(parsed.range_min) || minutes * 0.75)),
      range_max: Math.max(minutes, Math.round(Number(parsed.range_max) || minutes * 1.5)),
      rationale: String(parsed.rationale || "").slice(0,500),
      delegation: parsed.delegation,
      delegation_reason: String(parsed.delegation_reason || "").slice(0,500),
      steps,
      source: "ai"
    }));
  } catch {
    return json(withSimilarHistory({ ...fallback, source: "heuristic", note: "ИИ временно не ответил. Показана ориентировочная оценка." }));
  }
}
