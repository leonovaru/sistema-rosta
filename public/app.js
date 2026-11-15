const $ = id => document.getElementById(id);
let authMode = "login";
let directions = [];

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
    $("income-amount").value = ""; $("income-note").value = ""; await loadIncome();
  } catch (err) { alert(err.message); }
});
async function loadDirections() {
  const data = await api("/api/directions"); directions = data.directions;
  $("directions").innerHTML = directions.map(d => `<article class="direction"><strong>${escapeHtml(d.title)}</strong><small>${d.target_month ? "Цель: " + money(d.target_month) : "Цель пока не задана"}</small></article>`).join("");
  $("income-direction").innerHTML = '<option value="">Без привязки</option>' + directions.map(d => `<option value="${d.id}">${escapeHtml(d.title)}</option>`).join("");
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
  await loadSettings(data.month_total);
}
async function loadSettings(actual) {
  const { settings } = await api("/api/settings");
  const target = Number(settings?.monthly_target || 300000);
  $("target").textContent = money(target);
  $("gap").textContent = money(Math.max(0, target - actual));
  const now = new Date(); const day = now.getDate(); const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  $("forecast").textContent = money(day ? actual / day * days : 0);
  $("today").textContent = new Intl.DateTimeFormat("ru-RU", { dateStyle: "full" }).format(now);
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
async function boot() {
  try {
    const { user } = await api("/api/auth/me");
    if (!user) return showAuth();
    showApp(user.email); $("income-date").value = new Date().toISOString().slice(0,10);
    await loadDirections(); await loadTasks(); await loadIncome();
  } catch { showAuth(); }
}
boot();
