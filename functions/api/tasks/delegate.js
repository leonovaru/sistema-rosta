import { json, requireUser, readJson } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  if (!env.AI) return json({ error: "Для выполнения задач нужно подключить Workers AI binding с именем AI." }, 503);
  const body = await readJson(request);
  const title = String(body?.title || "").trim();
  const description = String(body?.description || "").trim();
  const taskId = body?.task_id ? String(body.task_id) : null;
  if (!title || title.length > 240 || description.length > 2000) return json({ error: "Укажите задачу и контекст (до 2000 символов)" }, 400);
  if (taskId) {
    const task = await env.DB.prepare("SELECT id FROM tasks WHERE id=? AND user_id=?").bind(taskId,user.id).first();
    if (!task) return json({ error: "Задача не найдена" }, 404);
  }
  try {
    const result = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
      messages: [
        { role: "system", content: "Ты исполнитель задач и аналитический помощник. Выполни поручение настолько полно, насколько возможно в текстовом формате. Создавай готовый результат, а не советы о том, как его сделать. Если не хватает критически важных данных, явно перечисли допущения и задай конкретные вопросы в конце. Не утверждай, что выполнял действия во внешних системах, не создавай фиктивные факты, ссылки или результаты проверок. Не запрашивай пароли, коды доступа и секреты. Ответ на русском языке, структурированный и пригодный для дальнейшего использования." },
        { role: "user", content: "Поручение: " + title + (description ? "\nКонтекст и требования: " + description : "") }
      ],
      max_tokens: 1800,
      temperature: 0.3
    });
    const output = String(result?.response || "").trim();
    if (!output) throw new Error("Empty AI response");
    const clean = output.slice(0,12000);
    if (taskId) {
      await env.DB.prepare("UPDATE tasks SET delegated_result=?,delegated_at=datetime('now') WHERE id=? AND user_id=?").bind(clean,taskId,user.id).run();
    }
    return json({ ok: true, result: clean, saved: Boolean(taskId) });
  } catch {
    return json({ error: "Не удалось выполнить поручение через ИИ. Попробуй ещё раз позже." }, 502);
  }
}
