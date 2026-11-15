const $ = id => document.getElementById(id);
let authMode = "login";
let directions = [];
let userSettings = { monthly_target: 300000, timezone: "Europe/Moscow" };
let allTasks = [];
let taskTimerState = { active_timer:null, totals:[] };
let taskFilter = "today";
let localToday = "";
let taskEstimate = null;
let currentDayPlan = null;
let calendarEvents = [];
let calendarAnchor = new Date();
let calendarSelected = "";
let calendarView = "month";
let workspaceData = {clients:[],projects:[],life_areas:[],directions:[]};
let pendingProjectPlan = null;

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
  try { await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: $("task-title").value, description: $("task-description").value, due_date: $("task-date").value || null, direction_id: $("task-direction").value || null, client_id: $("task-client").value || null, project_id: $("task-project").value || null, life_area_id: $("task-life-area").value || null, parent_task_id: $("task-parent").value || null, priority: $("task-priority").value, estimated_minutes: taskEstimate?.minutes ?? null, ai_plan: taskEstimate ? JSON.stringify(taskEstimate) : "" }) }); $("task-title").value = ""; $("task-description").value = ""; $("estimate-result").classList.add("hidden"); $("estimate-result").textContent = ""; taskEstimate = null; await loadTasks(); }
  catch (err) { alert(err.message); }
});
$("income-form").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await api("/api/income", { method: "POST", body: JSON.stringify({ amount: $("income-amount").value, direction_id: $("income-direction").value || null, received_on: $("income-date").value, note: $("income-note").value }) });
    $("income-amount").value = ""; $("income-note").value = ""; await loadDashboardData(); await loadFinance();
  } catch (err) { alert(err.message); }
});

let analyticsData=null;
function analyticsRows(items,empty){
 if(!items?.length)return '<p class="muted">'+empty+'</p>';
 return '<div class="analytics-list">'+items.map(x=>'<article class="analytics-row"><div><b>'+escapeHtml(x.title)+'</b><small>'+Number(x.completed||0)+' из '+Number(x.tasks||0)+' задач · перерасход: '+Number(x.overrun_tasks||0)+'</small></div><div><strong>'+duration(x.actual_minutes)+'</strong><small>план '+duration(x.estimated_minutes)+' · '+(x.variance_minutes>0?'+':'')+duration(Math.abs(x.variance_minutes))+'</small></div></article>').join('')+'</div>';
}
async function loadAnalytics(){
 const data=await api('/api/analytics');analyticsData=data;
 const s=data.summary;
 $('analytics-period').textContent=data.period.from+' — '+data.period.to;
 $('analytics-summary').innerHTML=[
 ['Задач в анализе',s.tasks+' · завершено '+s.completed],
 ['Фактическое время',duration(s.actual_minutes)],
 ['По плану',duration(s.estimated_minutes)],
 ['Отклонение', (s.variance_minutes>0?'+':s.variance_minutes<0?'−':'')+duration(Math.abs(s.variance_minutes))],
 ['Задачи с перерасходом',s.overrun_tasks+' · '+s.overrun_rate+'%'],
 ['Время по таймерам',duration(data.time.tracked_minutes)]
 ].map(x=>'<article><span>'+x[0]+'</span><b>'+x[1]+'</b></article>').join('');
 $('analytics-directions').innerHTML=analyticsRows(data.by_direction,'Нет задач по направлениям за выбранный период.');
 $('analytics-projects').innerHTML=analyticsRows(data.by_project,'Нет задач по проектам за выбранный период.');
 $('analytics-life-areas').innerHTML=analyticsRows(data.by_life_area,'Нет личных задач за выбранный период.');
 $('analytics-months').innerHTML=analyticsRows(data.by_month,'Пока недостаточно данных для динамики.');
 $('analytics-calendar').innerHTML=data.time.calendar_by_type.length?data.time.calendar_by_type.map(x=>'<article class="analytics-row"><div><b>'+escapeHtml(({meeting:'Встречи',travel:'Дорога',hobby:'Хобби',sleep:'Сон',work:'Работа',personal:'Личные дела',other:'Другое'})[x.event_type]||x.event_type)+'</b><small>'+x.events+' событий</small></div><div><strong>'+duration(Math.round(x.actual_minutes))+'</strong><small>план '+duration(Math.round(x.planned_minutes))+'</small></div></article>').join(''):'<p class="muted">Нет событий календаря за период.</p>';
}
$('refresh-analytics').addEventListener('click',async()=>{const b=$('refresh-analytics');b.disabled=true;try{await loadAnalytics();}catch(err){alert(err.message);}finally{b.disabled=false;}});

let financeData = null;
async function loadFinance() {
  financeData = await api("/api/finance");
  const s=financeData.summary;
  $("finance-period").textContent="С начала месяца по "+financeData.today;
  $("finance-income").textContent=money(s.income);
  $("finance-expenses").textContent=money(s.expenses);
  $("finance-debt-paid").textContent=money(s.debt_payments);
  $("finance-obligation-paid").textContent=money(s.obligation_payments);
  $("finance-net").textContent=money(s.net);
  $("finance-debt-balance").textContent=money(s.debt_balance);
  $("finance-upcoming").textContent=money(s.upcoming_obligations);
  $("finance-after-upcoming").textContent=money(s.net-s.upcoming_obligations);
  $("expense-date").value=financeData.today;
  $("obligation-date").value=financeData.today;
  $("debt-payment-date").value=financeData.today;
  const openDebts=financeData.debts.filter(debt=>debt.status==="open");
  $("payment-debt").innerHTML=openDebts.length?openDebts.map(debt=>'<option value="'+escapeHtml(debt.id)+'">'+escapeHtml(debt.title)+' · '+money(debt.balance)+'</option>').join(""):'<option value="">Нет открытых долгов</option>';
  $("debt-payment-form").querySelector("button").disabled=!openDebts.length;
  $("finance-debts").innerHTML=financeData.debts.length?financeData.debts.map(debt=>'<article class="finance-row"><div><b>'+escapeHtml(debt.title)+'</b><small>'+escapeHtml(debt.creditor||"")+(Number(debt.interest_rate)>0?" · "+debt.interest_rate+"% годовых":"")+(Number(debt.minimum_payment)>0?" · платёж "+money(debt.minimum_payment):"")+(debt.due_day?" · до "+debt.due_day+" числа":"")+'</small></div><strong>'+money(debt.balance)+'</strong></article>').join(""):'<p class="muted">Долги пока не добавлены.</p>';
  $("finance-obligations").innerHTML=financeData.obligations.length?financeData.obligations.map(item=>'<article class="finance-row"><div><b>'+escapeHtml(item.title)+'</b><small>'+item.due_date+' · '+(item.frequency==="monthly"?"ежемесячно":item.frequency==="weekly"?"еженедельно":"один раз")+'</small></div><strong>'+money(item.amount)+'</strong><button class="button ghost" data-obligation-paid="'+escapeHtml(item.id)+'">Оплачено</button></article>').join(""):'<p class="muted">Предстоящих платежей пока нет.</p>';
  $("finance-expense-list").innerHTML=financeData.expenses.length?financeData.expenses.slice(0,12).map(item=>'<article class="finance-row"><div><b>'+escapeHtml(item.title)+'</b><small>'+item.spent_on+' · '+escapeHtml(item.category)+'</small></div><strong>'+money(item.amount)+'</strong><button class="button ghost" data-expense-delete="'+escapeHtml(item.id)+'">×</button></article>').join(""):'<p class="muted">Расходов пока нет.</p>';
}
$("expense-form").addEventListener("submit",async e=>{
  e.preventDefault();
  try{await api("/api/finance",{method:"POST",body:JSON.stringify({action:"expense",title:$("expense-title").value,amount:$("expense-amount").value,category:$("expense-category").value,spent_on:$("expense-date").value})});$("expense-form").reset();await loadFinance();}
  catch(err){alert(err.message);}
});
$("debt-form").addEventListener("submit",async e=>{
  e.preventDefault();
  try{await api("/api/finance",{method:"POST",body:JSON.stringify({action:"debt",title:$("debt-title").value,creditor:$("debt-creditor").value,initial_amount:$("debt-amount").value,interest_rate:$("debt-rate").value,minimum_payment:$("debt-minimum").value,due_day:$("debt-due-day").value})});$("debt-form").reset();$("debt-rate").value="0";$("debt-minimum").value="0";await loadFinance();}
  catch(err){alert(err.message);}
});
$("obligation-form").addEventListener("submit",async e=>{
  e.preventDefault();
  try{await api("/api/finance",{method:"POST",body:JSON.stringify({action:"obligation",title:$("obligation-title").value,amount:$("obligation-amount").value,due_date:$("obligation-date").value,frequency:$("obligation-frequency").value})});$("obligation-form").reset();await loadFinance();}
  catch(err){alert(err.message);}
});
$("debt-payment-form").addEventListener("submit",async e=>{
  e.preventDefault();
  try{await api("/api/finance",{method:"POST",body:JSON.stringify({action:"debt_payment",debt_id:$("payment-debt").value,amount:$("debt-payment-amount").value,paid_on:$("debt-payment-date").value})});$("debt-payment-amount").value="";await loadFinance();}
  catch(err){alert(err.message);}
});
$("finance-obligations").addEventListener("click",async e=>{
  const button=e.target.closest("[data-obligation-paid]");if(!button)return;
  if(!confirm("Отметить платёж как оплаченный? Для повторяющегося платежа дата сдвинется на следующий период."))return;
  try{await api("/api/finance",{method:"POST",body:JSON.stringify({action:"obligation_paid",obligation_id:button.dataset.obligationPaid,paid_on:financeData.today})});await loadFinance();}
  catch(err){alert(err.message);}
});
$("finance-expense-list").addEventListener("click",async e=>{
  const button=e.target.closest("[data-expense-delete]");if(!button)return;
  if(!confirm("Удалить эту запись о расходе?"))return;
  try{await api("/api/finance",{method:"DELETE",body:JSON.stringify({type:"expense",id:button.dataset.expenseDelete})});await loadFinance();}
  catch(err){alert(err.message);}
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

async function loadWorkspace() {
  workspaceData = await api("/api/workspace");
  const dirs = '<option value="">Без направления</option>' + workspaceData.directions.map(d=>'<option value="'+escapeHtml(d.id)+'">'+escapeHtml(d.title)+'</option>').join("");
  $("client-direction").innerHTML=dirs; $("project-direction").innerHTML=dirs; $("task-direction").innerHTML=dirs;
  $("project-client").innerHTML='<option value="">Собственный проект / без клиента</option>'+workspaceData.clients.map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name)+'</option>').join("");
  $("task-client").innerHTML='<option value="">Без клиента</option>'+workspaceData.clients.map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name)+'</option>').join("");
  $("task-project").innerHTML='<option value="">Без проекта</option>'+workspaceData.projects.filter(p=>!["done","archived"].includes(p.status)).map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.title)+(p.client_name?' · '+escapeHtml(p.client_name):'')+'</option>').join("");
  $("task-life-area").innerHTML='<option value="">Не личная задача</option>'+workspaceData.life_areas.map(a=>'<option value="'+escapeHtml(a.id)+'">'+escapeHtml(a.title)+'</option>').join("");
  $("workspace-clients").innerHTML=workspaceData.clients.length?workspaceData.clients.map(c=>'<article class="workspace-item"><b>'+escapeHtml(c.name)+'</b><small>'+escapeHtml(c.direction_title||"Без направления")+' · '+Number(c.project_count||0)+' проектов</small><small>'+escapeHtml(c.contact||"Контакт не указан")+'</small><details class="workspace-edit"><summary>Изменить клиента</summary><form data-edit-client="'+escapeHtml(c.id)+'"><label>Имя / компания<input name="name" required maxlength="160" value="'+escapeHtml(c.name)+'"></label><label>Контакт<input name="contact" maxlength="240" value="'+escapeHtml(c.contact||"")+'"></label><label>Статус<select name="status"><option value="lead" '+(c.status==="lead"?"selected":"")+'>Потенциальный</option><option value="active" '+(c.status==="active"?"selected":"")+'>Активный</option><option value="paused" '+(c.status==="paused"?"selected":"")+'>Пауза</option><option value="closed" '+(c.status==="closed"?"selected":"")+'>Завершён</option></select></label><label>Заметки<textarea name="notes" rows="2" maxlength="3000">'+escapeHtml(c.notes||"")+'</textarea></label><button type="submit" class="button ghost">Сохранить клиента</button></form></details></article>').join(""):'<p class="muted">Клиенты пока не добавлены.</p>';
  $("workspace-projects").innerHTML=workspaceData.projects.length?workspaceData.projects.map(p=>{const total=Number(p.total_tasks||0),done=Number(p.done_tasks||0),percent=total?Math.round(done/total*100):0;return '<article class="workspace-item"><b>'+escapeHtml(p.title)+'</b><small>'+(p.client_name?escapeHtml(p.client_name)+' · ':'')+escapeHtml(p.direction_title||"Собственный проект")+'</small><small>'+(p.deadline?'Срок: '+escapeHtml(p.deadline)+' · ':'')+'Задачи: '+done+' из '+total+' выполнено · открыто: '+Number(p.open_tasks||0)+'</small>'+(total?'<div class="progress" role="progressbar" aria-label="Готовность проекта" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'"><span style="width:'+percent+'%"></span></div>':'<small class="muted">Пока нет задач — можно составить план с ИИ.</small>')+'<details class="workspace-edit"><summary>Изменить проект</summary><form data-edit-project="'+escapeHtml(p.id)+'"><label>Название<input name="title" required maxlength="180" value="'+escapeHtml(p.title)+'"></label><label>Описание<textarea name="description" rows="3" maxlength="5000">'+escapeHtml(p.description||"")+'</textarea></label><label>Ожидаемый результат<textarea name="expected_result" rows="2" maxlength="2000">'+escapeHtml(p.expected_result||"")+'</textarea></label><div class="workspace-inline"><label>Срок<input name="deadline" type="date" value="'+escapeHtml(p.deadline||"")+'"></label><label>Бюджет, ₽<input name="budget" type="number" min="0" step="0.01" value="'+Number(p.budget||0)+'"></label></div><label>Статус<select name="status"><option value="draft" '+(p.status==="draft"?"selected":"")+'>Черновик</option><option value="active" '+(p.status==="active"?"selected":"")+'>В работе</option><option value="waiting" '+(p.status==="waiting"?"selected":"")+'>Ожидание</option><option value="done" '+(p.status==="done"?"selected":"")+'>Завершён</option><option value="archived" '+(p.status==="archived"?"selected":"")+'>Архив</option></select></label><button type="submit" class="button ghost">Сохранить проект</button></form></details><div class="workspace-actions"><span class="status-chip">'+({active:"В работе",draft:"Черновик",waiting:"Ожидание",done:"Завершён",archived:"Архив"})[p.status]+'</span><button type="button" class="button ghost" data-project-plan="'+escapeHtml(p.id)+'">Составить план с ИИ</button></div></article>'}).join(""):'<p class="muted">Проекты пока не созданы.</p>';
  $("workspace-areas").innerHTML=workspaceData.life_areas.map(a=>'<article class="workspace-item"><b>'+escapeHtml(a.title)+'</b><small>'+escapeHtml(a.description||"Личные задачи и регулярные дела")+'</small></article>').join("");
}
$("client-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/workspace",{method:"POST",body:JSON.stringify({type:"client",name:$("client-name").value,direction_id:$("client-direction").value||null,contact:$("client-contact").value,notes:$("client-notes").value})});$("client-form").reset();await loadWorkspace();}catch(err){alert(err.message);}});
$("project-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/workspace",{method:"POST",body:JSON.stringify({type:"project",title:$("project-title").value,client_id:$("project-client").value||null,direction_id:$("project-direction").value||null,description:$("project-description").value,expected_result:$("project-result").value,deadline:$("project-deadline").value||null,budget:$("project-budget").value||0})});$("project-form").reset();await loadWorkspace();}catch(err){alert(err.message);}});
$("life-area-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/workspace",{method:"POST",body:JSON.stringify({type:"life_area",title:$("life-area-title").value,description:$("life-area-description").value})});$("life-area-form").reset();await loadWorkspace();}catch(err){alert(err.message);}});
$("workspace-clients").addEventListener("submit",async e=>{const form=e.target.closest("form[data-edit-client]");if(!form)return;e.preventDefault();const v=Object.fromEntries(new FormData(form));try{await api("/api/workspace",{method:"PATCH",body:JSON.stringify({type:"client",id:form.dataset.editClient,...v})});await loadWorkspace();}catch(err){alert(err.message);}});
$("workspace-projects").addEventListener("submit",async e=>{const form=e.target.closest("form[data-edit-project]");if(!form)return;e.preventDefault();const v=Object.fromEntries(new FormData(form));try{await api("/api/workspace",{method:"PATCH",body:JSON.stringify({type:"project",id:form.dataset.editProject,...v})});await loadWorkspace();}catch(err){alert(err.message);}});

$("workspace-projects").addEventListener("click",async e=>{const b=e.target.closest("[data-project-plan]");if(!b)return;const p=workspaceData.projects.find(x=>x.id===b.dataset.projectPlan);if(!p)return;b.disabled=true;b.textContent="Анализирую…";try{const data=await api("/api/projects/plan",{method:"POST",body:JSON.stringify({project_id:p.id})});pendingProjectPlan={project_id:p.id,steps:data.steps};$("project-plan-preview").classList.remove("hidden");$("project-plan-preview").innerHTML='<h4>Черновик плана: '+escapeHtml(p.title)+'</h4><p class="fine">Проверь задачи. Они попадут в общий список только после подтверждения.</p><ol>'+data.steps.map(s=>'<li><b>'+escapeHtml(s.title)+'</b><small>'+duration(s.minutes)+' · '+({high:"Высокий",medium:"Обычный",low:"Низкий"})[s.priority]+'</small>'+(s.description?'<small>'+escapeHtml(s.description)+'</small>':'')+'</li>').join("")+'</ol><div class="workspace-actions"><button type="button" class="button primary" id="save-project-plan">Подтвердить и создать задачи</button><button type="button" class="button ghost" id="discard-project-plan">Отменить</button></div>';}catch(err){alert(err.message);}finally{b.disabled=false;b.textContent="Составить план с ИИ";}});
$("project-plan-preview").addEventListener("click",async e=>{if(e.target.id==="discard-project-plan"){pendingProjectPlan=null;$("project-plan-preview").classList.add("hidden");return;}if(e.target.id==="save-project-plan"&&pendingProjectPlan){const b=e.target;b.disabled=true;b.textContent="Сохраняю…";try{await api("/api/projects/plan",{method:"POST",body:JSON.stringify({action:"save",project_id:pendingProjectPlan.project_id,steps:pendingProjectPlan.steps})});pendingProjectPlan=null;$("project-plan-preview").classList.add("hidden");await loadTasks();await loadWorkspace();alert("Задачи проекта добавлены в общий список.");}catch(err){alert(err.message);b.disabled=false;b.textContent="Повторить сохранение";}}});
$("project-client").addEventListener("change",()=>{const c=workspaceData.clients.find(x=>x.id===$("project-client").value);if(c?.direction_id)$("project-direction").value=c.direction_id;});
$("task-project").addEventListener("change",()=>{const p=workspaceData.projects.find(x=>x.id===$("task-project").value);if(p){$("task-client").value=p.client_id||"";$("task-direction").value=p.direction_id||"";$("task-life-area").value="";}});
$("task-life-area").addEventListener("change",()=>{if($("task-life-area").value){$("task-project").value="";$("task-client").value="";$("task-direction").value="";$("task-parent").value="";}});
$("task-parent").addEventListener("change",()=>{const p=allTasks.find(x=>x.id===$("task-parent").value);if(p){$("task-project").value=p.project_id||"";$("task-client").value=p.client_id||"";$("task-direction").value=p.direction_id||"";$("task-life-area").value=p.life_area_id||"";}});


let recurringTemplates=[];
const recurrenceLabels={daily:"Каждый день",weekly:"Каждую неделю",monthly:"Каждый месяц"};
async function loadRecurringTemplates(){
 const data=await api("/api/task-templates");recurringTemplates=data.templates||[];
 $("recurring-area").innerHTML='<option value="">Без области</option>'+workspaceData.life_areas.map(a=>'<option value="'+escapeHtml(a.id)+'">'+escapeHtml(a.title)+'</option>').join("");
 $("recurring-start").value=localToday;
 $("recurring-task-list").innerHTML=recurringTemplates.length?recurringTemplates.map(t=>'<article class="recurring-item"><div><b>'+escapeHtml(t.title)+'</b><small>'+escapeHtml(t.life_area_title||"Без личной области")+' · '+recurrenceLabels[t.recurrence]+' · с '+escapeHtml(t.start_date)+(t.end_date?' по '+escapeHtml(t.end_date):' без даты окончания')+'</small><small>Открытых задач на ближайшие 30 дней: '+Number(t.open_instances||0)+(t.active?'':' · приостановлено')+'</small>'+(t.steps?.length?'<small>Подзадачи: '+t.steps.map(x=>escapeHtml(x.title)).join(' · ')+'</small>':'')+'</div><button type="button" class="button ghost" data-toggle-template="'+escapeHtml(t.id)+'" data-active="'+(t.active?0:1)+'">'+(t.active?'Приостановить':'Возобновить')+'</button></article>').join(""):'<p class="muted">Шаблонов пока нет. Добавь регулярные дела — они будут появляться в списке задач автоматически.</p>';
}
$("recurring-task-form").addEventListener("submit",async e=>{
 e.preventDefault();
 const button=e.submitter;button.disabled=true;button.textContent="Создаю…";
 try{
  await api("/api/task-templates",{method:"POST",body:JSON.stringify({title:$("recurring-title").value,description:$("recurring-description").value,life_area_id:$("recurring-area").value||null,recurrence:$("recurring-rule").value,start_date:$("recurring-start").value,end_date:$("recurring-end").value||null,estimated_minutes:$("recurring-minutes").value||null,priority:$("recurring-priority").value,steps:$("recurring-subtasks").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)})});
  $("recurring-task-form").reset();$("recurring-start").value=localToday;await loadRecurringTemplates();await loadTasks();
 }catch(err){alert(err.message);}
 finally{button.disabled=false;button.textContent="Создать повторяющуюся задачу";}
});
$("recurring-task-list").addEventListener("click",async e=>{
 const b=e.target.closest("[data-toggle-template]");if(!b)return;
 b.disabled=true;
 try{await api("/api/task-templates",{method:"POST",body:JSON.stringify({action:"toggle",id:b.dataset.toggleTemplate,active:Number(b.dataset.active)})});await loadRecurringTemplates();await loadTasks();}
 catch(err){alert(err.message);b.disabled=false;}
});

async function loadTasks() {
  const [data, timerData] = await Promise.all([api("/api/tasks"), api("/api/task-time")]); allTasks = data.tasks; taskTimerState = timerData;
  $("task-parent").innerHTML = '<option value="">Самостоятельная задача</option>' + allTasks.filter(t=>t.status!=="done").map(t=>'<option value="'+escapeHtml(t.id)+'">'+escapeHtml(t.title)+'</option>').join("");
  $("task-count").textContent = allTasks.filter(t => t.status !== "done").length;
  renderTasks();
}
function renderTasks() {
  const now = new Date(localToday + "T00:00:00Z");
  const day = now.getUTCDay() || 7;
  const monday = new Date(now); monday.setUTCDate(now.getUTCDate() - day + 1);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  const mondayKey = monday.toISOString().slice(0,10), sundayKey = sunday.toISOString().slice(0,10);
  const filteredTasks = allTasks.filter(task => {
    if (taskFilter === "all") return true;
    if (taskFilter === "today") return !task.due_date || task.due_date <= localToday;
    return task.due_date && task.due_date >= mondayKey && task.due_date <= sundayKey;
  });
  const visible = [];
  for (const task of filteredTasks) {
    if (task.parent_task_id) continue;
    visible.push(task);
    visible.push(...filteredTasks.filter(child => child.parent_task_id === task.id));
  }
  visible.push(...filteredTasks.filter(task => task.parent_task_id && !visible.some(item => item.id === task.id)));
  $("tasks").innerHTML = visible.length ? visible.map(t => {
    const dateText = t.due_date ? (t.due_date < localToday ? "Просрочено · " : "") + t.due_date : "Без срока";
    const priorityText = ({high:"Высокий",medium:"Обычный",low:"Низкий"})[t.priority] || "Обычный";
    return '<article class="task-card ' + (t.status === "done" ? "done " : "") + (t.parent_task_id ? "subtask-card" : "") + '">' +
      '<label class="task"><input type="checkbox" data-task="' + t.id + '" ' + (t.status === "done" ? "checked" : "") + '><span class="task-body"><b>' + escapeHtml(t.title) + '</b><small>' + escapeHtml(dateText) + " · " + escapeHtml(t.project_title || t.life_area_title || t.direction_title || "Без привязки") + (t.client_name ? " · " + escapeHtml(t.client_name) : "") + (t.parent_task_title ? " · Подзадача: " + escapeHtml(t.parent_task_title) : "") + (t.template_id ? " · Повторяется" : "") + ' · ' + priorityText + '</small></span></label>' +
      '<div class="task-time"><span>План: <b>' + (t.estimated_minutes ? duration(t.estimated_minutes) : "не задан") + '</b></span><span>Факт: <b>' + (t.actual_minutes == null ? "—" : duration(t.actual_minutes)) + '</b></span><span>Таймер: <b>' + duration((taskTimerState.totals.find(item=>item.task_id===t.id)?.tracked_minutes)||0) + '</b> · ' + Number(taskTimerState.totals.find(item=>item.task_id===t.id)?.sessions||0) + ' сессий</span>' + (taskTimerState.active_timer?.task_id===t.id ? '<span>Начато: <b>' + new Date(taskTimerState.active_timer.started_at).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}) + '</b></span>' : '') + '<button type="button" class="button ghost" data-task-timer="' + t.id + '" ' + (t.status==="done" || (taskTimerState.active_timer && taskTimerState.active_timer.task_id!==t.id) ? "disabled" : "") + '>' + (taskTimerState.active_timer?.task_id===t.id ? "Остановить таймер" : taskTimerState.active_timer ? "Таймер занят" : "Начать работу") + '</button></div>' +
      '<div class="task-ai"><button type="button" class="button ghost" data-delegate-task="' + t.id + '">' + (t.delegated_result ? "Подготовить заново с ИИ" : "Поручить ИИ") + '</button>' +
      (t.delegated_result ? '<details class="delegated-saved"><summary>Результат ИИ' + (t.delegated_at ? ' · ' + escapeHtml(t.delegated_at) : '') + '</summary><div class="delegated-output">' + escapeHtml(t.delegated_result) + '</div></details>' : '') + '</div>' +
      '<div class="task-steps"><div class="task-steps-head"><b>План выполнения</b><button type="button" class="button ghost" data-plan-task="' + t.id + '">' + (t.steps?.length ? "Обновить план" : "Разбить на этапы с ИИ") + '</button></div>' +
      (t.steps?.length ? '<div class="task-step-list">' + t.steps.map(step => '<label class="task-step ' + (step.status === "done" ? "done" : "") + '"><input type="checkbox" data-task-step="' + step.id + '" ' + (step.status === "done" ? "checked" : "") + '><span>' + escapeHtml(step.title) + '</span><small>' + duration(step.estimated_minutes) + '</small></label>').join("") + '</div><small class="task-step-progress">Готово: ' + t.steps.filter(step => step.status === "done").length + ' из ' + t.steps.length + '</small>' : '<small class="muted">ИИ может превратить большую задачу в последовательность конкретных шагов.</small>') +
      '</div></article>';
  }).join("") : '<p class="muted">В этом периоде задач нет. Добавь следующий конкретный шаг.</p>';
  document.querySelectorAll("[data-task]").forEach(input => input.addEventListener("change", async () => {
    await api("/api/tasks", { method: "PATCH", body: JSON.stringify({ id: input.dataset.task, status: input.checked ? "done" : "todo" }) }); await loadTasks(); await rebuildDayPlanIfToday();
  }));
  document.querySelectorAll("[data-task-timer]").forEach(button => button.addEventListener("click", async () => {
    const taskId = button.dataset.taskTimer;
    const isActive = taskTimerState.active_timer?.task_id === taskId;
    button.disabled = true;
    try {
      await api("/api/task-time", { method:"POST", body:JSON.stringify(isActive ? {action:"stop"} : {action:"start",task_id:taskId}) });
      await loadTasks();
      await rebuildDayPlanIfToday();
    } catch (err) { alert(err.message); button.disabled = false; }
  }));
  document.querySelectorAll("[data-save-time]").forEach(button => button.addEventListener("click", async () => {
    const input = document.querySelector('[data-actual-time="' + button.dataset.saveTime + '"]');
    try { await api("/api/tasks", { method: "PATCH", body: JSON.stringify({ id: button.dataset.saveTime, actual_minutes: input.value === "" ? null : input.value }) }); await loadTasks(); await rebuildDayPlanIfToday(); }
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
    try { await api("/api/tasks/steps", { method: "PATCH", body: JSON.stringify({ id: input.dataset.taskStep, status: input.checked ? "done" : "todo" }) }); await loadTasks(); await rebuildDayPlanIfToday(); }
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
  if(calendarView==="day") return {from:calendarSelected+"T00:00",to:shiftDate(calendarSelected,1)+"T00:00"};
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
  const selectedLabel=new Intl.DateTimeFormat("ru-RU",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date(calendarSelected+"T12:00:00"));
  const weekStart=new Date(calendarSelected+"T12:00:00");
  weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));
  const weekEnd=new Date(weekStart); weekEnd.setDate(weekStart.getDate()+6);
  $("calendar-caption").textContent=calendarView==="month"?monthName:calendarView==="day"?selectedLabel:new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"short"}).format(weekStart)+" — "+new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"short",year:"numeric"}).format(weekEnd);
  document.querySelector(".calendar-weekdays").classList.toggle("hidden",calendarView!=="month");
  const cells=[];
  if(calendarView==="day"){
    const selectedTasks=allTasks.filter(t=>t.due_date===calendarSelected);
    if(selectedTasks.length)cells.push('<div class="calendar-hour-row calendar-task-row"><span class="calendar-hour-label">Весь день</span><div class="calendar-hour-events">'+selectedTasks.map(t=>'<label class="calendar-task-chip"><input type="checkbox" data-calendar-task="'+escapeHtml(t.id)+'" '+(t.status==="done"?"checked":"")+'><span>'+escapeHtml(t.title)+'</span></label>').join("")+'</div></div>');
    for(let hour=0;hour<24;hour++){
      const items=calendarEvents.filter(e=>{
        const start=e.start_at.slice(0,10)<calendarSelected?0:e.start_at.slice(0,10)>calendarSelected?1440:Number(e.start_at.slice(11,13))*60+Number(e.start_at.slice(14,16));
        const end=e.end_at.slice(0,10)>calendarSelected?1440:e.end_at.slice(0,10)<calendarSelected?0:Number(e.end_at.slice(11,13))*60+Number(e.end_at.slice(14,16));
        return Math.max(0,Math.floor(start/60))===hour&&end>hour*60;
      });
      cells.push('<div class="calendar-hour-row"><span class="calendar-hour-label">'+pad2(hour)+':00</span><div class="calendar-hour-events">'+items.map(e=>'<button type="button" class="calendar-hour-event '+eventColors[e.event_type]+'" data-edit-event="'+e.id+'">'+(e.start_at.slice(0,10)<calendarSelected?'↳ ':eventTime(e.start_at)+' ')+escapeHtml(e.title)+'</button>').join("")+'</div></div>');
    }
  } else {
    const start=calendarView==="month"?new Date(calendarAnchor.getFullYear(),calendarAnchor.getMonth(),1):weekStart;
    if(calendarView==="month") start.setDate(1-((start.getDay()+6)%7));
    const count=calendarView==="month"?42:7;
    for(let i=0;i<count;i++){
      const d=new Date(start);d.setDate(start.getDate()+i);
      const key=dateKey(d);
      const items=calendarEvents.filter(e=>e.start_at.slice(0,10)<=key&&(e.end_at.slice(0,10)>key||(e.end_at.slice(0,10)===key&&e.end_at.slice(11,16)!=="00:00")));
      const tasks=allTasks.filter(t=>t.due_date===key);
      const dayLabel=calendarView==="week"?new Intl.DateTimeFormat("ru-RU",{weekday:"short"}).format(d)+" "+d.getDate():d.getDate();
      cells.push('<button type="button" class="calendar-day '+(key===calendarSelected?"selected ":"")+(d.getMonth()!==calendarAnchor.getMonth()&&calendarView==="month"?"outside ":"")+(key===localToday?"today":"")+'" data-calendar-date="'+key+'"><span class="calendar-day-number">'+dayLabel+'</span><span class="calendar-day-events">'+items.slice(0,3).map(e=>'<small class="event-dot '+eventColors[e.event_type]+'">'+escapeHtml(e.start_at.slice(0,10)<key?"↳":eventTime(e.start_at))+' '+escapeHtml(e.title)+'</small>').join("")+tasks.slice(0,2).map(t=>'<small class="event-dot task">'+(t.status==="done"?"✓ ":"□ ")+escapeHtml(t.title)+'</small>').join("")+((items.length+tasks.length)>5?'<small class="event-more">+'+(items.length+tasks.length-5)+'</small>':"")+'</span></button>');
    }
  }
  $("calendar-grid").className="calendar-grid "+(calendarView==="week"?"week-view":calendarView==="day"?"day-view":"month-view");
  $("calendar-grid").innerHTML=cells.join("");
  document.querySelectorAll("[data-calendar-view]").forEach(b=>b.classList.toggle("active",b.dataset.calendarView===calendarView));
  $("calendar-selected-date").textContent=new Intl.DateTimeFormat("ru-RU",{weekday:"long",day:"numeric",month:"long"}).format(new Date(calendarSelected+"T12:00:00"));
  const dayEvents=calendarEvents.filter(e=>e.start_at.slice(0,10)<=calendarSelected&&(e.end_at.slice(0,10)>calendarSelected||(e.end_at.slice(0,10)===calendarSelected&&e.end_at.slice(11,16)!=="00:00"))).sort((a,b)=>a.start_at.localeCompare(b.start_at));
  $("calendar-events").innerHTML=dayEvents.length?dayEvents.map(e=>'<article class="calendar-event"><div class="calendar-event-time">'+eventTime(e.start_at)+'–'+eventTime(e.end_at)+'</div><div class="calendar-event-main"><b>'+escapeHtml(e.title)+'</b><small>'+eventTypes[e.event_type]+' · '+eventDuration(e)+(e.repeat_rule&&e.repeat_rule!=="none"?" · повторяется "+(e.repeat_rule==="daily"?"ежедневно":"еженедельно"):"")+(e.mode!=="none"?" · "+(e.mode==="online"?"онлайн":"офлайн"):"")+'</small>'+(e.location?'<small>'+escapeHtml(e.location)+'</small>':"")+(e.actual_start_at||e.actual_end_at?'<small>Факт: '+(eventTime(e.actual_start_at)||"—")+'–'+(eventTime(e.actual_end_at)||"—")+'</small>':"")+'</div><div class="calendar-event-actions"><button type="button" class="button ghost" data-edit-event="'+e.id+'">Изменить</button><button type="button" class="button ghost" data-delete-event="'+(e.series_id||e.id)+'">Удалить</button></div></article>').join(""):'<p class="muted">На этот день событий пока нет. Добавь встречи, дорогу, хобби или сон.</p>';
  const selectedTasks=allTasks.filter(t=>t.due_date===calendarSelected);
  if(selectedTasks.length)$("calendar-events").innerHTML+='<div class="calendar-task-agenda"><b>Задачи на этот день</b>'+selectedTasks.map(t=>'<label class="calendar-task-chip"><input type="checkbox" data-calendar-task="'+escapeHtml(t.id)+'" '+(t.status==="done"?"checked":"")+'><span>'+escapeHtml(t.title)+'</span></label>').join("")+'</div>';
  document.querySelectorAll("[data-calendar-task]").forEach(input=>input.addEventListener("change",async()=>{
    input.disabled=true;
    try{await api("/api/tasks",{method:"PATCH",body:JSON.stringify({id:input.dataset.calendarTask,status:input.checked?"done":"todo"})});await loadTasks();await loadCalendar();await rebuildDayPlanIfToday();}
    catch(err){alert(err.message);input.checked=!input.checked;input.disabled=false;}
  }));
  document.querySelectorAll("[data-calendar-date]").forEach(b=>b.addEventListener("click",async()=>{calendarSelected=b.dataset.calendarDate;const d=new Date(calendarSelected+"T12:00:00");calendarAnchor=new Date(d.getFullYear(),d.getMonth(),1);await loadCalendar();}));
  document.querySelectorAll("[data-edit-event]").forEach(b=>b.addEventListener("click",()=>editCalendarEvent(calendarEvents.find(e=>e.id===b.dataset.editEvent))));
  document.querySelectorAll("[data-delete-event]").forEach(b=>b.addEventListener("click",async()=>{if(!confirm("Удалить это событие и всю серию повторений?"))return;try{await api("/api/calendar/events",{method:"DELETE",body:JSON.stringify({id:b.dataset.deleteEvent})});currentDayPlan=null;renderDayPlan();await loadCalendar();await rebuildDayPlanIfToday();}catch(err){alert(err.message);}}));
}
function openCalendarForm(event=null) {
  $("calendar-form").classList.remove("hidden");
  $("calendar-form-title").textContent=event?"Изменить событие":"Новое событие";
  $("event-id").value=event?.series_id||event?.id||"";
  $("event-title").value=event?.title||"";
  $("event-type").value=event?.event_type||"meeting";
  $("event-mode").value=event?.mode||"none";
  $("event-start").value=event?.series_start_at||event?.start_at||calendarSelected+"T09:00";
  $("event-end").value=event?.series_end_at||event?.end_at||calendarSelected+"T10:00";
  $("event-actual-start").value=event?.actual_start_at||"";
  $("event-actual-end").value=event?.actual_end_at||"";
  $("event-status").value=event?.status||"planned";
  $("event-repeat").value=event?.repeat_rule||"none";
  $("event-repeat-until").value=event?.repeat_until||"";
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
  const payload={id,title:$("event-title").value,event_type:$("event-type").value,mode:$("event-mode").value,start_at:$("event-start").value,end_at:$("event-end").value,actual_start_at:$("event-actual-start").value||null,actual_end_at:$("event-actual-end").value||null,status:$("event-status").value,repeat_rule:$("event-repeat").value,repeat_until:$("event-repeat-until").value||null,location:$("event-location").value,notes:$("event-notes").value};
  try{await api("/api/calendar/events",{method:id?"PATCH":"POST",body:JSON.stringify(payload)});$("calendar-form").classList.add("hidden");calendarSelected=payload.start_at.slice(0,10);const selectedDate=new Date(calendarSelected+"T12:00:00");calendarAnchor=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1);currentDayPlan=null;renderDayPlan();await loadCalendar();await rebuildDayPlanIfToday();}
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
async function rebuildDayPlanIfToday() {
  if (calendarSelected !== localToday) return;
  try {
    const capacity = Number(userSettings.daily_capacity_minutes || 360);
    const data = await api("/api/planner/day", { method:"POST", body:JSON.stringify({ available_minutes:capacity }) });
    currentDayPlan = data.plan;
    $("planner-date").textContent = data.date || localToday;
    renderDayPlan();
  } catch (err) {
    console.warn("Не удалось пересчитать план дня:", err);
  }
}
function renderDayPlan() {
  const plan = currentDayPlan;
  if (!plan) {
    $("day-plan").innerHTML = '<p class="muted">План ещё не сформирован. Нажми кнопку — ИИ расставит задачи по приоритету и доступному времени.</p>';
    return;
  }
  const items = Array.isArray(plan.items) ? plan.items : [];
  $("day-plan").innerHTML = '<h3>' + escapeHtml(plan.headline || "План на сегодня") + '</h3><p class="planner-focus">' + escapeHtml(plan.focus || "") + '</p>' +
    (items.length ? '<ol class="planner-items">' + items.map(item => '<li><div><b>' + escapeHtml(item.title) + '</b><small>' + escapeHtml(item.reason || "") + '</small>' + (item.scheduled ? '<small class="planner-slot">' + item.start_at.slice(11,16) + '–' + item.end_at.slice(11,16) + '</small>' : item.scheduled === false ? '<small class="planner-unscheduled">' + escapeHtml(item.schedule_note || "Не помещается в свободные окна") + '</small>' : '') + '</div><span>' + duration(item.minutes) + '</span></li>').join("") + '</ol>' : '<p class="muted">Пока нет подходящих незавершённых задач. Добавь конкретные следующие шаги в список задач.</p>') +
    '<div class="planner-summary"><span>Свободно с учётом календаря: <b>' + duration(plan.available_minutes || 0) + '</b></span><span>Уже отработано: <b>' + duration(plan.work_already_done_minutes || 0) + '</b></span><span>Календарь занят: <b>' + duration(plan.calendar_busy_minutes_remaining || 0) + '</b></span><span>Запланировано: <b>' + duration(plan.total_minutes || 0) + '</b></span><span>Резерв: <b>' + duration(plan.reserve_minutes || 0) + '</b></span><span>Без временного слота: <b>' + Number(plan.unscheduled_count || 0) + '</b></span><span>Источник: <b>' + (plan.source === "ai" ? "ИИ" : "алгоритм") + '</b></span></div>';
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
    showApp(user.email); await loadDashboardData(); await loadFinance(); await loadAnalytics(); await loadWorkspace(); await loadRecurringTemplates(); await loadTasks(); calendarSelected=localToday; calendarAnchor=new Date(localToday+"T12:00:00"); await loadCalendar(); await loadPlanner();
  } catch { showAuth(); }
}
boot();
