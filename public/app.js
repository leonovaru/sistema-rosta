const $ = id => document.getElementById(id);
let authMode = "login";
let directions = [];
let userSettings = { monthly_target: 300000, timezone: "Europe/Moscow" };
let allTasks = [];
let taskFilter = "today";
let localToday = "";
let taskEstimate = null;
let currentDayPlan = null;
let calendarEvents = [];
let calendarAnchor = new Date();
let calendarSelected = "";
let calendarView = "month";

const money = n => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(n || 0)) + " ₽";
const duration = n => { const v = Number(n || 0); return v >= 60 ? (Math.floor(v/60) + " ч" + (v%60 ? " " + v%60 + " мин" : "")) : v + " мин"; };
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", headers: { "content-type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Не удалось выполнить запрос");
  return data;
}
function showAuth() { $("auth-view").classList.remove("hidden"); $("app-view").classList.add("hidden"); $("userbar").classList.add("hidden"); }
function showApp(email) { $("auth-view").classList.add("hidden"); $("app-view").classList.remove("hidden"); $("userbar").classList.remove("hidden"); $("user-email").textContent = email; }
document.querySelectorAll("[data-tab]").forEach(btn => btn.addEventListener("click", () => {
  authMode = btn.dataset.tab;
  document.querySelectorAll("[data-tab]").forEach(x => x.classList.toggle("active", x === btn));
  $("auth-submit").textContent = authMode === "login" ? "Войти" : "Создать аккаунт";
  $("password").autocomplete = authMode === "login" ? "current-password" : "new-password";
  $("auth-error").textContent = "";
}));
$("auth-form").addEventListener("submit", async e => {
  e.preventDefault(); $("auth-error").textContent = "";
  const payload = { email: $("email").value, password: $("password").value };
  try {
    if (authMode === "register") await api("/api/auth/register", { method: "POST", body: JSON.stringify(payload) });
    await api("/api/auth/login", { method: "POST", body: JSON.stringify(payload) });
    await boot();
  } catch (err) { $("auth-error").textContent = err.message; }
});
$("logout").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST" }).catch(() => {}); showAuth(); });
$("estimate-task").addEventListener("click", async () => {
  const title = $("task-title").value.trim();
  if (!title) { alert("Сначала введи название задачи."); $("task-title").focus(); return; }
  const button = $("estimate-task");
  button.disabled = true; button.textContent = "Оцениваю…";
  $("estimate-result").classList.remove("hidden");
  $("estimate-result").textContent = "Анализирую объём задачи и возможность делегирования.";
  try {
    taskEstimate = await api("/api/tasks/estimate", { method: "POST", body: JSON.stringify({ title, description: $("task-description").value }) });
    const delegation = ({full:"Можно поручить ИИ почти целиком",partial:"ИИ выполнит часть работы, тебе останется проверить результат",manual:"Нужно твоё участие или действие вне приложения"})[taskEstimate.delegation];
    const steps = (taskEstimate.steps || []).map(step => "<li>" + escapeHtml(step.title) + " — " + duration(step.minutes) + "</li>").join("");
    $("estimate-result").innerHTML = "<strong>Оценка: " + duration(taskEstimate.range_min) + "–" + duration(taskEstimate.range_max) + "</strong><p>" + escapeHtml(taskEstimate.rationale || "") + "</p><p><b>" + delegation + "</b></p><p>" + escapeHtml(taskEstimate.delegation_reason || "") + "</p>" + (steps ? "<ul>"+steps+"</ul>" : "") + "<small>" + (taskEstimate.source === "ai" ? "Оценка ИИ" : "Черновая алгоритмическая оценка") + (taskEstimate.note ? " · "+escapeHtml(taskEstimate.note) : "") + "</small>";

  } catch (err) { taskEstimate = null; $("estimate-result").textContent = err.message; }
  finally { button.disabled = false; button.textContent = "Оценить время и делегирование с ИИ"; }
});
["task-title","task-description"].forEach(id => $(id).addEventListener("input", () => { taskEstimate = null; $("estimate-result").classList.add("hidden"); $("estimate-result").textContent = ""; }));
$("task-form").addEventListener("submit", async e => {
  e.preventDefault();
  try { await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: $("task-title").value, description: $("task-description").value, due_date: $("task-date").value || null, direction_id: $("task-direction").value || null, priority: $("task-priority").value, estimated_minutes: taskEstimate?.minutes ?? null, ai_plan: taskEstimate ? JSON.stringify(taskEstimate) : "" }) }); $("task-title").value = ""; $("task-description").value = ""; $("estimate-result").classList.add("hidden"); $("estimate-result").textContent = ""; taskEstimate = null; await loadTasks(); }
  catch (err) { alert(err.message); }
});
$("income-form").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await api("/api/income", { method: "POST", body: JSON.stringify({ amount: $("income-amount").value, direction_id: $("income-direction").value || null, received_on: $("income-date").value, note: $("income-note").value }) });
    $("income-amount").value = ""; $("income-note").value = ""; await loadDashboardData();
  } catch (err) { alert(err.message); }
});
async function loadDirections() {
  const data = await api("/api/directions"); directions = data.directions;
  $("directions").innerHTML = directions.map(d => {
    const target = Number(d.target_month || 0), actual = Number(d.actual_month || 0);
    const percent = target > 0 ? Math.min(100, actual / target * 100) : 0;
    const gap = Math.max(0, target - actual);
    return `<article class="direction">
      <strong>${escapeHtml(d.title)}</strong>
      <div class="direction-numbers"><span>Факт: <b>${money(actual)}</b></span><span>Прогноз: <b>${money(d.forecast_month)}</b></span></div>
      <div class="progress"><span style="width:${percent}%"></span></div>
      <div class="direction-target"><label for="target-${d.id}">Цель на месяц, ₽</label><input id="target-${d.id}" data-direction-target="${d.id}" type="number" min="0" max="100000000" step="1000" value="${target}"><button class="button ghost" data-save-direction="${d.id}">Сохранить</button></div>
      <small>${target ? "Осталось: " + money(gap) + " · " + Math.round(actual/target*100) + "% цели" : "Установите месячную цель"}</small>
    </article>`;
  }).join("");
  $("income-direction").innerHTML = '<option value="">Без привязки</option>' + directions.map(d => `<option value="${d.id}">${escapeHtml(d.title)}</option>`).join("");
  $("task-direction").innerHTML = '<option value="">Без привязки</option>' + directions.map(d => `<option value="${d.id}">${escapeHtml(d.title)}</option>`).join("");
  document.querySelectorAll("[data-save-direction]").forEach(button => button.addEventListener("click", async () => {
    const d = directions.find(item => item.id === button.dataset.saveDirection);
    const input = document.querySelector(`[data-direction-target="${button.dataset.saveDirection}"]`);
    try {
      await api("/api/directions", { method: "PUT", body: JSON.stringify({ id: d.id, title: d.title, monthly_target: input.value }) });
      await loadDashboardData();
    } catch (err) { alert(err.message); }
  }));
}
async function loadTasks() {
  const data = await api("/api/tasks"); allTasks = data.tasks;
  $("task-count").textContent = allTasks.filter(t => t.status !== "done").length;
  renderTasks();
}
function renderTasks() {
  const now = new Date(localToday + "T00:00:00Z");
  const day = now.getUTCDay() || 7;
  const monday = new Date(now); monday.setUTCDate(now.getUTCDate() - day + 1);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  const mondayKey = monday.toISOString().slice(0,10), sundayKey = sunday.toISOString().slice(0,10);
  const visible = allTasks.filter(task => {
    if (taskFilter === "all") return true;
    if (taskFilter === "today") return !task.due_date || task.due_date <= localToday;
    return task.due_date && task.due_date >= mondayKey && task.due_date <= sundayKey;
  });
  $("tasks").innerHTML = visible.length ? visible.map(t => {
    const dateText = t.due_date ? (t.due_date < localToday ? "Просрочено · " : "") + t.due_date : "Без срока";
    const priorityText = ({high:"Высокий",medium:"Обычный",low:"Низкий"})[t.priority] || "Обычный";
    return '<article class="task-card ' + (t.status === "done" ? "done" : "") + '">' +
      '<label class="task"><input type="checkbox" data-task="' + t.id + '" ' + (t.status === "done" ? "checked" : "") + '><span class="task-body"><b>' + escapeHtml(t.title) + '</b><small>' + escapeHtml(dateText) + ' · ' + escapeHtml(t.direction_title || "Без направления") + ' · ' + priorityText + '</small></span></label>' +
      '<div class="task-time"><span>План: <b>' + (t.estimated_minutes ? duration(t.estimated_minutes) : "не задан") + '</b></span><label>Факт, мин<input type="number" min="0" max="10000" step="5" placeholder="—" value="' + (t.actual_minutes ?? "") + '" data-actual-time="' + t.id + '"></label><button type="button" class="button ghost" data-save-time="' + t.id + '">Сохранить</button></div>' +
      '<div class="task-ai"><button type="button" class="button ghost" data-delegate-task="' + t.id + '">' + (t.delegated_result ? "Подготовить заново с ИИ" : "Поручить ИИ") + '</button>' +
      (t.delegated_result ? '<details class="delegated-saved"><summary>Результат ИИ' + (t.delegated_at ? ' · ' + escapeHtml(t.delegated_at) : '') + '</summary><div class="delegated-output">' + escapeHtml(t.delegated_result) + '</div></details>' : '') + '</div>' +
      '<div class="task-steps"><div class="task-steps-head"><b>План выполнения</b><button type="button" class="button ghost" data-plan-task="' + t.id + '">' + (t.steps?.length ? "Обновить план" : "Разбить на этапы с ИИ") + '</button></div>' +
      (t.steps?.length ? '<div class="task-step-list">' + t.steps.map(step => '<label class="task-step ' + (step.status === "done" ? "done" : "") + '"><input type="checkbox" data-task-step="' + step.id + '" ' + (step.status === "done" ? "checked" : "") + '><span>' + escapeHtml(step.title) + '</span><small>' + duration(step.estimated_minutes) + '</small></label>').join("") + '</div><small class="task-step-progress">Готово: ' + t.steps.filter(step => step.status === "done").length + ' из ' + t.steps.length + '</small>' : '<small class="muted">ИИ может превратить большую задачу в последовательность конкретных шагов.</small>') +
      '</div></article>';
  }).join("") : '<p class="muted">В этом периоде задач нет. Добавь следующий конкретный шаг.</p>';
  document.querySelectorAll("[data-task]").forEach(input => input.addEventListener("change", async () => {
    await api("/api/tasks", { method: "PATCH", body: JSON.stringify({ id: input.dataset.task, status: input.checked ? "done" : "todo" }) }); await loadTasks();
  }));
  document.querySelectorAll("[data-save-time]").forEach(button => button.addEventListener("click", async () => {
    const input = document.querySelector('[data-actual-time="' + button.dataset.saveTime + '"]');
    try { await api("/api/tasks", { method: "PATCH", body: JSON.stringify({ id: button.dataset.saveTime, actual_minutes: input.value === "" ? null : input.value }) }); await loadTasks(); }
    catch (err) { alert(err.message); }
  }));
  document.querySelectorAll("[data-delegate-task]").forEach(button => button.addEventListener("click", async () => {
    const task = allTasks.find(item => item.id === button.dataset.delegateTask);
    if (!task) return;
    button.disabled = true; button.textContent = "ИИ выполняет…";
    try {
      await api("/api/tasks/delegate", { method: "POST", body: JSON.stringify({ task_id: task.id, title: task.title, description: task.description || "" }) });
      await loadTasks();
    } catch (err) { alert(err.message); button.disabled = false; button.textContent = task.delegated_result ? "Подготовить заново с ИИ" : "Поручить ИИ"; }
  }));
  document.querySelectorAll("[data-plan-task]").forEach(button => button.addEventListener("click", async () => {
    button.disabled = true; button.textContent = "Составляю план…";
    try { await api("/api/tasks/plan", { method: "POST", body: JSON.stringify({ task_id: button.dataset.planTask }) }); await loadTasks(); }
    catch (err) { alert(err.message); button.disabled = false; button.textContent = "Повторить план"; }
  }));
  document.querySelectorAll("[data-task-step]").forEach(input => input.addEventListener("change", async () => {
    try { await api("/api/tasks/steps", { method: "PATCH", body: JSON.stringify({ id: input.dataset.taskStep, status: input.checked ? "done" : "todo" }) }); await loadTasks(); }
    catch (err) { alert(err.message); input.checked = !input.checked; }
  }));
}
document.querySelectorAll("[data-task-filter]").forEach(button => button.addEventListener("click", () => {
  taskFilter = button.dataset.taskFilter;
  document.querySelectorAll("[data-task-filter]").forEach(item => item.classList.toggle("active", item === button));
  renderTasks();
}));
async function loadIncome() {
  const data = await api("/api/income");
  $("actual").textContent = money(data.month_total);
  $("income-recent").textContent = data.entries.length ? "Последнее: " + money(data.entries[0].amount) + " · " + data.entries[0].received_on : "Поступлений пока нет";
  $("income-date").value = data.today;
  localToday = data.today; $("task-date").value = data.today;
  return data;
}
async function loadSettings(actual) {
  const { settings } = await api("/api/settings");
  userSettings = settings || userSettings;
  const target = Number(userSettings.monthly_target || 0);
  $("target").textContent = money(target);
  $("gap").textContent = money(Math.max(0, target - actual));
  const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: userSettings.timezone || "Europe/Moscow", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(dateParts.map(part => [part.type,part.value]));
  const day = Number(values.day), days = new Date(Number(values.year),Number(values.month),0).getDate();
  $("forecast").textContent = money(day ? actual / day * days : 0);
  $("today").textContent = new Intl.DateTimeFormat("ru-RU", { dateStyle: "full", timeZone: userSettings.timezone || "Europe/Moscow" }).format(new Date());
}
async function loadDashboardData() {
  const income = await loadIncome();
  await Promise.all([loadDirections(),loadSettings(income.month_total)]);
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
const pad2 = n => String(n).padStart(2,"0");
const dateKey = d => d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());
const shiftDate = (key,days) => { const d=new Date(key+"T12:00:00"); d.setDate(d.getDate()+days); return dateKey(d); };
const eventTypes = {meeting:"Встреча",travel:"Дорога",hobby:"Хобби",sleep:"Сон",work:"Работа",personal:"Личное",other:"Другое"};
const eventColors = {meeting:"meeting",travel:"travel",hobby:"hobby",sleep:"sleep",work:"work",personal:"personal",other:"other"};
function eventTime(value) { return value ? value.slice(11,16) : ""; }
function eventDuration(event) {
  const start=new Date(event.start_at),end=new Date(event.end_at);
  const mins=Math.max(0,Math.round((end-start)/60000));
  return duration(mins);
}
function calendarRange() {
  if(calendarView==="month"){
    const first=new Date(calendarAnchor.getFullYear(),calendarAnchor.getMonth(),1);
    const offset=(first.getDay()+6)%7;
    const start=new Date(first); start.setDate(1-offset);
    const end=new Date(start); end.setDate(start.getDate()+42);
    return {from:dateKey(start)+"T00:00",to:dateKey(end)+"T00:00"};
  }
  const day=new Date(calendarSelected+"T12:00:00");
  const monday=new Date(day); monday.setDate(day.getDate()-((day.getDay()+6)%7));
  const end=new Date(monday); end.setDate(monday.getDate()+7);
  return {from:dateKey(monday)+"T00:00",to:dateKey(end)+"T00:00"};
}
async function loadCalendar() {
  const range=calendarRange();
  const data=await api("/api/calendar/events?from="+encodeURIComponent(range.from)+"&to="+encodeURIComponent(range.to));
  calendarEvents=data.events||[];
  renderCalendar();
}
function renderCalendar() {
  const monthName=new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric"}).format(calendarAnchor);
  const weekStart=new Date(calendarSelected+"T12:00:00");
  weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));
  const weekEnd=new Date(weekStart); weekEnd.setDate(weekStart.getDate()+6);
  $("calendar-caption").textContent=calendarView==="month"?monthName:new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"short"}).format(weekStart)+" — "+new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"short",year:"numeric"}).format(weekEnd);
  document.querySelector(".calendar-weekdays").classList.toggle("hidden",calendarView==="week");
  const start=calendarView==="month"?new Date(calendarAnchor.getFullYear(),calendarAnchor.getMonth(),1):weekStart;
  if(calendarView==="month") start.setDate(1-((start.getDay()+6)%7));
  const count=calendarView==="month"?42:7;
  const cells=[];
  for(let i=0;i<count;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);
    const key=dateKey(d);
    const items=calendarEvents.filter(e=>e.start_at.slice(0,10)<=key&&(e.end_at.slice(0,10)>key||(e.end_at.slice(0,10)===key&&e.end_at.slice(11,16)!=="00:00")));
    cells.push('<button type="button" class="calendar-day '+(key===calendarSelected?"selected ":"")+(d.getMonth()!==calendarAnchor.getMonth()&&calendarView==="month"?"outside ":"")+(key===localToday?"today":"")+'" data-calendar-date="'+key+'"><span class="calendar-day-number">'+d.getDate()+'</span><span class="calendar-day-events">'+items.slice(0,3).map(e=>'<small class="event-dot '+eventColors[e.event_type]+'">'+escapeHtml(e.start_at.slice(0,10)<key?'↳':eventTime(e.start_at))+' '+escapeHtml(e.title)+'</small>').join("")+(items.length>3?'<small class="event-more">+'+(items.length-3)+'</small>':"")+'</span></button>');
  }
  $("calendar-grid").className="calendar-grid "+(calendarView==="week"?"week-view":"month-view");
  $("calendar-grid").innerHTML=cells.join("");
  document.querySelectorAll("[data-calendar-view]").forEach(b=>b.classList.toggle("active",b.dataset.calendarView===calendarView));
  $("calendar-selected-date").textContent=new Intl.DateTimeFormat("ru-RU",{weekday:"long",day:"numeric",month:"long"}).format(new Date(calendarSelected+"T12:00:00"));
  const dayEvents=calendarEvents.filter(e=>e.start_at.slice(0,10)<=calendarSelected&&(e.end_at.slice(0,10)>calendarSelected||(e.end_at.slice(0,10)===calendarSelected&&e.end_at.slice(11,16)!=="00:00"))).sort((a,b)=>a.start_at.localeCompare(b.start_at));
  $("calendar-events").innerHTML=dayEvents.length?dayEvents.map(e=>'<article class="calendar-event"><div class="calendar-event-time">'+eventTime(e.start_at)+'–'+eventTime(e.end_at)+'</div><div class="calendar-event-main"><b>'+escapeHtml(e.title)+'</b><small>'+eventTypes[e.event_type]+' · '+eventDuration(e)+(e.mode!=="none"?" · "+(e.mode==="online"?"онлайн":"офлайн"):"")+'</small>'+(e.location?'<small>'+escapeHtml(e.location)+'</small>':"")+(e.actual_start_at||e.actual_end_at?'<small>Факт: '+(eventTime(e.actual_start_at)||"—")+'–'+(eventTime(e.actual_end_at)||"—")+'</small>':"")+'</div><div class="calendar-event-actions"><button type="button" class="button ghost" data-edit-event="'+e.id+'">Изменить</button><button type="button" class="button ghost" data-delete-event="'+e.id+'">Удалить</button></div></article>').join(""):'<p class="muted">На этот день событий пока нет. Добавь встречи, дорогу, хобби или сон.</p>';
  document.querySelectorAll("[data-calendar-date]").forEach(b=>b.addEventListener("click",async()=>{calendarSelected=b.dataset.calendarDate;const d=new Date(calendarSelected+"T12:00:00");calendarAnchor=new Date(d.getFullYear(),d.getMonth(),1);if(calendarView==="week")await loadCalendar();else renderCalendar();}));
  document.querySelectorAll("[data-edit-event]").forEach(b=>b.addEventListener("click",()=>editCalendarEvent(calendarEvents.find(e=>e.id===b.dataset.editEvent))));
  document.querySelectorAll("[data-delete-event]").forEach(b=>b.addEventListener("click",async()=>{if(!confirm("Удалить это событие?"))return;try{await api("/api/calendar/events",{method:"DELETE",body:JSON.stringify({id:b.dataset.deleteEvent})});await loadCalendar();}catch(err){alert(err.message);}}));
}
function openCalendarForm(event=null) {
  $("calendar-form").classList.remove("hidden");
  $("calendar-form-title").textContent=event?"Изменить событие":"Новое событие";
  $("event-id").value=event?.id||"";
  $("event-title").value=event?.title||"";
  $("event-type").value=event?.event_type||"meeting";
  $("event-mode").value=event?.mode||"none";
  $("event-start").value=event?.start_at||calendarSelected+"T09:00";
  $("event-end").value=event?.end_at||calendarSelected+"T10:00";
  $("event-actual-start").value=event?.actual_start_at||"";
  $("event-actual-end").value=event?.actual_end_at||"";
  $("event-status").value=event?.status||"planned";
  $("event-location").value=event?.location||"";
  $("event-notes").value=event?.notes||"";
  $("calendar-form").scrollIntoView({behavior:"smooth",block:"nearest"});
}
function editCalendarEvent(event){if(event)openCalendarForm(event);}
$("calendar-new").addEventListener("click",()=>openCalendarForm());
$("calendar-cancel").addEventListener("click",()=>$("calendar-form").classList.add("hidden"));
$("calendar-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const id=$("event-id").value;
  const payload={id,title:$("event-title").value,event_type:$("event-type").value,mode:$("event-mode").value,start_at:$("event-start").value,end_at:$("event-end").value,actual_start_at:$("event-actual-start").value||null,actual_end_at:$("event-actual-end").value||null,status:$("event-status").value,location:$("event-location").value,notes:$("event-notes").value};
  try{await api("/api/calendar/events",{method:id?"PATCH":"POST",body:JSON.stringify(payload)});$("calendar-form").classList.add("hidden");await loadCalendar();if(currentDayPlan)currentDayPlan=null;renderDayPlan();}
  catch(err){alert(err.message);}
});
$("calendar-prev").addEventListener("click",async()=>{if(calendarView==="month"){calendarAnchor=new Date(calendarAnchor.getFullYear(),calendarAnchor.getMonth()-1,1);calendarSelected=dateKey(calendarAnchor);}else calendarSelected=shiftDate(calendarSelected,-7);await loadCalendar();});
$("calendar-next").addEventListener("click",async()=>{if(calendarView==="month"){calendarAnchor=new Date(calendarAnchor.getFullYear(),calendarAnchor.getMonth()+1,1);calendarSelected=dateKey(calendarAnchor);}else calendarSelected=shiftDate(calendarSelected,7);await loadCalendar();});
$("calendar-today").addEventListener("click",async()=>{calendarSelected=localToday;calendarAnchor=new Date();await loadCalendar();});
document.querySelectorAll("[data-calendar-view]").forEach(b=>b.addEventListener("click",async()=>{calendarView=b.dataset.calendarView;await loadCalendar();}));

async function loadPlanner() {
  try {
    const [data, settings] = await Promise.all([api("/api/planner/day"), api("/api/settings")]);
    $("planner-capacity").value = String(settings.settings?.daily_capacity_minutes || 360);
    $("planner-date").textContent = data.date || "";
    currentDayPlan = data.plan;
    renderDayPlan();
  } catch (err) { $("day-plan").textContent = err.message; }
}
function renderDayPlan() {
  const plan = currentDayPlan;
  if (!plan) {
    $("day-plan").innerHTML = '<p class="muted">План ещё не сформирован. Нажми кнопку — ИИ расставит задачи по приоритету и доступному времени.</p>';
    return;
  }
  const items = Array.isArray(plan.items) ? plan.items : [];
  $("day-plan").innerHTML = '<h3>' + escapeHtml(plan.headline || "План на сегодня") + '</h3><p class="planner-focus">' + escapeHtml(plan.focus || "") + '</p>' +
    (items.length ? '<ol class="planner-items">' + items.map(item => '<li><div><b>' + escapeHtml(item.title) + '</b><small>' + escapeHtml(item.reason || "") + '</small></div><span>' + duration(item.minutes) + '</span></li>').join("") + '</ol>' : '<p class="muted">Пока нет подходящих незавершённых задач. Добавь конкретные следующие шаги в список задач.</p>') +
    '<div class="planner-summary"><span>Работа доступна: <b>' + duration(plan.daily_capacity_minutes || 0) + '</b></span><span>Уже отработано: <b>' + duration(plan.work_already_done_minutes || 0) + '</b></span><span>Календарь занят: <b>' + duration(plan.calendar_busy_minutes_remaining || 0) + '</b></span><span>Запланировано: <b>' + duration(plan.total_minutes || 0) + '</b></span><span>Резерв: <b>' + duration(plan.reserve_minutes || 0) + '</b></span><span>Источник: <b>' + (plan.source === "ai" ? "ИИ" : "алгоритм") + '</b></span></div>';
}
$("make-day-plan").addEventListener("click", async () => {
  const button = $("make-day-plan");
  button.disabled = true; button.textContent = "Составляю план…";
  try {
    const capacity = Number($("planner-capacity").value);
    await api("/api/settings", { method:"PUT", body:JSON.stringify({ monthly_target:userSettings.monthly_target || 300000, timezone:userSettings.timezone || "Europe/Moscow", daily_capacity_minutes:capacity }) });
    const data = await api("/api/planner/day", { method:"POST", body:JSON.stringify({ available_minutes:capacity }) });
    currentDayPlan = data.plan; $("planner-date").textContent = data.date; renderDayPlan();
  } catch (err) { alert(err.message); }
  finally { button.disabled = false; button.textContent = "Сформировать план дня с ИИ"; }
});

async function boot() {
  try {
    const { user } = await api("/api/auth/me");
    if (!user) return showAuth();
    showApp(user.email); await loadDashboardData(); await loadTasks(); calendarSelected=localToday; calendarAnchor=new Date(localToday+"T12:00:00"); await loadCalendar(); await loadPlanner();
  } catch { showAuth(); }
}
boot();
