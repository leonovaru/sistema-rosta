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
  const dailyCapacity = Math.round(Number(body.available_minutes ?? settings?.daily_capacity_minutes ?? 360));
  if (!Number.isInteger(dailyCapacity) || dailyCapacity < 30 || dailyCapacity > 960) return json({ error: "Доступное время должно быть от 30 до 960 минут" }, 400);
  const clockParts = new Intl.DateTimeFormat("en-GB", { timeZone:timezone, hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).formatToParts(new Date());
  const clock = Object.fromEntries(clockParts.map(part => [part.type,part.value]));
  const nowMinute = Number(clock.hour)*60 + Number(clock.minute);
  const tomorrow = new Date(today+"T12:00:00Z"); tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  const tomorrowKey = tomorrow.toISOString().slice(0,10);
  const calendarRows = await env.DB.prepare("SELECT id,title,event_type,start_at,end_at,actual_start_at,actual_end_at,status,mode,location FROM calendar_events WHERE user_id=? AND status!='cancelled' AND start_at < ? AND end_at > ? ORDER BY start_at").bind(user.id,tomorrowKey+"T00:00",today+"T00:00").all();
  const busyIntervals = calendarRows.results.map(event => {
    const startValue = event.status === "completed" && event.actual_start_at ? event.actual_start_at : event.start_at;
    const endValue = event.status === "completed" && event.actual_end_at ? event.actual_end_at : event.end_at;
    const startDate = startValue.slice(0,10), endDate = endValue.slice(0,10);
    const start = startDate < today ? 0 : startDate > today ? 1440 : Number(startValue.slice(11,13))*60+Number(startValue.slice(14,16));
    const end = endDate > today ? 1440 : endDate < today ? 0 : Number(endValue.slice(11,13))*60+Number(endValue.slice(14,16));
    return { start:Math.max(nowMinute,start), end:Math.max(nowMinute,end), event };
  }).filter(item => item.end > item.start);
  const sortedBusy = [...busyIntervals].sort((a,b)=>a.start-b.start);
  let busyFutureMinutes = 0, cursor = nowMinute;
  for (const interval of sortedBusy) { const start=Math.max(cursor,interval.start); if(interval.end>start){busyFutureMinutes+=interval.end-start;cursor=interval.end;} }
  const workDoneMinutes = calendarRows.results.filter(event=>event.event_type==="work").reduce((sum,event)=>{
    const endValue=event.status==="completed"&&event.actual_end_at?event.actual_end_at:event.end_at;
    if(endValue.slice(0,10)>today)return sum;
    const end=endValue.slice(0,10)<today?0:Number(endValue.slice(11,13))*60+Number(endValue.slice(14,16));
    const startValue=event.status==="completed"&&event.actual_start_at?event.actual_start_at:event.start_at;
    const start=startValue.slice(0,10)<today?0:Number(startValue.slice(11,13))*60+Number(startValue.slice(14,16));
    return sum+Math.max(0,Math.min(nowMinute,end)-Math.min(nowMinute,start));
  },0);
  const remainingWorkCapacity=Math.max(0,dailyCapacity-workDoneMinutes);
  const freeAfterCalendar=Math.max(0,1440-nowMinute-busyFutureMinutes);
  const capacity=Math.min(remainingWorkCapacity,freeAfterCalendar);
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
  const context = { date, available_minutes:capacity, daily_capacity_minutes:dailyCapacity, work_already_done_minutes:workDoneMinutes, current_local_time:clock.hour+":"+clock.minute, calendar_events:calendarRows.results, monthly_target:monthlyTarget, actual_month:actual, remaining_to_target:remaining, required_daily_income_pace:Math.round(dailyPace), days_left_including_today:daysInMonth-day+1, directions:directionRows.results, tasks };
  let plan = fallbackPlan(tasks,capacity);
  let source = "algorithm";
  if (env.AI) {
    try {
      const response = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
        messages: [
          { role:"system", content:"Ты персональный операционный директор. Составь реалистичный план на сегодня на русском. Учитывай просроченные и близкие сроки, высокий приоритет, длительность, задачи которые двигают выручку и финансовый разрыв до месячной цели. Не выдумывай задачи и не включай завершённые. Не превышай доступное время после вычета календарных событий и уже отработанных часов. Уважай сон, дорогу, встречи и личное время. Выбирай 3–7 задач, если хватает задач и времени; оставляй резерв. Для каждой задачи верни существующий task_id, minutes (не больше оценки более чем на 25%, если оценка задана), reason (коротко и конкретно). Не обещай гарантированный доход. Верни только JSON: {headline:string,focus:string,items:[{task_id:string,minutes:integer,reason:string}],total_minutes:integer,reserve_minutes:integer}. Если задач нет, верни пустой items и объясни это." },
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
  plan.daily_capacity_minutes = dailyCapacity;
  plan.available_minutes = capacity;
  plan.work_already_done_minutes = workDoneMinutes;
  plan.calendar_busy_minutes_remaining = busyFutureMinutes;
  const id = newId();
  await env.DB.prepare(`INSERT INTO daily_plans (id,user_id,plan_date,available_minutes,plan_json,updated_at)
    VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(user_id,plan_date) DO UPDATE SET available_minutes=excluded.available_minutes,plan_json=excluded.plan_json,updated_at=datetime('now')`)
    .bind(id,user.id,date,capacity,JSON.stringify(plan)).run();
  return json({ date, available_minutes:capacity, daily_capacity_minutes:dailyCapacity, plan });
}