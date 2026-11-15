import { json, requireUser, readJson, newId } from "../_lib/auth.js";

async function invalidateTodayPlan(env, userId) {
  const settings = await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(userId).first();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone:settings?.timezone || "Europe/Moscow", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const today = values.year + "-" + values.month + "-" + values.day;
  await env.DB.prepare("DELETE FROM daily_plans WHERE user_id=? AND plan_date=?").bind(userId, today).run();
}

async function owned(env, table, id, userId) {
  if (!id) return true;
  return Boolean(await env.DB.prepare(`SELECT id FROM ${table} WHERE id=? AND user_id=?`).bind(id,userId).first());
}

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const { results } = await env.DB.prepare(`
    SELECT t.*, d.title AS direction_title, c.name AS client_name,
      p.title AS project_title, a.title AS life_area_title, pt.title AS parent_task_title
    FROM tasks t
    LEFT JOIN directions d ON d.id=t.direction_id
    LEFT JOIN clients c ON c.id=t.client_id AND c.user_id=t.user_id
    LEFT JOIN projects p ON p.id=t.project_id AND p.user_id=t.user_id
    LEFT JOIN life_areas a ON a.id=t.life_area_id AND a.user_id=t.user_id
    LEFT JOIN tasks pt ON pt.id=t.parent_task_id AND pt.user_id=t.user_id
    WHERE t.user_id=?
    ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END,
      t.due_date IS NULL,t.due_date,t.created_at DESC
  `).bind(user.id).all();
  const { results: steps } = await env.DB.prepare("SELECT id,task_id,title,estimated_minutes,status,sort_order FROM task_steps WHERE user_id=? ORDER BY task_id,sort_order").bind(user.id).all();
  const byTask = new Map();
  for (const step of steps) {
    if (!byTask.has(step.task_id)) byTask.set(step.task_id, []);
    byTask.get(step.task_id).push(step);
  }
  return json({ tasks: results.map(task => ({ ...task, steps: byTask.get(task.id) || [] })) });
}

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request);
  const title = String(body?.title || "").trim();
  const description = String(body?.description || "").trim().slice(0,2000);
  if (!title || title.length > 240) return json({ error: "Введите название задачи (до 240 символов)" }, 400);
  const directionId = body?.direction_id ? String(body.direction_id) : null;
  const clientId = body?.client_id ? String(body.client_id) : null;
  const projectId = body?.project_id ? String(body.project_id) : null;
  const lifeAreaId = body?.life_area_id ? String(body.life_area_id) : null;
  const parentTaskId = body?.parent_task_id ? String(body.parent_task_id) : null;
  const dueDate = body?.due_date ? String(body.due_date) : null;
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return json({ error: "Проверьте срок задачи" }, 400);
  const estimated = body?.estimated_minutes == null ? null : Math.round(Number(body.estimated_minutes));
  if (estimated !== null && (!Number.isInteger(estimated) || estimated < 5 || estimated > 10000)) return json({ error: "Проверьте оценку времени" }, 400);
  for (const [table,id,label] of [["directions",directionId,"Направление"],["clients",clientId,"Клиент"],["projects",projectId,"Проект"],["life_areas",lifeAreaId,"Личная область"],["tasks",parentTaskId,"Родительская задача"]]) {
    if (!(await owned(env,table,id,user.id))) return json({ error: label+" не найдены" },404);
  }
  if (projectId) {
    const project=await env.DB.prepare("SELECT client_id,direction_id FROM projects WHERE id=? AND user_id=?").bind(projectId,user.id).first();
    if ((clientId && clientId!==project.client_id) || (directionId && directionId!==project.direction_id)) return json({error:"Клиент и направление должны соответствовать выбранному проекту"},400);
  }
  let inherited = null;
  if (parentTaskId) {
    inherited=await env.DB.prepare("SELECT id,project_id,life_area_id,client_id,direction_id FROM tasks WHERE id=? AND user_id=?").bind(parentTaskId,user.id).first();
    if (!inherited) return json({error:"Родительская задача не найдена"},404);
    if ((projectId && projectId!==inherited.project_id) || (lifeAreaId && lifeAreaId!==inherited.life_area_id) || (clientId && clientId!==inherited.client_id) || (directionId && directionId!==inherited.direction_id)) return json({error:"Подзадача должна относиться к той же области, что и родительская задача"},400);
  }
  const finalDirectionId=directionId || inherited?.direction_id || null;
  const finalClientId=clientId || inherited?.client_id || null;
  const finalProjectId=projectId || inherited?.project_id || null;
  const finalLifeAreaId=lifeAreaId || inherited?.life_area_id || null;
  const id = newId();
  await env.DB.prepare("INSERT INTO tasks (id,user_id,direction_id,client_id,project_id,life_area_id,parent_task_id,title,description,due_date,priority,estimated_minutes,ai_plan) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id,user.id,finalDirectionId,finalClientId,finalProjectId,finalLifeAreaId,parentTaskId,title,description,dueDate,["low","medium","high"].includes(body?.priority)?body.priority:"medium",estimated,String(body?.ai_plan||"").slice(0,3000)).run();
  await invalidateTodayPlan(env, user.id);
  return json({ ok: true, id }, 201);
}

export async function onRequestPatch({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request);
  const id = String(body?.id || "");
  if (!id) return json({ error: "Некорректные данные" }, 400);
  if (body?.actual_minutes !== undefined) {
    const actual = body.actual_minutes === null || body.actual_minutes === "" ? null : Math.round(Number(body.actual_minutes));
    if (actual !== null && (!Number.isInteger(actual) || actual < 0 || actual > 10000)) return json({ error: "Укажите фактическое время в минутах" }, 400);
    const activeTimer = await env.DB.prepare("SELECT id FROM task_time_entries WHERE task_id=? AND user_id=? AND ended_at IS NULL LIMIT 1").bind(id,user.id).first();
    if (activeTimer) return json({ error:"Сначала поставьте таймер на паузу, затем изменяйте фактическое время" },409);
    const result = await env.DB.prepare("UPDATE tasks SET actual_minutes=? WHERE id=? AND user_id=?").bind(actual,id,user.id).run();
    if (!result.meta.changes) return json({ error: "Задача не найдена" }, 404);
    await invalidateTodayPlan(env, user.id);
    return json({ ok: true });
  }
  const status = String(body?.status || "");
  if (!["todo","doing","waiting","done"].includes(status)) return json({ error: "Некорректные данные" }, 400);
  if(status==="done"){
    const activeTimer=await env.DB.prepare("SELECT id FROM task_time_entries WHERE task_id=? AND user_id=? AND ended_at IS NULL LIMIT 1").bind(id,user.id).first();
    if(activeTimer)return json({error:"Сначала остановите таймер задачи, затем завершите её"},409);
  }
  const result = await env.DB.prepare("UPDATE tasks SET status=?,completed_at=CASE WHEN ?='done' THEN datetime('now') ELSE NULL END WHERE id=? AND user_id=?").bind(status,status,id,user.id).run();
  if (!result.meta.changes) return json({ error: "Задача не найдена" }, 404);
  await invalidateTodayPlan(env, user.id);
  return json({ ok: true });
}
