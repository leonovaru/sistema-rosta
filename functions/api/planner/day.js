import { json, requireUser, readJson, newId } from "../../_lib/auth.js";

function localDate(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type,part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function parseJson(value) {
  if (typeof value !== "string") return value;
  const clean = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(clean); } catch { return null; }
}
function fallbackPlan(tasks, capacity) {
  const priority = { high: 3, medium: 2, low: 1 };
  const sorted = [...tasks].sort((a,b) => {
    const overdueA = a.due_date && a.due_date < a.today ? 1 : 0;
    const overdueB = b.due_date && b.due_date < b.today ? 1 : 0;
    return overdueB-overdueA || priority[b.priority]-priority[a.priority] ||
      (a.due_date || "9999").localeCompare(b.due_date || "9999");
  });
  let used = 0;
  const selected = [];
  for (const task of sorted) {
    const minutes = Number(task.estimated_minutes) || 30;
    if (used + minutes <= capacity) {
      selected.push({ task_id: task.id, title: task.title, minutes, reason: task.due_date && task.due_date < task.today ? "Просроченный срок" : task.priority === "high" ? "Высокий приоритет" : "Подходит по доступному времени" });
      used += minutes;
    }
  }
  return { headline: "Начни с самого срочного, затем двигай доходные направления", focus: "Сначала выполни выбранные задачи; оставь резерв на непредвиденное.", items: selected, total_minutes: used, reserve_minutes: Math.max(0,capacity-used) };
}

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const settings = await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
  const date = localDate(settings?.timezone || "Europe/Moscow");
  const saved = await env.DB.prepare("SELECT plan_date,available_minutes,plan_json,updated_at FROM daily_plans WHERE user_id=? AND plan_date=?").bind(user.id,date).first();
  return json({ date, plan: saved ? { ...saved, ...parseJson(saved.plan_json) } : null });
}

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request) || {};
  const settings = await env.DB.prepare("SELECT monthly_target,timezone,daily_capacity_minutes FROM settings WHERE user_id=?").bind(user.id).first();
  const timezone = settings?.timezone || "Europe/Moscow";
  const today = localDate(timezone);
  const date = String(body.date || today);
  if (date !== today) return json({ error: "План можно сформировать только на текущий день" }, 400);
  const capacity = Math.round(Number(body.available_minutes ?? settings?.daily_capacity_minutes ?? 360));
  if (!Number.isInteger(capacity) || capacity < 30 || capacity > 960) return json({ error: "Доступное время должно быть от 30 до 960 минут" }, 400);
  const tasksResult = await env.DB.prepare(`
    SELECT t.id,t.title,t.description,t.status,t.priority,t.due_date,t.estimated_minutes,d.title AS direction_title,d.target_month AS direction_target
    FROM tasks t LEFT JOIN directions d ON d.id=t.direction_id
    WHERE t.user_id=? AND t.status IN ('todo','doing','waiting')
    ORDER BY t.due_date IS NULL,t.due_date
    LIMIT 60
  `).bind(user.id).all();
  const tasks = tasksResult.results.map(task => ({ ...task, today }));
  const monthStart = today.slice(0,7) + "-01";
  const actualRow = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS actual FROM income_entries WHERE user_id=? AND received_on>=? AND received_on<=?").bind(user.id,monthStart,today).first();
  const day = Number(today.slice(8,10));
  const [year,month] = today.slice(0,7).split("-").map(Number);
  const daysInMonth = new Date(year,month,0).getDate();
  const monthlyTarget = Number(settings?.monthly_target || 300000);
  const actual = Number(actualRow?.actual || 0);
  const remaining = Math.max(0,monthlyTarget-actual);
  const dailyPace = remaining / Math.max(1,daysInMonth-day+1);
  const directionRows = await env.DB.prepare("SELECT title,target_month FROM directions WHERE user_id=? AND active=1 ORDER BY sort_order").bind(user.id).all();
  const context = { date, available_minutes:capacity, monthly_target:monthlyTarget, actual_month:actual, remaining_to_target:remaining, required_daily_income_pace:Math.round(dailyPace), days_left_including_today:daysInMonth-day+1, directions:directionRows.results, tasks };
  let plan = fallbackPlan(tasks,capacity);
  let source = "algorithm";
  if (env.AI) {
    try {
      const response = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
        messages: [
          { role:"system", content:"Ты персональный операционный директор. Составь реалистичный план на сегодня на русском. Учитывай просроченные и близкие сроки, высокий приоритет, длительность, задачи которые двигают выручку и финансовый разрыв до месячной цели. Не выдумывай задачи и не включай завершённые. Не превышай доступное время. Выбирай 3–7 задач, если хватает задач и времени; оставляй резерв. Для каждой задачи верни существующий task_id, minutes (не больше оценки более чем на 25%, если оценка задана), reason (коротко и конкретно). Не обещай гарантированный доход. Верни только JSON: {headline:string,focus:string,items:[{task_id:string,minutes:integer,reason:string}],total_minutes:integer,reserve_minutes:integer}. Если задач нет, верни пустой items и объясни это." },
          { role:"user", content:JSON.stringify(context) }
        ],
        max_tokens:1000,
        temperature:0.2
      });
      const parsed = parseJson(response?.response);
      if (!parsed || !Array.isArray(parsed.items)) throw new Error("Invalid planner response");
      const byId = new Map(tasks.map(task => [task.id,task]));
      const items = Array.isArray(parsed?.items) ? parsed.items.slice(0,7).map(item => {
        const task = byId.get(String(item.task_id));
        if (!task) return null;
        const minutes = Math.max(5,Math.min(capacity,Math.round(Number(item.minutes)||task.estimated_minutes||30)));
        return { task_id:task.id,title:task.title,minutes,reason:String(item.reason||"Приоритет на сегодня").slice(0,240) };
      }).filter(Boolean) : [];
      let used = 0;
      const bounded = [];
      for (const item of items) { if (used+item.minutes<=capacity) { bounded.push(item); used+=item.minutes; } }
      plan = { headline:String(parsed.headline||"План на сегодня").slice(0,180),focus:String(parsed.focus||"Двигай самые важные задачи").slice(0,400),items:bounded,total_minutes:used,reserve_minutes:capacity-used };
      source = "ai";
    } catch { /* безопасно используем алгоритмический план */ }
  }
  plan.source = source;
  const id = newId();
  await env.DB.prepare(`INSERT INTO daily_plans (id,user_id,plan_date,available_minutes,plan_json,updated_at)
    VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(user_id,plan_date) DO UPDATE SET available_minutes=excluded.available_minutes,plan_json=excluded.plan_json,updated_at=datetime('now')`)
    .bind(id,user.id,date,capacity,JSON.stringify(plan)).run();
  return json({ date, available_minutes:capacity, plan });
}