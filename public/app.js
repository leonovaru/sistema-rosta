const $ = id => document.getElementById(id);
let authMode = "login";
let directions = [];
let userSettings = { monthly_target: 300000, timezone: "Europe/Moscow" };

const money = n => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(n || 0)) + " ₽";
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
$("task-form").addEventListener("submit", async e => {
  e.preventDefault();
  try { await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: $("task-title").value }) }); $("task-title").value = ""; await loadTasks(); }
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
  const data = await api("/api/tasks");
  $("task-count").textContent = data.tasks.filter(t => t.status !== "done").length;
  $("tasks").innerHTML = data.tasks.length ? data.tasks.map(t => `<label class="task ${t.status === "done" ? "done" : ""}"><input type="checkbox" data-task="${t.id}" ${t.status === "done" ? "checked" : ""}><span>${escapeHtml(t.title)}</span></label>`).join("") : '<p class="muted">Пока нет задач. Добавь один конкретный следующий шаг.</p>';
  document.querySelectorAll("[data-task]").forEach(input => input.addEventListener("change", async () => {
    await api("/api/tasks", { method: "PATCH", body: JSON.stringify({ id: input.dataset.task, status: input.checked ? "done" : "todo" }) }); await loadTasks();
  }));
}
async function loadIncome() {
  const data = await api("/api/income");
  $("actual").textContent = money(data.month_total);
  $("income-recent").textContent = data.entries.length ? "Последнее: " + money(data.entries[0].amount) + " · " + data.entries[0].received_on : "Поступлений пока нет";
  $("income-date").value = data.today;
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
    showApp(user.email); await loadTasks(); await loadDashboardData();
  } catch { showAuth(); }
}
boot();
