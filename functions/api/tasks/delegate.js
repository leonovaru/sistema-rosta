import { json, requireUser, readJson } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  if (!env.AI) return json({ error: "Для выполнения задач нужно подключить Workers AI binding с именем AI." }, 503);
  const body = await readJson(request);
  const title = String(body?.title || "").trim();
  const description = String(body?.description || "").trim();
  if (!title || title.length > 240 || description.length > 2000) return json({ error: "Укажите задачу и контекст (до 2000 символов)" }, 400);
  try {
    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: "Ты исполнитель задач и аналитический помощник. Выполни поручение настолько полно, насколько возможно в текстовом формате. Создавай готовый результат, а не советы о том, как его сделать. Если не хватает критически важных данных, явно перечисли допущения и задай конкретные вопросы в конце. Не утверждай, что выполнял действия во внешних системах, не создавай фиктивные факты, ссылки или результаты проверок. Ответ на русском языке, структурированный и пригодный для дальнейшего использования." },
        { role: "user", content: "Поручение: " + title + (description ? "\nКонтекст и требования: " + description : "") }
      ],
      max_tokens: 1800,
      temperature: 0.3
    });
    const output = String(result?.response || "").trim();
    if (!output) throw new Error("Empty AI response");
    return json({ ok: true, result: output.slice(0,12000) });
  } catch {
    return json({ error: "Не удалось выполнить поручение через ИИ. Попробуй ещё раз позже." }, 502);
  }
}
