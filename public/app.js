const $ = id => document.getElementById(id);
let authMode = "login";
let directions = [];
let userSettings = { monthly_target: 300000, timezone: "Europe/Moscow" };
let allTasks = [];
let taskFilter = "today";
let localToday = "";
let taskEstimate = null;

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
    if (taskEstimate.source === "ai" && taskEstimate.delegation !== "manual") {
      $("estimate-result").innerHTML += '<button type="button" class="button primary" id="delegate-task">Поручить ИИ подготовить результат</button><div id="delegated-output" class="delegated-output hidden"></div>';
      $("delegate-task").addEventListener("click", async () => {
        const delegateButton = $("delegate-task"); const output = $("delegated-output");
        delegateButton.disabled = true; delegateButton.textContent = "ИИ выполняет задачу…";
        output.classList.remove("hidden"); output.textContent = "Готовлю результат. Это может занять некоторое время."; 
        try { const delegated = await api("/api/tasks/delegate", { method: "POST", body: JSON.stringify({ title, description: $("task-description").value }) }); output.textContent = delegated.result; }
        catch (err) { output.textContent = err.message; }
        finally { delegateButton.disabled = false; delegateButton.textContent = "Повторить выполнение ИИ"; }
      });
    }
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
      '<div class="task-time"><span>План: <b>' + (t.estimated_minutes ? duration(t.estimated_minutes) : "не задан") + '</b></span><label>Факт, мин<input type="number" min="0" max="10000" step="5" placeholder="—" value="' + (t.actual_minutes ?? "") + '" data-actual-time="' + t.id + '"></label><button type="button" class="button ghost" data-save-time="' + t.id + '">Сохранить</button></div></article>';
  }).join("") : '<p class="muted">В этом периоде задач нет. Добавь следующий конкретный шаг.</p>';
  document.querySelectorAll("[data-task]").forEach(input => input.addEventListener("change", async () => {
    await api("/api/tasks", { method: "PATCH", body: JSON.stringify({ id: input.dataset.task, status: input.checked ? "done" : "todo" }) }); await loadTasks();
  }));
  document.querySelectorAll("[data-save-time]").forEach(button => button.addEventListener("click", async () => {
    const input = document.querySelector('[data-actual-time="' + button.dataset.saveTime + '"]');
    try { await api("/api/tasks", { method: "PATCH", body: JSON.stringify({ id: button.dataset.saveTime, actual_minutes: input.value === "" ? null : input.value }) }); await loadTasks(); }
    catch (err) { alert(err.message); }
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
async function boot() {
  try {
    const { user } = await api("/api/auth/me");
    if (!user) return showAuth();
    showApp(user.email); await loadDashboardData(); await loadTasks();
  } catch { showAuth(); }
}
boot();
