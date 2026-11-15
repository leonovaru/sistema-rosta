const $ = id => document.getElementById(id);
let authMode = "login";
let directions = [];
let userSettings = { monthly_target: 300000, timezone: "Europe/Moscow" };
let allTasks = [];
let taskTimerState = { active_timer:null, totals:[] };
let taskFilter = "today";
let localToday = "";
let taskEstimate = null;
let estimateAccuracyData = null;
let currentDayPlan = null;
let calendarEvents = [];
let calendarAnchor = new Date();
let calendarSelected = "";
let calendarView = "month";
let workspaceData = {clients:[],projects:[],life_areas:[],directions:[]};
let pendingProjectPlan = null;
let dailyBlockPreferences = { start: "09:00", focus: 50, rest: 10, prep: 0, after: 0, variant: "priority" };
try { dailyBlockPreferences = { ...dailyBlockPreferences, ...JSON.parse(localStorage.getItem("dailyBlockPreferences") || "{}") }; } catch {}
function renderDailyBlockCards(plans) {
 return (plans||[]).map(day=>{
  const blocks=(day.blocks||[]).map(block=>{
   const start=block.start_time||"—",end=block.end_time||"—";
   const load=block.type==="break"?"Восстановление между блоками":(block.cognitive_load==="high"?"Высокая концентрация":block.cognitive_load==="low"?"Рутинная задача":"Средняя концентрация");
   return '<div class="balance-row"><div><b>'+(block.type==="break"?'Перерыв':escapeHtml(block.title))+'</b><small>'+start+'–'+end+' · '+load+'</small></div><strong>'+duration(block.minutes)+'</strong></div>';
  }).join("");
  return '<article class="weekly-focus-card"><div><b>'+escapeHtml(day.date)+(day.overloaded?' · часть задач не помещается':'')+'</b><small>Фокус: '+duration(day.focus_minutes)+' · перерывы: '+duration(day.break_minutes)+' · доступно: '+duration(day.available_minutes)+'</small></div>'+blocks+(day.calendar_conflicts?'<p class="weekly-warning">Обнаружено пересечений с календарём: '+day.calendar_conflicts+'</p>':'')+(day.unallocated?.length?'<p class="weekly-warning">Не помещается в доступное время: '+day.unallocated.map(row=>escapeHtml(row.title)+' — '+duration(row.minutes)).join('; ')+'</p>':'')+'</article>';
 }).join("");
}



function renderDailyReallocationProposals(data){
 const proposals=data?.proposals||[];
 if(!proposals.length)return '<section class="weekly-balance"><h5>Переносы между днями</h5><p class="muted">Нет переносов, которые одновременно укладываются в сроки и свободные окна календаря.</p></section>';
 const rows=proposals.map(move=>'<div class="balance-row"><div><b>'+escapeHtml(move.title)+'</b><small>'+escapeHtml(move.from)+' → '+escapeHtml(move.to)+' · '+duration(move.minutes)+' · '+escapeHtml(move.reason)+'</small></div><strong>'+escapeHtml(move.priority==="high"?"Высокий":move.priority==="low"?"Низкий":"Обычный")+'</strong></div>').join("");
 return '<section class="weekly-balance daily-reallocation"><h5>Возможное перераспределение по дням</h5><p class="fine">Система проверила дедлайны, рабочие дни, календарную занятость и отсутствие вытеснения уже помещающихся задач. Это предварительный сценарий: сроки и задачи не меняются.</p>'+rows+'<p class="fine">Для фактического применения потребуется отдельное сохранение дневных назначений: сейчас задача распределяется алгоритмом по всем рабочим дням до дедлайна.</p><p class="fine">Предложено переносов: '+proposals.length+' · нераспределённый остаток после сценария: '+duration(data.summary?.remaining_unallocated_minutes||0)+'</p></section>';
}

function renderDailyBlockScenarios(scenarios,selected="priority") {
 const valid=(scenarios||[]).some(item=>item.key===selected)?selected:"priority";
 return '<div class="daily-block-variant-tabs">'+(scenarios||[]).map(item=>'<button type="button" class="button '+(item.key===valid?'':'ghost')+'" data-daily-block-scenario="'+escapeHtml(item.key)+'" aria-pressed="'+(item.key===valid?'true':'false')+'">'+escapeHtml(item.title)+'</button>').join("")+'</div>'+
 (scenarios||[]).map(item=>{
  const m=item.summary||{};
  const comparison='<div class="balance-row"><div><b>Полностью помещаются</b><small>Задачи без остатка</small></div><strong>'+Number(m.completed_tasks||0)+' из '+Number(m.total_tasks||0)+'</strong></div>'+
   '<div class="balance-row"><div><b>Важные задачи</b><small>Полностью помещаются</small></div><strong>'+Number(m.high_priority_completed||0)+' из '+Number(m.high_priority_tasks||0)+'</strong></div>'+
   '<div class="balance-row"><div><b>Частично / не помещаются</b><small>'+Number(m.partially_scheduled_tasks||0)+' частично · '+Number(m.unplaced_tasks||0)+' не начаты</small></div><strong>'+duration(m.unallocated_minutes||0)+'</strong></div>'+
   '<div class="balance-row"><div><b>Свободный остаток</b><small>После блоков и перерывов</small></div><strong>'+duration(m.unused_minutes||0)+'</strong></div>'+
   '<div class="balance-row"><div><b>Перегруженные дни</b><small>Есть задачи с нераспределённым временем</small></div><strong>'+Number(m.overloaded_days||0)+'</strong></div>'+
   '<div class="balance-row"><div><b>Переносы между днями</b><small>В этом сравнении задачи остаются в исходных днях</small></div><strong>0</strong></div>';
  return '<section class="daily-block-variant" data-daily-block-panel="'+escapeHtml(item.key)+'" '+(item.key===valid?'':'hidden')+'><p class="fine">'+escapeHtml(item.description)+' · только черновик, задачи и календарь не меняются</p><article class="weekly-focus-card"><b>Сравнение варианта</b>'+comparison+'</article>'+renderDailyBlockCards(item.plans)+'</section>';
 }).join("");
}

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
$("logout").addEventListener("click", async () => {
  const button=$("logout");
  button.disabled=true;
  try{
    if("serviceWorker" in navigator && "PushManager" in window){
      const registration=await navigator.serviceWorker.getRegistration();
      const subscription=await registration?.pushManager.getSubscription();
      if(subscription){
        // Keep the session active if the server cannot remove the device row:
        // otherwise the scheduler could continue sending to a logged-out account.
        await api("/api/push-subscriptions",{method:"DELETE",body:JSON.stringify({endpoint:subscription.endpoint})});
        const removed=await subscription.unsubscribe().catch(()=>false);
        if(!removed)console.warn("Подписка удалена на сервере, но браузер не подтвердил локальную отписку.");
      }
    }
    await api("/api/auth/logout",{method:"POST"});
    showAuth();
  }catch(error){
    alert("Не удалось безопасно завершить выход: "+error.message+"\nСеанс оставлен открытым. Проверьте соединение и повторите попытку.");
  }finally{button.disabled=false;}
});
function suggestAdjustedEstimate(baseMinutes, accuracy, scopeKey = null) {
 const base=Number(baseMinutes);if(!Number.isFinite(base)||base<5||base>10000)return null;
 const scoped=scopeKey?(accuracy?.by_area||[]).find(row=>row.key===scopeKey):null;
 const source=scoped?.recommended_estimate_multiplier!=null?scoped:accuracy?.overall;
 if(!source||source.recommended_estimate_multiplier==null||source.sample_count<(accuracy?.minimum_samples||3))return null;
 const multiplier=Number(source.recommended_estimate_multiplier);if(!Number.isFinite(multiplier)||multiplier<=0)return null;
 return {base_minutes:Math.round(base),suggested_minutes:Math.max(5,Math.min(10000,Math.round(base*multiplier/5)*5)),multiplier,sample_count:source.sample_count,scope:source===scoped?"specific":"overall",title:source===scoped?scoped.title:"вся история задач"};
}
function currentEstimateScopeKey(){const project=$("task-project")?.value,area=$("task-life-area")?.value,direction=$("task-direction")?.value;return project?"project:"+project:area?"life:"+area:direction?"direction:"+direction:null;}
function renderHistoricalEstimateSuggestion(){
 const result=$("estimate-result");if(!result||!taskEstimate)return;
 result.querySelectorAll(".estimate-history-suggestion,.estimate-similar-suggestion").forEach(node=>node.remove());
 const suggestion=suggestAdjustedEstimate(taskEstimate.base_minutes??taskEstimate.minutes,estimateAccuracyData,currentEstimateScopeKey());
 if(suggestion){
  const applied=taskEstimate.historical_adjustment?.suggested_minutes===taskEstimate.minutes;
  const panel=document.createElement("div");panel.className="estimate-history-suggestion";
  panel.innerHTML='<p><b>Поправка по категории задач</b><br>Для '+escapeHtml(suggestion.title)+': ×'+suggestion.multiplier+' на основе '+suggestion.sample_count+' завершённых задач. '+duration(suggestion.base_minutes)+' → <b>'+duration(suggestion.suggested_minutes)+'</b>.</p><button type="button" class="button ghost" data-apply-history-estimate '+(applied?'disabled':'')+'>'+(applied?'Поправка применена':'Применить поправку категории')+'</button>';
  result.appendChild(panel);
 }
 const similar=taskEstimate.similar_task_history;
 if(similar?.multiplier&&similar.sample_count>=3){
  const minutes=Math.max(5,Math.round((taskEstimate.base_minutes??taskEstimate.minutes)*similar.multiplier/5)*5);
  const applied=taskEstimate.similar_adjustment?.suggested_minutes===taskEstimate.minutes;
  const examples=(similar.examples||[]).map(row=>escapeHtml(row.title)+' ('+duration(row.actual_minutes)+' фактически)').join("; ");
  const panel=document.createElement("div");panel.className="estimate-similar-suggestion";
  panel.innerHTML='<p><b>Похожие завершённые задачи</b><br>Найдено '+similar.sample_count+' похожих задач. Их медианный коэффициент факта к оценке: ×'+similar.multiplier+'. '+duration(taskEstimate.base_minutes??taskEstimate.minutes)+' → <b>'+duration(minutes)+'</b>.</p><small class="fine">Примеры: '+examples+'.</small><button type="button" class="button ghost" data-apply-similar-estimate '+(applied?'disabled':'')+'>'+(applied?'Поправка применена':'Применить поправку похожих задач')+'</button>';
  result.appendChild(panel);
 }
}
$("estimate-result").addEventListener("click",event=>{
 if(!taskEstimate)return;
 if(event.target.closest("[data-apply-history-estimate]")){
  const suggestion=suggestAdjustedEstimate(taskEstimate.base_minutes??taskEstimate.minutes,estimateAccuracyData,currentEstimateScopeKey());if(!suggestion)return;
  taskEstimate.minutes=suggestion.suggested_minutes;taskEstimate.historical_adjustment=suggestion;taskEstimate.similar_adjustment=null;renderHistoricalEstimateSuggestion();return;
 }
 if(event.target.closest("[data-apply-similar-estimate]")){
  const similar=taskEstimate.similar_task_history;if(!similar?.multiplier||similar.sample_count<3)return;
  const minutes=Math.max(5,Math.round((taskEstimate.base_minutes??taskEstimate.minutes)*similar.multiplier/5)*5);
  taskEstimate.minutes=minutes;taskEstimate.similar_adjustment={suggested_minutes:minutes,multiplier:similar.multiplier,sample_count:similar.sample_count};taskEstimate.historical_adjustment=null;renderHistoricalEstimateSuggestion();
 }
});
["task-project","task-life-area","task-direction"].forEach(id=>$(id).addEventListener("change",renderHistoricalEstimateSuggestion));
$("estimate-task").addEventListener("click", async () => {
  const title = $("task-title").value.trim();
  if (!title) { alert("Сначала введи название задачи."); $("task-title").focus(); return; }
  const button = $("estimate-task");
  button.disabled = true; button.textContent = "Оцениваю…";
  $("estimate-result").classList.remove("hidden");
  $("estimate-result").textContent = "Анализирую объём задачи и возможность делегирования.";
  try {
    taskEstimate = await api("/api/tasks/estimate", { method: "POST", body: JSON.stringify({ title, description: $("task-description").value, project_id: $("task-project").value || null, life_area_id: $("task-life-area").value || null, direction_id: $("task-direction").value || null }) });
    taskEstimate.base_minutes = taskEstimate.minutes;
    const delegation = ({full:"Можно поручить ИИ почти целиком",partial:"ИИ выполнит часть работы, тебе останется проверить результат",manual:"Нужно твоё участие или действие вне приложения"})[taskEstimate.delegation];
    const steps = (taskEstimate.steps || []).map(step => "<li>" + escapeHtml(step.title) + " — " + duration(step.minutes) + "</li>").join("");
    $("estimate-result").innerHTML = "<strong>Оценка: " + duration(taskEstimate.range_min) + "–" + duration(taskEstimate.range_max) + "</strong><p>" + escapeHtml(taskEstimate.rationale || "") + "</p><p><b>" + delegation + "</b></p><p>" + escapeHtml(taskEstimate.delegation_reason || "") + "</p>" + (steps ? "<ul>"+steps+"</ul>" : "") + "<small>" + (taskEstimate.source === "ai" ? "Оценка ИИ" : "Черновая алгоритмическая оценка") + (taskEstimate.note ? " · "+escapeHtml(taskEstimate.note) : "") + "</small>";
    renderHistoricalEstimateSuggestion();

  } catch (err) { taskEstimate = null; $("estimate-result").textContent = err.message; }
  finally { button.disabled = false; button.textContent = "Оценить время и делегирование с ИИ"; }
});
["task-title","task-description"].forEach(id => $(id).addEventListener("input", () => { taskEstimate = null; $("estimate-result").classList.add("hidden"); $("estimate-result").textContent = ""; }));

document.addEventListener("click",event=>{
 const button=event.target.closest("[data-daily-block-scenario]");
 if(!button||!event.target.closest("#weekly-workload"))return;
 const selected=button.dataset.dailyBlockScenario;
 dailyBlockPreferences={...dailyBlockPreferences,variant:selected};
 try{localStorage.setItem("dailyBlockPreferences",JSON.stringify(dailyBlockPreferences));}catch{}
 const root=button.closest(".weekly-focus-scenarios");
 root?.querySelectorAll("[data-daily-block-scenario]").forEach(item=>{
  const active=item.dataset.dailyBlockScenario===selected;
  item.classList.toggle("ghost",!active);
  item.setAttribute("aria-pressed",active?"true":"false");
 });
 root?.querySelectorAll("[data-daily-block-panel]").forEach(panel=>{
  panel.hidden=panel.dataset.dailyBlockPanel!==selected;
 });
});

document.addEventListener("change",event=>{
 if(!event.target.closest("#weekly-workload"))return;
 if(!["daily-block-start","daily-block-focus","daily-block-rest","daily-block-prep","daily-block-after"].includes(event.target.id))return;
 const start=$("daily-block-start")?.value||"09:00";
 const focus=Math.max(15,Math.min(120,Number($("daily-block-focus")?.value)||50));
 const rest=Math.max(3,Math.min(30,Number($("daily-block-rest")?.value)||10));
 const prep=Math.max(0,Math.min(120,Number($("daily-block-prep")?.value)||0));
 const after=Math.max(0,Math.min(120,Number($("daily-block-after")?.value)||0));
 dailyBlockPreferences={start,focus,rest,prep,after};
 try{localStorage.setItem("dailyBlockPreferences",JSON.stringify(dailyBlockPreferences));}catch{}
 const panel=$("weekly-workload")?.querySelector(".weekly-focus-scenarios");
 if(panel){
  const plan=panel.querySelectorAll(".weekly-focus-card");
  // Re-render by refreshing server data with the selected focus/rest settings.
  loadWeeklyWorkload();
 }
});

$("task-form").addEventListener("submit", async e => {
  e.preventDefault();
  try { await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: $("task-title").value, description: $("task-description").value, due_date: $("task-date").value || null, direction_id: $("task-direction").value || null, client_id: $("task-client").value || null, project_id: $("task-project").value || null, life_area_id: $("task-life-area").value || null, parent_task_id: $("task-parent").value || null, priority: $("task-priority").value, estimated_minutes: taskEstimate?.minutes ?? null, ai_plan: taskEstimate ? JSON.stringify(taskEstimate) : "" }) }); $("task-title").value = ""; $("task-description").value = ""; $("estimate-result").classList.add("hidden"); $("estimate-result").textContent = ""; taskEstimate = null; await loadTasks(); }
  catch (err) { alert(err.message); }
});
let voiceRecognition=null;
let voiceDraft=null;
function voiceOptions(items,idField,titleField,emptyLabel){
 return '<option value="">'+emptyLabel+'</option>'+items.map(item=>'<option value="'+escapeHtml(item[idField])+'">'+escapeHtml(item[titleField])+'</option>').join("");
}
function renderVoiceWorkspaceItem(item,i){
 const typeLabel=item.type==="client"?"Новый клиент":item.type==="project"?"Новый проект":"Изменение проекта";
 if(item.type==="project_update"){
  const labels={title:"Название",description:"Описание",expected_result:"Ожидаемый результат",deadline:"Срок",status:"Статус",client_id:"Клиент",direction_id:"Направление"};
  const changes=Object.entries(item.changes||{}).map(([key,value])=>'<li>'+escapeHtml(labels[key]||key)+': '+escapeHtml(value===null?"сбросить":String(value))+'</li>').join("");
  return '<article class="voice-workspace-item" data-voice-workspace="'+i+'"><label class="voice-include"><input data-wf="include" type="checkbox" checked> Подтвердить это изменение</label><small>'+typeLabel+'</small><strong>'+escapeHtml(item.project_title||"Проект")+'</strong><ul>'+changes+'</ul></article>';
 }
 const isClient=item.type==="client";
 const fields=isClient
  ? '<label>Контакт<input data-wf="contact" value="'+escapeHtml(item.contact||"")+'"></label><label>Заметки<textarea data-wf="notes" rows="2">'+escapeHtml(item.notes||"")+'</textarea></label>'
  : '<label>Описание<textarea data-wf="description" rows="2">'+escapeHtml(item.description||"")+'</textarea></label><label>Ожидаемый результат<textarea data-wf="expected_result" rows="2">'+escapeHtml(item.expected_result||"")+'</textarea></label><label>Срок<input data-wf="deadline" type="date" value="'+escapeHtml(item.deadline||"")+'"></label>';
 return '<article class="voice-workspace-item" data-voice-workspace="'+i+'"><label class="voice-include"><input data-wf="include" type="checkbox" checked> Подтвердить создание</label><small>'+typeLabel+'</small><label>'+(isClient?"Название клиента":"Название проекта")+'<input data-wf="name" value="'+escapeHtml(item.name||item.title||"")+'" maxlength="180" required></label>'+fields+'</article>';
}
function renderVoiceDraft(){
 const box=$("voice-preview"),draft=voiceDraft;
 if(!draft){box.classList.add("hidden");box.innerHTML="";return;}
 const dirs=workspaceData.directions||[],projects=workspaceData.projects.filter(p=>!["done","archived"].includes(p.status)),clients=workspaceData.clients,areas=workspaceData.life_areas;
 box.classList.remove("hidden");
 box.innerHTML='<div class="section-head"><div><h4>Проверь распределение</h4><p class="fine">'+escapeHtml(draft.summary||"Черновик задач")+'</p></div><span class="status-chip">'+draft.tasks.length+' задач · '+(draft.workspace_items||[]).length+' новых записей</span></div>'+
 (draft.clarifying_questions?.length?'<div class="voice-questions"><b>Нужно уточнить</b><ul>'+draft.clarifying_questions.map(q=>'<li>'+escapeHtml(q)+'</li>').join("")+'</ul></div>':'')+(draft.project_context?.length?'<div class="voice-project-context"><b>Контекст проектов учтён</b><ul>'+draft.project_context.filter(p=>draft.tasks.some(t=>t.project_id===p.id||t.target_task_id&&draft.existing_tasks?.some(x=>x.id===t.target_task_id&&x.project_id===p.id))).map(p=>'<li><strong>'+escapeHtml(p.title)+'</strong>: проверено открытых задач — '+p.open_task_count+', чек-листов — '+p.open_tasks.reduce((n,t)=>n+t.steps.length,0)+'</li>').join("")+'</ul></div>':'')+
 (draft.workspace_items?.length?'<div class="voice-workspace-proposals"><b>Новые записи в системе — проверь перед созданием</b>'+draft.workspace_items.map(renderVoiceWorkspaceItem).join("")+'</div>':'')+ draft.tasks.map((t,i)=>'<article class="voice-task" data-voice-task="'+i+'"><label class="voice-include"><input data-vf="include" type="checkbox" '+(t.possible_duplicate_task_id?'':'checked')+'> '+(t.operation==="update"?'Дополнить существующую задачу':'Добавить новую задачу')+'</label>'+(t.operation==="update"?'<p class="voice-duplicate-warning">Будет дополнена задача: '+escapeHtml((draft.existing_tasks||[]).find(x=>x.id===t.target_task_id)?.title||"существующая задача")+'. Новая информация добавится к описанию, существующий текст сохранится.</p>':t.possible_duplicate_task_id?'<p class="voice-duplicate-warning">Возможно, уже есть похожая незавершённая задача: '+escapeHtml((draft.existing_tasks||[]).find(x=>x.id===t.possible_duplicate_task_id)?.title||"проверь существующую задачу")+'. По умолчанию не добавляем повторно.</p>':'')+'<label class="voice-task-title">Задача '+(i+1)+'<input data-vf="title" maxlength="240" value="'+escapeHtml(t.title)+'" required></label>'+
 '<label>Описание / контекст<textarea data-vf="description" rows="2">'+escapeHtml(t.description||"")+'</textarea></label>'+
 '<div class="voice-task-fields"><label>Проект<select data-vf="project_id">'+voiceOptions(projects,"id","title","Без проекта")+'</select></label><label>Клиент<select data-vf="client_id">'+voiceOptions(clients,"id","name","Без клиента")+'</select></label><label>Направление<select data-vf="direction_id">'+voiceOptions(dirs,"id","title","Без направления")+'</select></label><label>Личная область<select data-vf="life_area_id">'+voiceOptions(areas,"id","title","Не личная задача")+'</select></label><label>Срок<input data-vf="due_date" type="date" value="'+escapeHtml(t.due_date||"")+'"></label><label>Приоритет<select data-vf="priority"><option value="high">Высокий</option><option value="medium">Обычный</option><option value="low">Низкий</option></select></label></div>'+
 '<small class="fine">'+(t.parent_index!==null&&t.parent_index!==undefined?'Подзадача к задаче '+(t.parent_index+1):'Самостоятельная задача')+(t.estimated_minutes?' · оценка '+duration(t.estimated_minutes):'')+'</small></article>').join("")+
 '<div class="voice-controls"><button type="button" class="button primary" id="voice-save">Подтвердить изменения</button><button type="button" class="button ghost" id="voice-discard">Отменить</button></div>';
 draft.tasks.forEach((t,i)=>{
  const card=box.querySelector('[data-voice-task="'+i+'"]');
  ["project_id","client_id","direction_id","life_area_id","priority"].forEach(field=>{const el=card.querySelector('[data-vf="'+field+'"]');el.value=t[field]|| (field==="priority"?"medium":"");});
 });
 $("voice-save").addEventListener("click",async()=>{
  const button=$("voice-save");button.disabled=true;button.textContent="Сохраняю…";
  const selected=[...box.querySelectorAll("[data-voice-task]")].filter(card=>card.querySelector('[data-vf="include"]')?.checked);
  const indexMap=new Map(selected.map((card,newIndex)=>[Number(card.dataset.voiceTask),newIndex]));
  const workspaceItems=[...box.querySelectorAll("[data-voice-workspace]")].map(card=>{const i=Number(card.dataset.voiceWorkspace),item=draft.workspace_items[i],get=field=>card.querySelector('[data-wf="'+field+'"]')?.value||"";const include=!!card.querySelector('[data-wf="include"]')?.checked;return item.type==="client"?{...item,include,name:get("name"),contact:get("contact"),notes:get("notes")} :item.type==="project"?{...item,include,title:get("name"),description:get("description"),expected_result:get("expected_result"),deadline:get("deadline")||null}:{...item,include};});
  const tasks=selected.map(card=>{
   const i=Number(card.dataset.voiceTask),get=field=>card.querySelector('[data-vf="'+field+'"]')?.value||"";
   const parent=draft.tasks[i].parent_index;
   return {title:get("title"),description:get("description"),project_id:get("project_id")||null,project_draft_index:draft.tasks[i].project_draft_index??null,client_id:get("client_id")||null,client_draft_index:draft.tasks[i].client_draft_index??null,direction_id:get("direction_id")||null,life_area_id:get("life_area_id")||null,due_date:get("due_date")||null,priority:get("priority"),estimated_minutes:draft.tasks[i].estimated_minutes,parent_index:parent!==null&&parent!==undefined&&indexMap.has(parent)?indexMap.get(parent):null,operation:draft.tasks[i].operation||"create",target_task_id:draft.tasks[i].target_task_id||null};
  });
  if(!tasks.length){alert("Выбери хотя бы одну задачу для добавления.");button.disabled=false;button.textContent="Подтвердить и добавить";return;}
  try{const result=await api("/api/tasks/voice-intake",{method:"POST",body:JSON.stringify({action:"save",tasks})});$("voice-status").textContent="Добавлено задач: "+(result.created||0)+" · дополнено существующих: "+(result.updated||0);$("voice-transcript").value="";voiceDraft=null;renderVoiceDraft();await loadTasks();await loadWorkspace();}
  catch(err){alert(err.message);button.disabled=false;button.textContent="Повторить сохранение";}
 });
 $("voice-discard").addEventListener("click",()=>{voiceDraft=null;renderVoiceDraft();});
}
let meetingDraft=null;
function renderMeetingPreview(){
 const box=$("meeting-preview");
 if(!meetingDraft){box.classList.add("hidden");box.innerHTML="";return;}
 const m=meetingDraft;
 const list=(items)=>items?.length?'<ul>'+items.map(x=>'<li>'+escapeHtml(typeof x==="string"?x:x.task+(x.assignee?" · Ответственный: "+x.assignee:"")+(x.due_date?" · срок "+x.due_date:""))+'</li>').join("")+'</ul>':'<p class="fine">Не выявлено</p>';
 const agreementList=m.agreements?.length?'<div class="meeting-agreements">'+m.agreements.map((a,i)=>'<label class="meeting-agreement"><input type="checkbox" data-meeting-agreement="'+i+'" '+((m.created_agreement_indices||[]).includes(i)?"disabled":"checked")+'><span><strong>'+escapeHtml(a.task)+'</strong><small>'+(a.assignee?'Ответственный: '+escapeHtml(a.assignee):'Ответственный не указан')+(a.due_date?' · срок: '+escapeHtml(a.due_date):' · срок не указан')+(a.task_id?' · задача: '+escapeHtml(a.task_title||a.task_id)+' ('+({todo:"К выполнению",doing:"В работе",waiting:"Ожидание",done:"Выполнена"}[a.task_status]||a.task_status||"создана")+')':'')+'</small></span></label>').join("")+'</div>':'<p class="fine">Не выявлено</p>';
 box.classList.remove("hidden");
 box.innerHTML='<div class="meeting-review"><h3>Проверь протокол</h3><label>Название встречи<input id="meeting-title" maxlength="180" value="'+escapeHtml(m.title||"Встреча")+'"></label><label>Дата<input id="meeting-date" type="date" value="'+escapeHtml(m.meeting_date||"")+'"></label><label>Участники<input id="meeting-participants" maxlength="1000" value="'+escapeHtml(m.participants||"")+'"></label><label>Проект<select id="meeting-project"><option value="">Не привязывать</option>'+workspaceData.projects.map(p=>'<option value="'+escapeHtml(p.id)+'" '+(m.project_id===p.id?"selected":"")+'>'+escapeHtml(p.title)+'</option>').join("")+'</select></label><label>Клиент<select id="meeting-client"><option value="">Не привязывать</option>'+workspaceData.clients.map(x=>'<option value="'+escapeHtml(x.id)+'" '+(m.client_id===x.id?"selected":"")+'>'+escapeHtml(x.name)+'</option>').join("")+'</select></label><label>Краткое содержание<textarea id="meeting-summary" rows="3">'+escapeHtml(m.summary||"")+'</textarea></label><h4>Принятые решения</h4>'+list(m.decisions)+'<h4>Договорённости и поручения</h4>'+agreementList+'<h4>Предложения — ещё не согласованы</h4>'+list(m.proposed_actions)+'<h4>Открытые вопросы</h4>'+list(m.open_questions)+(m.clarifying_questions?.length?'<h4>Нужно уточнить</h4>'+list(m.clarifying_questions):'')+'<div class="voice-controls"><button type="button" class="button primary" id="meeting-save">Сохранить протокол</button><button type="button" class="button secondary" id="meeting-create-tasks" '+(!m.agreements?.length||m.created_agreement_indices?.length===m.agreements.length?"disabled":"")+'>'+ (m.created_agreement_indices?.length?"Создать выбранные задачи":"Создать выбранные задачи")+'</button><button type="button" class="button ghost" id="meeting-discard">Закрыть</button></div><p class="fine" id="meeting-status"></p></div>';
 $("meeting-save").addEventListener("click",async()=>{
  const button=$("meeting-save");button.disabled=true;
  try{const result=await api("/api/meetings",{method:"POST",body:JSON.stringify({action:"save",id:m.saved_id||null,title:$("meeting-title").value,meeting_date:$("meeting-date").value,participants:$("meeting-participants").value,project_id:$("meeting-project").value||null,client_id:$("meeting-client").value||null,summary:$("meeting-summary").value,decisions:m.decisions,agreements:m.agreements,open_questions:m.open_questions,transcript:m.transcript})});m.saved_id=result.id;$("meeting-status").textContent="Протокол сохранён.";button.textContent="Сохранено";}catch(err){$("meeting-status").textContent=err.message;button.disabled=false;}
 });
 $("meeting-create-tasks").addEventListener("click",async()=>{
  const button=$("meeting-create-tasks");button.disabled=true;
  const selected=Array.from(box.querySelectorAll("[data-meeting-agreement]:checked")).map(input=>Number(input.dataset.meetingAgreement));
  if(!selected.length){$("meeting-status").textContent="Отметь хотя бы одно поручение.";button.disabled=false;return;}
  try{
   if(!m.saved_id){const saved=await api("/api/meetings",{method:"POST",body:JSON.stringify({action:"save",title:$("meeting-title").value,meeting_date:$("meeting-date").value,participants:$("meeting-participants").value,project_id:$("meeting-project").value||null,client_id:$("meeting-client").value||null,summary:$("meeting-summary").value,decisions:m.decisions,agreements:m.agreements,open_questions:m.open_questions,transcript:m.transcript})});m.saved_id=saved.id;}
   m.project_id=$("meeting-project").value||null;m.client_id=$("meeting-client").value||null;
   const tasks=selected.map(i=>{const a=m.agreements[i];return {title:a.task,description:[a.assignee?"Ответственный: "+a.assignee:"", "Договорённость встречи: "+m.title].filter(Boolean).join("\n"),due_date:a.due_date,priority:"medium",project_id:a.project_id||m.project_id||null,client_id:a.client_id||m.client_id||null,meeting_agreement_index:i,operation:"create"};});
   const created=await api("/api/tasks/voice-intake",{method:"POST",body:JSON.stringify({action:"save",meeting_id:m.saved_id,tasks})});
   m.created_agreement_indices=[...(m.created_agreement_indices||[]),...selected];$("meeting-status").textContent="Создано и связано с протоколом задач: "+tasks.length;renderMeetingPreview();await loadTasks();
  }catch(err){$("meeting-status").textContent=err.message;button.disabled=false;}
 });
 $("meeting-discard").addEventListener("click",()=>{meetingDraft=null;renderMeetingPreview();});
}
$("meeting-analyze").addEventListener("click",async()=>{
 const transcript=$("voice-transcript").value.trim();if(!transcript){alert("Сначала надиктуй или вставь текст встречи в поле выше.");return;}
 const button=$("meeting-analyze");button.disabled=true;button.textContent="Разбираю встречу…";
 try{meetingDraft=await api("/api/meetings",{method:"POST",body:JSON.stringify({action:"analyze",transcript})});meetingDraft.transcript=transcript;renderMeetingPreview();}
 catch(err){alert(err.message);meetingDraft=null;renderMeetingPreview();}
 finally{button.disabled=false;button.textContent="Разобрать как встречу";}
});
function initVoiceInput(){
 const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SpeechRecognition){$("voice-start").disabled=true;$("voice-status").textContent="Диктовка недоступна в этом браузере — вставь текст вручную";return;}
 voiceRecognition=new SpeechRecognition();voiceRecognition.lang="ru-RU";voiceRecognition.continuous=true;voiceRecognition.interimResults=true;
 voiceRecognition.onstart=()=>{$("voice-status").textContent="Слушаю…";$("voice-start").disabled=true;$("voice-stop").disabled=false;};
 voiceRecognition.onresult=event=>{$("voice-transcript").value=Array.from(event.results).map(result=>result[0].transcript).join(" ");};
 voiceRecognition.onerror=event=>{$("voice-status").textContent=event.error==="not-allowed"?"Нет доступа к микрофону — проверь разрешение браузера":"Ошибка распознавания: "+event.error;};
 voiceRecognition.onend=()=>{$("voice-start").disabled=false;$("voice-stop").disabled=true;if($("voice-status").textContent==="Слушаю…")$("voice-status").textContent="Запись завершена — проверь текст";};
 $("voice-start").addEventListener("click",()=>{try{voiceRecognition.start();}catch(err){$("voice-status").textContent="Не удалось начать запись. Попробуй ещё раз."; }});
 $("voice-stop").addEventListener("click",()=>voiceRecognition.stop());
}
$("voice-clear").addEventListener("click",()=>{$("voice-transcript").value="";voiceDraft=null;renderVoiceDraft();$("voice-status").textContent="Текст очищен";});
$("voice-analyze").addEventListener("click",async()=>{
 const transcript=$("voice-transcript").value.trim();if(!transcript){alert("Сначала надиктуй или вставь текст.");return;}
 const button=$("voice-analyze");button.disabled=true;button.textContent="Разбираю задачи…";$("voice-status").textContent="Определяю проекты, сроки и подзадачи…";
 try{voiceDraft=await api("/api/tasks/voice-intake",{method:"POST",body:JSON.stringify({transcript})});renderVoiceDraft();$("voice-status").textContent="Проверь результат перед сохранением";}
 catch(err){voiceDraft=null;renderVoiceDraft();$("voice-status").textContent=err.message;alert(err.message);}
 finally{button.disabled=false;button.textContent="Разобрать и распределить";}
});
initVoiceInput();

$("income-form").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await api("/api/income", { method: "POST", body: JSON.stringify({ amount: $("income-amount").value, direction_id: $("income-direction").value || null, client_id:$("income-client").value||null, project_id:$("income-project").value||null, received_on: $("income-date").value, note: $("income-note").value }) });
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
 $('analytics-clients').innerHTML=analyticsRows(data.by_client,'Нет задач по клиентам за выбранный период.');
 $('analytics-projects').innerHTML=analyticsRows(data.by_project,'Нет задач по проектам за выбранный период.');
 $('analytics-life-areas').innerHTML=analyticsRows(data.by_life_area,'Нет личных задач за выбранный период.');
 $('analytics-months').innerHTML=analyticsRows(data.by_month,'Пока недостаточно данных для динамики.');
 $('analytics-calendar').innerHTML=data.time.calendar_by_type.length?data.time.calendar_by_type.map(x=>'<article class="analytics-row"><div><b>'+escapeHtml(({meeting:'Встречи',travel:'Дорога',hobby:'Хобби',sleep:'Сон',work:'Работа',personal:'Личные дела',other:'Другое'})[x.event_type]||x.event_type)+'</b><small>'+x.events+' событий</small></div><div><strong>'+duration(Math.round(x.actual_minutes))+'</strong><small>план '+duration(Math.round(x.planned_minutes))+'</small></div></article>').join(''):'<p class="muted">Нет событий календаря за период.</p>';
}
$('refresh-analytics').addEventListener('click',async()=>{const b=$('refresh-analytics');b.disabled=true;try{await loadAnalytics();}catch(err){alert(err.message);}finally{b.disabled=false;}});


let profitabilityData=null;
async function loadProfitability(){
 const allocationHours=Math.max(1,Math.min(80,Number($("allocation-hours")?.value)||5));
 profitabilityData=await api("/api/analytics/profitability?available_hours="+allocationHours);
 const s=profitabilityData.summary;
 $("profitability-period").textContent=profitabilityData.period.from+" — "+profitabilityData.period.to;
 $("profitability-summary").innerHTML=[
 ["Поступления",money(s.revenue)],["Прямые расходы",money(s.direct_expenses)],["Вклад направлений",money(s.contribution)],["Фактическое время",duration(s.total_minutes)],["Завершено задач",s.completed_tasks],["Вклад на час",s.contribution_per_hour===null?"Нет данных":money(s.contribution_per_hour)]
 ].map(x=>'<article><span>'+x[0]+'</span><b>'+x[1]+'</b></article>').join("");
 $("profitability-directions").innerHTML=profitabilityData.directions.length?profitabilityData.directions.map(x=>'<article class="analytics-row"><div><b>'+escapeHtml(x.direction_title)+'</b><small>Доход '+money(x.revenue)+' ('+(x.share_percent===null?"—":x.share_percent+"% от общего")+') · расходы '+money(x.direct_expenses)+' · маржа '+(x.margin_percent===null?"—":x.margin_percent+"%")+' · задач: '+x.completed_tasks+' завершено / '+x.active_tasks+' активных · время '+duration(x.total_minutes)+'</small><small>Воронка за 90 дней: контакты '+(x.observed_contacted_clients||0)+' · квалифицированные '+(x.qualified_clients||0)+' · выиграно '+(x.won_clients||0)+' · контакт → обращение '+(x.observed_contact_to_lead_percent===null?"недостаточно данных":x.observed_contact_to_lead_percent+"%")+' · обращение → продажа '+(x.observed_lead_to_sale_percent===null?"недостаточно данных":x.observed_lead_to_sale_percent+"%")+'</small><small>Средний цикл до переговоров: '+(x.avg_contact_to_negotiation_days===null?"—":x.avg_contact_to_negotiation_days+" дн. ("+x.contact_to_negotiation_sample+")")+' · до предложения: '+(x.avg_contact_to_proposal_days===null?"—":x.avg_contact_to_proposal_days+" дн. ("+x.contact_to_proposal_sample+")")+' · до продажи: '+(x.avg_contact_to_won_days===null?"—":x.avg_contact_to_won_days+" дн. ("+x.contact_to_won_sample+")")+'</small></div><div><strong>'+money(x.contribution)+'</strong><small>вклад · '+(x.contribution_per_hour===null?"нет учёта времени":money(x.contribution_per_hour)+"/ч")+'</small></div></article>').join(""):'<p class="muted">Пока нет доходов, расходов или завершённых задач за период.</p>';
 const allocation=profitabilityData.time_allocation;
 $("time-allocation-results").innerHTML=allocation.recommendations.length?allocation.recommendations.map((x,i)=>'<article class="analytics-row"><div><b>'+escapeHtml(x.direction_title)+'</b><small>Предложение: '+x.recommended_hours+' ч/нед. · вклад на час '+money(x.contribution_per_hour)+' · '+escapeHtml(x.confidence)+' оценка</small><small>'+x.allocation_reasons.map(x=>escapeHtml(x)).join(' · ')+'</small></div><div><strong>'+(i+1)+'</strong><small>приоритет</small></div></article>').join(''):'<p class="muted">Пока недостаточно фактических данных о положительном вкладе на час. Продолжайте фиксировать поступления и время — тогда появится обоснованное распределение.</p>';
 if(allocation.excluded_directions.length)$("time-allocation-results").innerHTML+='<p class="fine">Пока не включены: '+allocation.excluded_directions.map(x=>escapeHtml(x.direction_title)+' — '+escapeHtml(x.reason)).join('; ')+'</p>';
 $("create-allocation-tasks").disabled=!allocation.recommendations.length;
}

$("refresh-profitability").addEventListener("click",async()=>{const b=$("refresh-profitability");b.disabled=true;try{await loadProfitability();}catch(err){alert(err.message);}finally{b.disabled=false;}});
$("allocation-hours").addEventListener("change",async()=>{try{await loadProfitability();}catch(err){alert(err.message);}});
$("create-allocation-tasks").addEventListener("click",async()=>{
 const rows=profitabilityData?.time_allocation?.recommendations||[];
 if(!rows.length)return;
 const details=rows.map(x=>x.direction_title+": "+x.recommended_hours+" ч/нед.").join("\\n");
 if(!confirm("Создать задачи-предложения на основе распределения?\\n\\n"+details+"\\n\\nЗадачи будут добавлены в список, расписание автоматически не изменится."))return;
 const button=$("create-allocation-tasks");button.disabled=true;
 try{
  for(const row of rows){
   await api("/api/tasks",{method:"POST",body:JSON.stringify({direction_id:row.direction_id,title:"Выделить "+row.recommended_hours+" ч на направление: "+row.direction_title,description:"Предложение системы распределения рабочего времени. Основание: "+row.allocation_reasons.join("; ")+". Плановая дополнительная нагрузка: "+row.recommended_hours+" часа в неделю. Проверьте загрузку и при необходимости скорректируйте задачу вручную.",estimated_minutes:Math.max(5,Math.round(row.recommended_hours*60)),priority:"medium"})});
  }
  alert("Создано задач: "+rows.length+". Проверьте их в общем списке задач.");
  if(typeof loadTasks==="function")await loadTasks();
  if(typeof loadPlanner==="function")await loadPlanner();
 }catch(err){alert("Не все задачи удалось создать: "+err.message);}
 finally{button.disabled=false;}
});

let financeData = null;
let incomeBucketsData = null;
function suggestBucketForExpense(category){
 const value=String(category||"").toLowerCase();
 const aliases=[
  [/жиль|аренд|коммунал|ипотек|квартир|жкх/,"Жильё"],
  [/продукт|питан|еда|магазин|доставк|кафе|ресторан/,"Питание"],
  [/кот|корм|наполнител|ветеринар/,"Коты"],
  [/транспорт|такси|бензин|проезд|метро|автобус/,"Транспорт"],
  [/здоров|врач|аптек|лекарств|медицин|космет|уход/,"Здоровье и уход"],
  [/долг|кредит|займ|погашен/,"Долги и обязательства"],
  [/капитал|инвестиц|накоплен/,"Капитал"]
 ];
 const match=aliases.find(([pattern])=>pattern.test(value));
 if(!match)return;
 const bucket=incomeBucketsData?.buckets?.find(x=>x.title===match[1]);
 if(bucket)$("expense-bucket").value=bucket.id;
}
$("expense-category").addEventListener("change",()=>suggestBucketForExpense($("expense-category").value+" "+$("expense-title").value));
$("expense-title").addEventListener("change",()=>suggestBucketForExpense($("expense-category").value+" "+$("expense-title").value));
async function loadIncomeBuckets(){
 incomeBucketsData=await api("/api/finance/buckets");
 const rows=incomeBucketsData.buckets||[];
 const totalAllocated=rows.reduce((s,x)=>s+Number(x.allocated||0),0);
 const totalSpent=rows.reduce((s,x)=>s+Number(x.spent||0),0);
 const totalBalance=rows.reduce((s,x)=>s+Number(x.balance||0),0);
 $("income-bucket-summary").innerHTML=[["Распределено",money(totalAllocated)],["Потрачено из корзин",money(totalSpent)],["Остаток корзин",money(totalBalance)],["Сумма процентов",incomeBucketsData.percentage_total+"%"]].map(x=>'<article><span>'+x[0]+'</span><b>'+x[1]+'</b></article>').join("");
 $("income-bucket-list").innerHTML=rows.map(b=>{const pct=b.allocated>0?Math.max(0,Math.min(100,b.spent/b.allocated*100)):0;return '<article class="finance-row"><div class="bucket-main"><b>'+escapeHtml(b.title)+(b.bucket_type==="capital"?' · капитал':'')+'</b><small>Распределено '+money(b.allocated)+' · потрачено '+money(b.spent)+' · доступно '+money(b.balance)+'</small><div class="progress"><span style="width:'+pct+'%"></span></div></div><label class="bucket-percent">Доля, %<input type="number" min="0" max="100" step="0.5" data-bucket-percent="'+escapeHtml(b.id)+'" value="'+Number(b.percentage)+'"></label></article>';}).join("");
 $("income-bucket-note").textContent=incomeBucketsData.allocation_ready?"Проценты составляют 100%. Новые поступления будут распределяться автоматически.":"Сейчас доли составляют "+incomeBucketsData.percentage_total+"%. Измени значения до 100%, чтобы включить распределение.";
 const recommendation=incomeBucketsData.recommendation;
 $("income-bucket-recommendations").innerHTML=recommendation?.ready?'<h4>Рекомендация по фактическим расходам</h4><p class="fine">Средний доход за '+recommendation.history_months+' завершённых месяцев: '+money(recommendation.average_monthly_income)+'. Предлагаемые доли учитывают фактические траты из корзин. Капитал сохраняется не ниже 10%. Это предложение, а не автоматическое изменение.</p>'+recommendation.buckets.map(b=>'<article class="finance-row"><div><b>'+escapeHtml(b.title)+'</b><small>Средние траты: '+money(b.average_monthly_spending)+'/мес. · сейчас '+b.current_percentage+'% · предлагается '+b.recommended_percentage+'%</small></div><strong>'+(b.recommended_percentage>b.current_percentage?"+":"")+Math.round((b.recommended_percentage-b.current_percentage)*10)/10+' п.п.</strong></article>').join(""):'<p class="fine">Рекомендации появятся после того, как будут внесены доходы минимум за два месяца. Для расчёта используются три последних завершённых месяца и только расходы, отнесённые к корзинам.</p>';
 $("apply-bucket-recommendations").disabled=!recommendation?.ready;
 $("save-income-buckets").disabled=!rows.length;
 $("expense-bucket").innerHTML='<option value="">Выбери корзину или вне корзин</option><option value="none">Вне корзин</option>'+rows.map(b=>'<option value="'+escapeHtml(b.id)+'">'+escapeHtml(b.title)+' · доступно '+money(b.balance)+'</option>').join("");
}
$("refresh-income-buckets").addEventListener("click",async()=>{try{await loadIncomeBuckets();}catch(err){alert(err.message);}});
$("apply-bucket-recommendations").addEventListener("click",()=>{
 const recommendations=incomeBucketsData?.recommendation?.buckets||[];
 if(!recommendations.length)return;
 if(!confirm("Подставить рекомендованные проценты? Уже распределённые деньги не изменятся, новые доли начнут действовать только для будущих поступлений."))return;
 recommendations.forEach(row=>{const input=document.querySelector('[data-bucket-percent="'+row.id+'"]');if(input)input.value=row.recommended_percentage;});
});
$("save-income-buckets").addEventListener("click",async()=>{
 const inputs=[...document.querySelectorAll("[data-bucket-percent]")];
 const buckets=inputs.map(input=>({id:input.dataset.bucketPercent,percentage:Number(input.value)}));
 const total=buckets.reduce((s,x)=>s+x.percentage,0);
 if(buckets.some(x=>!Number.isFinite(x.percentage)||x.percentage<0||x.percentage>100)||Math.abs(total-100)>0.0001){alert("Распредели ровно 100% между корзинами. Сейчас: "+total+"%.");return;}
 try{await api("/api/finance/buckets",{method:"POST",body:JSON.stringify({action:"update_percentages",buckets})});await loadIncomeBuckets();alert("Распределение сохранено. Оно будет применяться к новым поступлениям.");}
 catch(err){alert(err.message);}
});

let cashflowData=null;
let cashReservesData=null;
async function loadCashReserves(){
 cashReservesData=await api("/api/finance/reserves");
 const summary=cashReservesData.summary;
 $("reserve-summary").innerHTML=[["Цели резервов",money(summary.target)],["Уже отложено",money(summary.saved)],["План откладывать в месяц",money(summary.monthly)]].map(x=>'<article><span>'+x[0]+'</span><b>'+x[1]+'</b></article>').join("");
 $("cash-reserves").innerHTML=cashReservesData.reserves.length?cashReservesData.reserves.map(r=>{const pct=Math.min(100,Math.round(Number(r.current_amount)/Number(r.target_amount)*100));return '<article class="finance-row"><div><b>'+escapeHtml(r.title)+'</b><small>'+money(r.current_amount)+' из '+money(r.target_amount)+' · '+pct+'% · '+money(r.monthly_contribution)+'/мес.'+(r.target_date?' · до '+r.target_date:'')+'</small><small>'+escapeHtml(r.purpose||"")+'</small></div><div><button class="button ghost" data-reserve-add="'+escapeHtml(r.id)+'" '+(Number(r.current_amount)>=Number(r.target_amount)?"disabled":"")+'>Пополнить</button> <button class="button ghost" data-reserve-delete="'+escapeHtml(r.id)+'">Удалить</button></div></article>';}).join(""):'<p class="muted">Пока нет созданных резервов.</p>';
}
$("reserve-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/finance/reserves",{method:"POST",body:JSON.stringify({title:$("reserve-title").value,target_amount:$("reserve-target").value,current_amount:$("reserve-current").value,monthly_contribution:$("reserve-monthly").value,target_date:$("reserve-date").value||null,purpose:$("reserve-purpose").value})});$("reserve-form").reset();$("reserve-current").value="0";$("reserve-monthly").value="0";await loadCashReserves();await loadCashflowForecast();}catch(err){alert(err.message);}});
$("cash-reserves").addEventListener("click",async e=>{
 const add=e.target.closest("[data-reserve-add]");
 if(add){const r=cashReservesData.reserves.find(x=>x.id===add.dataset.reserveAdd);if(!r)return;const raw=prompt("Сколько добавить к резерву? Осталось накопить: "+money(Number(r.target_amount)-Number(r.current_amount)));if(raw===null)return;const amount=Number(raw);if(!Number.isFinite(amount)||amount<=0){alert("Укажи сумму больше нуля.");return;}try{await api("/api/finance/reserves",{method:"POST",body:JSON.stringify({action:"update",id:r.id,title:r.title,purpose:r.purpose,target_amount:r.target_amount,current_amount:Math.min(Number(r.target_amount),Number(r.current_amount)+amount),monthly_contribution:r.monthly_contribution,target_date:r.target_date})});await loadCashReserves();await loadCashflowForecast();}catch(err){alert(err.message);}return;}
 const b=e.target.closest("[data-reserve-delete]");if(!b)return;if(!confirm("Удалить этот резерв?"))return;try{await api("/api/finance/reserves",{method:"POST",body:JSON.stringify({action:"delete",id:b.dataset.reserveDelete})});await loadCashReserves();await loadCashflowForecast();}catch(err){alert(err.message);}
});
let irregularExpenseData=null;
async function loadIrregularExpenses(){
 irregularExpenseData=await api("/api/finance/irregular-expenses");
 const labels={once:"один раз",yearly:"ежегодно",quarterly:"раз в квартал"};
 const payments=irregularExpenseData.payments||[];
 $("irregular-expense-list").innerHTML=(irregularExpenseData.items.length?irregularExpenseData.items.map(x=>'<article class="finance-row"><div><b>'+escapeHtml(x.title)+'</b><small>'+escapeHtml(x.category)+' · '+x.next_date+' · '+labels[x.frequency]+' · '+money(x.amount)+(Number(x.active)===0?' · завершён':'')+'</small>'+(x.notes?'<small>'+escapeHtml(x.notes)+'</small>':'')+'</div><div class="finance-actions">'+(Number(x.active)!==0?'<button class="button ghost" data-irregular-paid="'+escapeHtml(x.id)+'">Отметить оплаченным</button>':'')+'<button class="button ghost" data-irregular-delete="'+escapeHtml(x.id)+'">Удалить</button></div></article>').join(""):'<p class="muted">Нерегулярные расходы пока не добавлены.</p>')+(payments.length?'<h4>Последние оплаты</h4>'+payments.slice(0,10).map(p=>'<article class="finance-row"><span>'+p.paid_on+'</span><strong>'+money(p.amount)+'</strong></article>').join(""):'');
}
$("irregular-expense-form").addEventListener("submit",async e=>{
 e.preventDefault();
 try{await api("/api/finance/irregular-expenses",{method:"POST",body:JSON.stringify({title:$("irregular-title").value,category:$("irregular-category").value,amount:$("irregular-amount").value,next_date:$("irregular-date").value,frequency:$("irregular-frequency").value,notes:$("irregular-notes").value})});$("irregular-expense-form").reset();$("irregular-date").value=cashflowData?.period?.from||"";await loadIrregularExpenses();await loadCashflowForecast();}
 catch(err){alert(err.message);}
});
$("irregular-expense-list").addEventListener("click",async e=>{
 const paid=e.target.closest("[data-irregular-paid]");
 if(paid){
  if(!confirm("Отметить расход оплаченным? Он попадёт в фактические расходы, а для повторяющегося платежа рассчитается следующая дата."))return;
  try{await api("/api/finance/irregular-expenses",{method:"POST",body:JSON.stringify({action:"paid",id:paid.dataset.irregularPaid,paid_on:financeData?.today||cashflowData?.period?.from})});await loadIrregularExpenses();await loadFinance();await loadCashflowForecast();}
  catch(err){alert(err.message);}
  return;
 }
 const b=e.target.closest("[data-irregular-delete]");if(!b)return;
 if(!confirm("Удалить этот нерегулярный расход? История уже совершённых оплат сохранится в расходах."))return;
 try{await api("/api/finance/irregular-expenses",{method:"POST",body:JSON.stringify({action:"delete",id:b.dataset.irregularDelete})});await loadIrregularExpenses();await loadCashflowForecast();}
 catch(err){alert(err.message);}
});
async function loadCashflowForecast(){
 cashflowData=await api("/api/finance/forecast?days="+$("cashflow-days").value);
 await loadCashReserves();
 await loadIrregularExpenses();
 $("irregular-date").min=cashflowData.period.from;
 if(!$("irregular-date").value)$("irregular-date").value=cashflowData.period.from;
 $("cashflow-opening-balance").value=String(cashflowData.starting_balance||0);
 $("cashflow-date").min=cashflowData.period.from;
 $("cashflow-date").value=cashflowData.period.from;
 const s=cashflowData.summary;
 $("cashflow-summary").innerHTML=[
 ["Начальный остаток",money(s.starting_balance)],["Ожидаемые поступления",money(s.planned_income)],["Плановые платежи",money(s.planned_expenses)],["Обычные расходы (оценка)",money(s.variable_expenses)],["Изменение за период",(s.net>0?"+":"")+money(s.net)],["Остаток в конце",money(s.ending_balance)],["Отложено в резервы",money(s.total_reserved)],["Доступно после резервов",money(s.available_ending_balance)],["Минимум доступных денег",money(s.lowest_available_balance)]
 ].map(x=>'<article><span>'+x[0]+'</span><b>'+x[1]+'</b></article>').join("");
 const scenarios=cashflowData.deal_scenarios||{};
 const renderScenario=(title,s)=>'<article class="deal-cashflow-card"><b>'+title+'</b><span>Дополнительные поступления <strong>'+money(s?.additional_income||0)+'</strong></span><span>Доступно в конце периода <strong>'+money(s?.available_ending_balance||0)+'</strong></span><span>Минимум доступных денег <strong>'+money(s?.lowest_available_balance||0)+'</strong></span><small>'+(s?.negative_days?.length?'Риск кассового разрыва: '+s.negative_days.length+' дн. · первый '+s.negative_days[0]:'Отрицательного остатка в сценарии не прогнозируется')+'</small></article>';
 $("deal-cashflow-scenario-cards").innerHTML=renderScenario("Взвешенный сценарий",scenarios.weighted)+renderScenario("Если все сделки состоятся",scenarios.optimistic);
 $("deal-cashflow-note").textContent=(scenarios.dated_deal_count||0)+" открытых сделок с датой оплаты учтено. Без даты: "+(scenarios.undated_deal_count||0)+" на "+money(scenarios.undated_deal_amount||0)+". Сценарии не включены в основной прогноз.";
 const riskActions=cashflowData.financial_risk_actions||{};
 $("financial-risk-actions").innerHTML=riskActions.has_risk?riskActions.risks.map((risk,index)=>'<article class="finance-row financial-risk-row"><div><b>Риск '+(index+1)+': '+risk.from+(risk.to!==risk.from?' — '+risk.to:'')+'</b><small>Минимум доступных денег: '+money(risk.lowest_available_balance)+' · нужно дополнительно получить к '+risk.from+': '+money(risk.required_additional_income)+'</small><small>Взвешенные сделки, которые могут успеть к сроку: '+money(risk.weighted_pipeline_before_risk)+' · останется закрыть: '+money(risk.remaining_gap_after_weighted_pipeline)+'</small>'+(risk.dated_deals.length?'<ul>'+risk.dated_deals.map(d=>'<li>'+escapeHtml(d.title)+' — '+money(d.amount)+' × '+d.probability_percent+'% = '+money(d.weighted_amount)+' · оплата '+d.expected_close_date+'</li>').join("")+'</ul>':'<small>Нет открытых сделок с датой оплаты до начала дефицита.</small>')+'<ul class="financial-risk-suggestions">'+risk.suggested_actions.map(a=>'<li><b>'+escapeHtml(a.title)+'</b><small>Предлагаемый срок: '+a.due_date+' · '+escapeHtml(a.reason)+'</small></li>').join("")+'</ul></div></article>').join(""):'<p class="cashflow-safe">По текущему прогнозу кассовый разрыв не выявлен. При изменении доходов, расходов или дат сделок рекомендации пересчитаются.</p>';
 const riskPlan=cashflowData.risk_sales_plan||{};
 $("risk-sales-plan").innerHTML=riskPlan.available?'<div class="risk-sales-head"><b>Недельный план продаж до '+riskPlan.due_date+'</b><span>Нужно получить '+money(riskPlan.total_required)+' · ориентир в неделю '+money(riskPlan.weekly_target)+'</span></div><p class="fine">'+escapeHtml(riskPlan.warning||"")+' Срок до дефицита: '+(riskPlan.days_until===0?'сегодня':riskPlan.days_until+' дн.')+'</p>'+riskPlan.directions.map(d=>'<article class="risk-sales-card"><div><b>'+escapeHtml(d.title)+'</b><span>Цель: '+money(d.allocated_amount)+' · за неделю: '+money(d.weekly_amount)+'</span><small>Продаж: '+(d.sales_required??'нужен средний чек')+' · обращений: '+(d.qualified_leads_required??'—')+' · первичных контактов: '+(d.outreach_required??'—')+'</small>'+(d.assumptions_incomplete?'<small class="risk-sales-warning">Не хватает среднего чека или конверсии — заполни параметры в плане продаж.</small>':'')+'</div><button type="button" class="button ghost" data-risk-sales-create="'+escapeHtml(d.direction_id)+'" '+(d.assumptions_incomplete||!d.outreach_required?'disabled':'')+'>Создать задачи на неделю</button></article>').join(""):'';


 const vf=cashflowData.variable_expense_forecast;
 $("variable-expense-forecast").innerHTML='<h4>Оценка обычных расходов</h4><p class="fine">Средние суммы за завершённые месяцы: '+vf.based_on_months.join(", ")+'. В расчёте остатка сумма распределяется по дням месяца только математически; фиктивные даты покупок не создаются.</p><div class="analytics-metrics"><article><span>Оценка на '+vf.target_month+'</span><b>'+money(vf.total)+'</b></article><article><span>Обычные расходы за выбранный период</span><b>'+money(s.variable_expenses)+'</b></article></div>'+cashflowData.variable_expenses_by_month.map(m=>'<article class="finance-row"><div><b>'+m.month+'</b><small>'+m.categories.map(c=>escapeHtml(c.category)+': '+money(c.monthly_amount)+(c.source==="monthly_budget"?" · бюджет":" · история")).join(" · ")+'</small></div><strong>'+money(m.total)+'</strong></article>').join("")+(vf.categories.length?'':'<p class="muted">Пока недостаточно истории расходов для прогноза. Добавь бюджеты по категориям, чтобы включить их в расчёт.</p>')+(cashflowData.variable_recurring_expenses?.length?'<h4>Регулярные платежи с меняющейся суммой</h4><p class="fine">Сумма оценивается по истории, а дата следующего платежа — по интервалам между оплатами. Эти платежи исключены из среднего прогноза категорий, чтобы не считать их дважды.</p>'+cashflowData.variable_recurring_expenses.map(x=>'<article class="finance-row"><div><b>'+escapeHtml(x.title)+'</b><small>'+escapeHtml(x.category)+' · '+x.occurrences+' оплат · '+money(x.amount_min)+'–'+money(x.amount_max)+' · оценка '+money(x.estimated_amount)+' · последняя оплата '+x.last_paid_on+'</small></div><strong>'+money(x.average_amount)+'</strong></article>').join(''):'');
 $("cashflow-events").innerHTML=cashflowData.events.length?cashflowData.events.map(x=>'<article class="finance-row"><div><b>'+escapeHtml(x.title)+'</b><small>'+x.date+' · '+(x.type==="income"?"Поступление":"Расход")+(x.direction_title?" · "+escapeHtml(x.direction_title):"")+(x.client_name?" · "+escapeHtml(x.client_name):"")+(x.project_title?" · проект: "+escapeHtml(x.project_title):"")+(x.source==="obligation"?" · обязательство":x.source==="debt_minimum"?" · минимальный платёж":x.source==="irregular_expense"?" · нерегулярный расход":x.source==="variable_recurring"?" · оценка переменного регулярного платежа":" · план")+' · остаток к концу дня: '+money(x.day_available_balance??0)+'</small></div><strong class="'+(x.type==="income"?"cashflow-in":"cashflow-out")+'">'+(x.type==="income"?"+":"−")+money(x.amount)+'</strong>'+(x.source==="planned"?'<button class="button ghost" data-cashflow-delete="'+escapeHtml(x.id||"")+'">×</button>':"")+'</article>').join(""):'<p class="muted">На выбранный период пока нет запланированных движений.</p>';
 $("cashflow-daily").innerHTML=cashflowData.days.filter((x,i)=>i===0||x.events.length||i===cashflowData.days.length-1||x.date.slice(8,10)==="01").map(x=>'<article class="finance-row"><div><b>'+x.date+'</b><small>+'+money(x.income)+' / −'+money(x.expenses)+' · доступно после резервов: '+money(x.available_balance)+'</small></div><strong>'+money(x.balance)+'</strong></article>').join("");
 const risk=s.negative_days.length;
 $("cashflow-daily").insertAdjacentHTML("beforebegin",risk?'<p class="cashflow-warning">Возможен кассовый разрыв: '+risk+' дней с отрицательным остатком. Первый — '+s.negative_days[0]+'.</p>':'<p class="cashflow-safe">По внесённым данным отрицательного остатка не прогнозируется.</p>');
 $("cashflow-direction").innerHTML='<option value="">Без направления</option>'+directions.map(d=>'<option value="'+escapeHtml(d.id)+'">'+escapeHtml(d.title)+'</option>').join("");
}
$("refresh-cashflow").addEventListener("click",async()=>{try{await loadCashflowForecast();}catch(err){alert(err.message);}});
$("cashflow-days").addEventListener("change",async()=>{try{await loadCashflowForecast();}catch(err){alert(err.message);}});
$("save-opening-balance").addEventListener("click",async()=>{try{await api("/api/finance/forecast",{method:"POST",body:JSON.stringify({action:"starting_balance",amount:$("cashflow-opening-balance").value})});await loadCashflowForecast();}catch(err){alert(err.message);}});
$("cashflow-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/finance/forecast",{method:"POST",body:JSON.stringify({title:$("cashflow-title").value,flow_type:$("cashflow-type").value,amount:$("cashflow-amount").value,expected_date:$("cashflow-date").value,direction_id:$("cashflow-direction").value||null})});$("cashflow-form").reset();await loadCashflowForecast();}catch(err){alert(err.message);}});
$("cashflow-events").addEventListener("click",async e=>{const b=e.target.closest("[data-cashflow-delete]");if(!b)return;try{await api("/api/finance/forecast",{method:"DELETE",body:JSON.stringify({id:b.dataset.cashflowDelete})});await loadCashflowForecast();}catch(err){alert(err.message);}});
let revenuePlanData=null;
async function loadRevenuePlan(){
 revenuePlanData=await api("/api/finance/revenue-plan");
 const p=revenuePlanData,s=p;
 $("revenue-plan-summary").innerHTML=[
  ["Месячная цель",money(p.monthly_target)],
  ["Уже получено",money(p.actual_total)],
  ["Осталось получить",money(p.remaining_total)],
  ["Нужный темп в день",money(p.required_daily_total)],
  ["Нужный темп в неделю",money(p.required_weekly_total)],
  ["Не распределено",money(p.unallocated_target)]
 ].map(x=>'<article><span>'+x[0]+'</span><b>'+x[1]+'</b></article>').join("");
 $("revenue-plan-directions").innerHTML=p.directions.map(d=>'<article class="revenue-plan-row"><div class="revenue-plan-main"><b>'+escapeHtml(d.title)+'</b><small>Цель '+money(d.monthly_target)+' · факт '+money(d.actual)+' · осталось '+money(d.remaining)+'</small><div class="progress"><span style="width:'+Math.min(100,d.monthly_target?d.actual/d.monthly_target*100:0)+'%"></span></div><small>В неделю: '+money(d.weekly_target)+' · в день: '+money(d.daily_target)+(d.required_sales===null?'':' · продаж: '+d.required_sales+' по среднему чеку')+'</small></div><div class="revenue-plan-inputs"><label>Доля, %<input type="number" min="0" max="100" step="0.5" data-revenue-share="'+escapeHtml(d.direction_id)+'" value="'+(p.suggested_allocation?Number(d.share_percent).toFixed(2):d.share_percent)+'"></label><label>Средний чек, ₽<input type="number" min="0" max="100000000" step="100" data-revenue-ticket="'+escapeHtml(d.direction_id)+'" value="'+(d.average_sale_amount||"")+'" placeholder="Не задан"></label></div></article>').join("");
 $("revenue-plan-share-note").textContent=p.suggested_allocation?"Предварительно предложено равное распределение. Сохрани его или измени доли.":"Распределено: "+p.share_total+"% · можно оставить часть цели без распределения.";
 await loadRevenueScenarios();
}
let revenueScenariosData=null;
async function loadRevenueScenarios(){
 revenueScenariosData=await api("/api/finance/scenarios");
 const host=$("revenue-scenarios");
 host.innerHTML=revenueScenariosData.scenarios.map(s=>'<article class="scenario-card"><div class="scenario-head"><div><b>'+escapeHtml(s.title)+'</b><small>'+escapeHtml(s.description)+'</small></div><strong>'+money(s.target)+'</strong></div><div class="scenario-metrics"><span>Поступило в этом месяце: <b>'+money(s.actual)+'</b></span><span>Осталось до цели: <b>'+money(s.remaining)+'</b></span><span>Нужно в неделю: <b>'+money(s.weekly_target)+'</b></span><span>Продаж по заданным чекам: <b>'+s.directions.reduce((sum,d)=>sum+(d.required_sales||0),0)+(s.directions.some(d=>d.required_sales===null)?' + не рассчитано':'')+'</b></span><span>Прогноз на конец месяца: <b>'+(s.projected_month_end===null?'недостаточно данных':money(s.projected_month_end))+'</b></span><span>Отклонение от цели: <b>'+(s.projection_gap===null?'—':(s.projection_gap>=0?'+':'−')+money(Math.abs(s.projection_gap)))+'</b></span><span>Нужный темп в оставшиеся дни: <b>'+(s.required_daily_revenue===null?'—':money(s.required_daily_revenue)+' в день')+'</b></span><span>Нагрузка: <b>'+(s.weekly_required_hours===null?'недостаточно истории':duration(Math.round(s.weekly_required_hours*60))+' в неделю')+'</b></span><span>Вместимость: <b>'+(s.capacity_fit===null?'не настроена или нет истории':s.capacity_fit?'укладывается':'выше доступного времени')+'</b></span></div><details><summary>Разбивка по направлениям</summary><div class="scenario-directions">'+s.directions.map(d=>'<div><b>'+escapeHtml(d.title)+'</b><span>'+money(d.monthly_target)+' / мес. · факт '+money(d.actual)+' · остаток '+money(d.remaining)+'</span><small>'+(d.required_sales===null?'Средний чек не задан':d.required_sales+' продаж по '+money(d.average_sale_amount))+' · '+(d.weekly_hours===null?'нет оценки времени':duration(Math.round(d.weekly_hours*60))+' в неделю')+' · прогноз '+(d.projected_month_end===null?'—':money(d.projected_month_end))+' · история '+(d.historical_revenue_per_hour===null?'нет ставки':money(d.historical_revenue_per_hour)+'/ч')+'</small></div>').join('')+'</div></details></article>').join('');
 $("revenue-scenarios-note").textContent="Поступления без привязки к направлению входят в общий факт и прогноз, но не распределяются по направлениям. Прогноз темпа — линейная оценка по уже прошедшим календарным дням, а не подтверждённые заказы. Поступления сравниваются с целью текущего месяца. Почасовая ставка оценивается по поступлениям и фактическому времени за последние 90 дней; время незавершённых задач учитывается по таймеру без повторного сложения с actual_minutes. Если истории или настроенной рабочей ёмкости нет, оценка нагрузки не подменяется догадкой.";
}
$("refresh-revenue-scenarios").addEventListener("click",async()=>{const b=$("refresh-revenue-scenarios");b.disabled=true;try{await loadRevenueScenarios();}catch(err){alert(err.message);}finally{b.disabled=false;}});

let salesPlanData=null;
const DEAL_STAGES={contact:"Первичный контакт",negotiation:"Переговоры",proposal:"Предложение отправлено",awaiting_payment:"Ожидает оплаты",won:"Выиграна",lost:"Проиграна"};
const DEAL_LOSS_LABELS={price:"Цена / бюджет",timing:"Сроки",no_need:"Нет потребности",competitor:"Выбрали конкурента",no_response:"Нет ответа",trust:"Недостаток доверия",scope:"Не подошёл объём / формат",other:"Другая причина"};
let dealsData=[],editingDealId=null;
async function loadDeals(){
 const [data,workspace]=await Promise.all([api("/api/deals"),api("/api/workspace")]);dealsData=data.deals||[];
 $("deal-client").innerHTML='<option value="">Без клиента</option>'+workspace.clients.map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name)+'</option>').join("");
 $("deal-direction").innerHTML=workspace.directions.map(d=>'<option value="'+escapeHtml(d.id)+'">'+escapeHtml(d.title)+'</option>').join("");
 const s=data.summary;$("deals-summary").innerHTML=[["Открытые сделки",s.open_count],["Сумма открытых",money(s.open_amount)],["Взвешенный прогноз",money(s.weighted_amount)],["Выиграно",money(s.won_amount)],["Проиграно",s.lost_count+" · "+money(s.lost_amount)]].map(x=>'<article><span>'+x[0]+'</span><b>'+x[1]+'</b></article>').join("");
 $("deals-monthly-forecast").innerHTML=(data.monthly_forecast||[]).length?(data.monthly_forecast||[]).map(m=>'<article class="deal-month-card"><b>'+escapeHtml(m.month)+'</b><span>План <strong>'+money(m.planned_amount)+'</strong></span><span>Прогноз <strong>'+money(m.weighted_amount)+'</strong></span><span>Факт <strong>'+money(m.actual_amount)+'</strong></span><small>'+m.deal_count+' открытых сделок</small></article>').join(""):'<p class="muted">Пока нет датированных сделок или фактических поступлений.</p>';
 if(data.undated_open?.count){$("deals-monthly-forecast").insertAdjacentHTML("beforeend",'<p class="fine">Без даты оплаты: '+data.undated_open.count+' сделок на '+money(data.undated_open.amount)+'. Добавь даты, чтобы включить их в помесячный план.</p>');}
 $("deals-loss-analysis").innerHTML=s.lost_count?'<h4>Почему сделки не состоялись</h4>'+data.loss_reasons.map(x=>'<div class="loss-reason-row"><span>'+escapeHtml(x.label)+'</span><b>'+x.count+' · '+money(x.amount)+'</b></div>').join(""):'<p class="fine">Аналитика причин отказов появится после фиксации проигранных сделок.</p>';
 $("deals-list").innerHTML=dealsData.length?dealsData.map(d=>'<article class="analytics-row deal-row"><div><b>'+escapeHtml(d.title)+'</b><small>'+escapeHtml(d.client_name||"Без клиента")+' · '+escapeHtml(d.direction_title||"Без направления")+' · '+DEAL_STAGES[d.stage]+' · '+d.probability_percent+'% · закрытие '+(d.estimated_close_date||"не рассчитано")+(d.close_date_is_estimated?" · оценка по истории":"") +' · оплата '+(d.expected_payment_date||"дата не задана")+'</small><small>'+escapeHtml(d.notes||"")+'</small>'+(d.stage==="lost"?'<small class="deal-loss-label">Причина: '+escapeHtml(DEAL_LOSS_LABELS[d.loss_reason_category]||"Не указана")+(d.loss_reason_details?' · '+escapeHtml(d.loss_reason_details):"")+'</small>':"")+'<details class="deal-history"><summary>История изменений ('+d.history.length+')</summary>'+d.history.map(h=>{let changes=[];try{changes=JSON.parse(h.changes_json||"[]");}catch{}return '<div><small>'+escapeHtml(h.created_at)+' · '+(h.event_type==="created"?"Создание":"Изменение")+'</small>'+changes.map(c=>'<small>'+escapeHtml(c.label)+': '+escapeHtml(c.from===null||c.from===undefined?"—":String(c.from))+' → '+escapeHtml(c.to===null||c.to===undefined?"—":String(c.to))+'</small>').join("")+'</div>';}).join("")+'</details></div><div><strong>'+money(d.amount)+'</strong><small>Прогноз '+money(d.weighted_amount)+'</small></div><div class="deal-actions"><button class="button ghost" type="button" data-deal-edit="'+escapeHtml(d.id)+'">Изменить</button><button class="button ghost" type="button" data-deal-delete="'+escapeHtml(d.id)+'">Удалить</button></div></article>').join(""):'<p class="muted">Пока нет сделок. Добавь первую ожидаемую продажу.</p>';
}
function syncDealLossFields(){$("deal-loss-fields").classList.toggle("hidden",$("deal-stage").value!=="lost");}
function resetDealForm(){$("deal-form").reset();editingDealId=null;$("deal-probability").value=20;$("deal-form-submit").textContent="Добавить сделку";$("deal-form-cancel").classList.add("hidden");syncDealLossFields();}
$("deal-stage").addEventListener("change",()=>{const p={contact:10,negotiation:30,proposal:60,awaiting_payment:85,won:100,lost:0};$("deal-probability").value=p[$("deal-stage").value];syncDealLossFields();});
$("deal-form").addEventListener("submit",async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api("/api/deals",{method:"POST",body:JSON.stringify({action:editingDealId?"update":"create",id:editingDealId,title:$("deal-title").value,client_id:$("deal-client").value||null,direction_id:$("deal-direction").value,amount:$("deal-amount").value,stage:$("deal-stage").value,probability_percent:$("deal-probability").value,expected_close_date:$("deal-date").value||null,expected_payment_date:$("deal-payment-date").value||null,notes:$("deal-notes").value,loss_reason_category:$("deal-loss-reason").value,loss_reason_details:$("deal-loss-details").value})});resetDealForm();await loadDeals();}catch(err){alert(err.message);}finally{b.disabled=false;}});
$("deal-form-cancel").addEventListener("click",resetDealForm);
$("deals-list").addEventListener("click",async e=>{
 const edit=e.target.closest("[data-deal-edit]");if(edit){const d=dealsData.find(x=>x.id===edit.dataset.dealEdit);if(!d)return;editingDealId=d.id;$("deal-title").value=d.title;$("deal-client").value=d.client_id||"";$("deal-direction").value=d.direction_id||"";$("deal-amount").value=d.amount;$("deal-stage").value=d.stage;$("deal-probability").value=d.probability_percent;$("deal-date").value=d.expected_close_date||"";$("deal-payment-date").value=d.expected_payment_date||"";$("deal-notes").value=d.notes||"";$("deal-loss-reason").value=d.loss_reason_category||"";$("deal-loss-details").value=d.loss_reason_details||"";syncDealLossFields();$("deal-form-submit").textContent="Сохранить изменения";$("deal-form-cancel").classList.remove("hidden");$("deal-form").scrollIntoView({behavior:"smooth",block:"center"});return;}
 const del=e.target.closest("[data-deal-delete]");if(!del)return;if(!confirm("Удалить эту сделку и её историю?"))return;del.disabled=true;try{await api("/api/deals",{method:"POST",body:JSON.stringify({action:"delete",id:del.dataset.dealDelete})});if(editingDealId===del.dataset.dealDelete)resetDealForm();await loadDeals();}catch(err){alert(err.message);del.disabled=false;}
});
$("refresh-deals").addEventListener("click",()=>loadDeals().catch(err=>alert(err.message)));
async function loadSalesPlan(){
 salesPlanData=await api("/api/finance/sales-plan");
 const host=$("sales-plan-directions");
 host.innerHTML=salesPlanData.directions.map(d=>'<article class="sales-plan-card"><div class="sales-plan-title"><b>'+escapeHtml(d.title)+'</b><span>Осталось до цели: '+money(d.remaining_target)+'</span></div><div class="sales-plan-inputs"><label>Контакт → обращение, %<input type="number" min="0" max="100" step="1" data-sales-response="'+escapeHtml(d.direction_id)+'" value="'+d.contact_to_lead_percent+'"></label><label>Обращение → продажа, %<input type="number" min="0" max="100" step="1" data-sales-close="'+escapeHtml(d.direction_id)+'" value="'+d.lead_to_sale_percent+'"></label></div><div class="sales-plan-numbers"><span>Продаж: <b>'+(d.sales_required===null?'укажи средний чек':d.sales_required)+'</b></span><span>Обращений: <b>'+(d.qualified_leads_required===null?'—':d.qualified_leads_required)+'</b></span><span>Нужно первичных контактов: <b>'+(d.outreach_required===null?'—':d.outreach_required)+'</b></span><span>Потенциальных клиентов в базе: <b>'+d.potential_clients+'</b></span><span>С контактом за 30 дней: <b>'+d.contacted_clients+'</b></span></div><div class="observed-funnel"><b>Фактическая воронка за 90 дней</b><span>Контакты: '+(d.observed_contacted_clients||0)+' · квалифицированные клиенты: '+(d.observed_qualified_clients||0)+' · выигранные сделки: '+(d.observed_won_clients||0)+'</span><span>Контакт → обращение: '+(d.observed_contact_to_lead_percent===null?'недостаточно данных':d.observed_contact_to_lead_percent+'%')+' · обращение → продажа: '+(d.observed_lead_to_sale_percent===null?'недостаточно данных':d.observed_lead_to_sale_percent+'%')+'</span><span>Отклонение от заданных конверсий: '+(d.contact_conversion_delta_points===null?'—':(d.contact_conversion_delta_points>0?'+':'')+d.contact_conversion_delta_points+' п.п. по контактам')+' · '+(d.close_conversion_delta_points===null?'—':(d.close_conversion_delta_points>0?'+':'')+d.close_conversion_delta_points+' п.п. по продажам')+'</span><span>Средний цикл: до переговоров — '+(d.avg_contact_to_negotiation_days===null?'недостаточно данных':d.avg_contact_to_negotiation_days+' дн. ('+d.contact_to_negotiation_sample+' клиентов)')+' · до предложения — '+(d.avg_contact_to_proposal_days===null?'недостаточно данных':d.avg_contact_to_proposal_days+' дн. ('+d.contact_to_proposal_sample+' клиентов)')+' · до выигрыша сделки — '+(d.avg_contact_to_won_days===null?'недостаточно данных':d.avg_contact_to_won_days+' дн. ('+d.contact_to_won_sample+' клиентов)')+'</span>'+(d.can_suggest_observed?'<button type="button" class="button ghost" data-sales-apply-observed="'+escapeHtml(d.direction_id)+'">Подставить фактические конверсии</button>':'<small>Для рекомендации нужно не менее 5 клиентов с коммуникациями и 3 клиентов, дошедших до квалифицированной сделки.</small>')+'</div><p class="fine">'+(d.assumptions_default?'Используются стартовые допущения 40% и 20%. Измени их на свои показатели.':'Используются сохранённые тобой конверсии.')+'</p><button type="button" class="button ghost" data-sales-create="'+escapeHtml(d.direction_id)+'" '+(d.outreach_required===null||d.outreach_required===0?'disabled':'')+'>Добавить задачи на неделю</button></article>').join('');
 $("sales-plan-note").textContent="Фактическая воронка рассчитана за последние 90 дней по уникальным клиентам: коммуникации — из истории взаимодействий, квалификация и продажи — из истории изменения этапов сделок. Фактические проценты не применяются автоматически. Нажми «Подставить фактические конверсии», проверь значения и отдельно сохрани план.";
}

$("risk-sales-plan").addEventListener("click",async e=>{
 const button=e.target.closest("[data-risk-sales-create]");if(!button)return;
 const direction=(cashflowData?.risk_sales_plan?.directions||[]).find(x=>x.direction_id===button.dataset.riskSalesCreate);if(!direction)return;
 const titlePrefix="Кассовый разрыв — ";
 const actions=[
  {title:"Найти потенциальных клиентов — "+direction.title,count:direction.weekly_outreach,minutes:Math.max(30,Math.min(240,(direction.weekly_outreach||0)*10))},
  {title:"Провести первичные переговоры — "+direction.title,count:direction.weekly_qualified_leads,minutes:Math.max(30,Math.min(240,(direction.weekly_qualified_leads||0)*15))},
  {title:"Довести переговоры до продажи — "+direction.title,count:direction.weekly_sales,minutes:Math.max(30,Math.min(240,(direction.weekly_sales||0)*30))}
 ].filter(x=>x.count>0);
 const fresh=actions.filter(x=>!allTasks.some(t=>t.status!=="done"&&t.title===titlePrefix+x.title));
 if(!fresh.length){alert("Такие активные задачи уже есть. Дубли не созданы.");return;}
 if(!confirm("Создать "+fresh.length+" задач по направлению «"+direction.title+"»? Срок кассового риска: "+cashflowData.risk_sales_plan.due_date+"."))return;
 button.disabled=true;
 try{
  for(const action of fresh)await api("/api/tasks",{method:"POST",body:JSON.stringify({title:titlePrefix+action.title,description:"Недельный план для снижения риска кассового разрыва. Ориентир: "+action.count+". Необходимая сумма по направлению: "+money(direction.allocated_amount)+". Дата, к которой нужны поступления: "+cashflowData.risk_sales_plan.due_date+". Отмечай фактические контакты и результаты.",direction_id:direction.direction_id,due_date:localToday,priority:"high",estimated_minutes:action.minutes})});
  button.textContent="Задачи созданы";await loadTasks();await loadPlanner();
 }catch(err){alert(err.message);button.disabled=false;}
});
$("save-sales-plan").addEventListener("click",async()=>{
 const b=$("save-sales-plan");b.disabled=true;
 try{const rows=salesPlanData.directions.map(d=>({direction_id:d.direction_id,contact_to_lead_percent:document.querySelector('[data-sales-response="'+d.direction_id+'"]').value,lead_to_sale_percent:document.querySelector('[data-sales-close="'+d.direction_id+'"]').value}));await api("/api/finance/sales-plan",{method:"POST",body:JSON.stringify({directions:rows})});await loadSalesPlan();}
 catch(err){alert(err.message);}finally{b.disabled=false;}
});
$("sales-plan-directions").addEventListener("click",async e=>{
 const apply=e.target.closest("[data-sales-apply-observed]");if(apply){const d=salesPlanData.directions.find(x=>x.direction_id===apply.dataset.salesApplyObserved);if(!d||!d.can_suggest_observed)return;document.querySelector('[data-sales-response="'+d.direction_id+'"]').value=d.observed_contact_to_lead_percent;document.querySelector('[data-sales-close="'+d.direction_id+'"]').value=d.observed_lead_to_sale_percent;apply.textContent="Значения подставлены";return;}
 const b=e.target.closest("[data-sales-create]");if(!b)return;
 const d=salesPlanData.directions.find(x=>x.direction_id===b.dataset.salesCreate);if(!d)return;
 if(!confirm("Создать задачи на эту неделю для направления «"+d.title+"»?"))return;
 b.disabled=true;
 try{
  const actions=d.weekly_actions.filter(x=>x.count!==null&&x.count>0);
  for(const action of actions)await api("/api/tasks",{method:"POST",body:JSON.stringify({title:action.title+" — "+d.title,description:"Недельный ориентир по финансовому плану: "+action.count+". Требуемый объём рассчитан по заданным конверсиям. Отмечай фактические контакты и результаты в заметках.",direction_id:d.direction_id,due_date:localToday,priority:"high",estimated_minutes:Math.max(30,Math.min(240,action.count*10))})});
  b.textContent="Задачи добавлены";await loadTasks();await loadPlanner();
 }catch(err){alert(err.message);b.disabled=false;}
});
$("refresh-sales-plan").addEventListener("click",async()=>{const b=$("refresh-sales-plan");b.disabled=true;try{await loadRevenuePlan();await loadSalesPlan();}catch(err){alert(err.message);}finally{b.disabled=false;}});
$("refresh-revenue-plan").addEventListener("click",async()=>{try{await loadRevenuePlan();}catch(err){alert(err.message);}});
$("save-revenue-plan").addEventListener("click",async()=>{
 const b=$("save-revenue-plan");b.disabled=true;
 try{
  const rows=revenuePlanData.directions.map(d=>({direction_id:d.direction_id,share_percent:document.querySelector('[data-revenue-share="'+d.direction_id+'"]').value,average_sale_amount:document.querySelector('[data-revenue-ticket="'+d.direction_id+'"]').value||0}));
  const total=rows.reduce((sum,row)=>sum+Number(row.share_percent||0),0);
  if(total>100.0001)throw new Error("Сумма долей превышает 100%. Уменьши распределение.");
  await api("/api/finance/revenue-plan",{method:"POST",body:JSON.stringify({directions:rows})});
  await loadRevenuePlan();
 }catch(err){alert(err.message);}finally{b.disabled=false;}
});
async function loadDebtForecast(){
 const extra=Math.max(0,Number($("debt-extra-payment").value)||0),horizon=Number($("debt-forecast-months").value)||60;
 const data=await api("/api/finance/debt-forecast?extra="+encodeURIComponent(extra)+"&months="+horizon),s=data.summary;
 $("debt-forecast-summary").innerHTML=[["Текущий остаток",money(s.current_balance)],["Проценты по модели",money(s.projected_interest)],["Минимум в месяц",money(s.monthly_minimum)],["Срок до закрытия",s.months_to_payoff===null?"Более "+horizon+" мес. / нет платежа":s.months_to_payoff+" мес."]].map(x=>'<article><span>'+x[0]+'</span><b>'+x[1]+'</b></article>').join("");
 $("debt-forecast-list").innerHTML=data.debts.length?data.debts.map(d=>'<article class="analytics-row"><div><b>'+escapeHtml(d.title)+'</b><small>'+money(d.current_balance)+' · '+d.annual_rate+'% годовых · платёж '+money(d.minimum_payment)+' · '+(d.months_to_payoff===null?'не закрывается в выбранном горизонте':d.months_to_payoff+' мес.')+'</small></div><div><strong>'+money(d.total_interest)+'</strong><small>проценты по модели</small></div></article>').join(""):'<p class="muted">Добавь открытые долги, чтобы увидеть прогноз.</p>';
 $("debt-forecast-months-list").innerHTML=data.months.length?data.months.slice(0,24).map(m=>'<article class="finance-row"><div><b>Месяц '+m.month+'</b><small>Платежи '+money(m.payment)+' · проценты '+money(m.interest)+'</small></div><strong>'+money(m.balance)+'</strong></article>').join(""):'<p class="muted">Нет данных для графика.</p>';
}
$("refresh-debt-forecast").addEventListener("click",()=>loadDebtForecast().catch(err=>alert(err.message)));
$("debt-extra-payment").addEventListener("change",()=>loadDebtForecast().catch(err=>alert(err.message)));
$("debt-forecast-months").addEventListener("change",()=>loadDebtForecast().catch(err=>alert(err.message)));
async function loadCategoryBudget(){
 const month=$("budget-month").value;
 const data=await api("/api/finance/budget?month="+encodeURIComponent(month));
 const s=data.summary;
 $("budget-summary").innerHTML=[["План",money(s.planned)],["Факт",money(s.actual)],["Превышение лимитов",money(s.over_budget)]].map(x=>'<article><span>'+x[0]+'</span><b>'+x[1]+'</b></article>').join("");
 $("budget-categories").innerHTML=data.categories.length?data.categories.map(x=>{
  const status=x.planned===null?"Лимит не задан":x.remaining<0?"Превышен на "+money(-x.remaining):"Осталось "+money(x.remaining);
  const width=x.planned>0?Math.min(100,x.actual/x.planned*100):0;
  return '<article class="finance-row"><div class="budget-category-main"><b>'+escapeHtml(x.category)+'</b><small>Факт '+money(x.actual)+' · '+status+'</small>'+(x.planned!==null?'<div class="progress"><span style="width:'+width+'%"></span></div>':'')+'</div><strong>'+(x.planned===null?"—":money(x.planned))+'</strong>'+(x.planned!==null?'<button class="button ghost" data-budget-delete="'+escapeHtml(x.category)+'">×</button>':'')+'</article>';
 }).join(""):'<p class="muted">Пока нет расходов и бюджетов за этот месяц.</p>';
 const insights=data.insights||[];
 const repeated=insights.filter(x=>x.repeated_overrun);
 $("budget-insights").innerHTML=insights.length?'<h4>Повторяющиеся превышения бюджета за 3 месяца</h4><p class="fine">Если лимит превышался минимум в двух месяцах из трёх, предлагаю пересмотреть его по фактическим расходам. Рекомендация не применяется автоматически.</p>'+insights.map(x=>{
  const months=x.months.map(m=>'<span>'+m.month+': '+money(m.actual)+(m.budget===null?' · без плана':' / '+money(m.budget))+'</span>').join(' · ');
  return '<article class="finance-row"><div><b>'+escapeHtml(x.category)+'</b><small>'+months+'</small><small>Средний факт: '+money(x.average_actual)+' · превышений: '+x.over_budget_months+' из '+x.months_with_budget+' месяцев</small></div>'+(x.repeated_overrun?'<div><strong>Предлагаемый лимит: '+money(x.suggested_budget)+'</strong><button class="button ghost" data-budget-suggest="'+escapeHtml(x.category)+'" data-budget-amount="'+x.suggested_budget+'">Установить на выбранный месяц</button></div>':'<span class="muted">Повторного превышения нет</span>')+'</article>';
 }).join(""):'<p class="muted">Для анализа нужны расходы или бюджеты за предыдущие три полных месяца.</p>';
}
$("budget-month").addEventListener("change",()=>loadCategoryBudget().catch(err=>alert(err.message)));
$("budget-form").addEventListener("submit",async e=>{
 e.preventDefault();
 try{await api("/api/finance/budget",{method:"POST",body:JSON.stringify({month:$("budget-month").value,category:$("budget-category").value,planned_amount:$("budget-amount").value})});$("budget-amount").value="";await loadCategoryBudget();}
 catch(err){alert(err.message);}
});
$("budget-categories").addEventListener("click",async e=>{
 const b=e.target.closest("[data-budget-delete]");if(!b)return;
 try{await api("/api/finance/budget",{method:"DELETE",body:JSON.stringify({month:$("budget-month").value,category:b.dataset.budgetDelete})});await loadCategoryBudget();}
 catch(err){alert(err.message);}
});
$("budget-insights").addEventListener("click",async e=>{
 const b=e.target.closest("[data-budget-suggest]");if(!b)return;
 if(!confirm("Установить рекомендованный лимит "+money(b.dataset.budgetAmount)+" для категории «"+b.dataset.budgetSuggest+"» на выбранный месяц?"))return;
 try{await api("/api/finance/budget",{method:"POST",body:JSON.stringify({month:$("budget-month").value,category:b.dataset.budgetSuggest,planned_amount:b.dataset.budgetAmount})});await loadCategoryBudget();}
 catch(err){alert(err.message);}
});
async function loadFinance() {
  financeData = await api("/api/finance");
  await loadIncomeBuckets();
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
  $("budget-month").value=financeData.today.slice(0,7);
  $("expense-date").value=financeData.today;
  $("cashflow-direction").innerHTML='<option value="">Без направления</option>'+directions.map(d=>'<option value="'+escapeHtml(d.id)+'">'+escapeHtml(d.title)+'</option>').join("");
  $("expense-direction").innerHTML='<option value="">Не распределять / личный расход</option>'+directions.map(d=>'<option value="'+escapeHtml(d.id)+'">'+escapeHtml(d.title)+'</option>').join("");
  $("obligation-date").value=financeData.today;
  $("debt-payment-date").value=financeData.today;
  const openDebts=financeData.debts.filter(debt=>debt.status==="open");
  $("payment-debt").innerHTML=openDebts.length?openDebts.map(debt=>'<option value="'+escapeHtml(debt.id)+'">'+escapeHtml(debt.title)+' · '+money(debt.balance)+'</option>').join(""):'<option value="">Нет открытых долгов</option>';
  $("debt-payment-form").querySelector("button").disabled=!openDebts.length;
  $("finance-debts").innerHTML=financeData.debts.length?financeData.debts.map(debt=>'<article class="finance-row"><div><b>'+escapeHtml(debt.title)+'</b><small>'+escapeHtml(debt.creditor||"")+(Number(debt.interest_rate)>0?" · "+debt.interest_rate+"% годовых":"")+(Number(debt.minimum_payment)>0?" · платёж "+money(debt.minimum_payment):"")+(debt.due_day?" · до "+debt.due_day+" числа":"")+'</small></div><strong>'+money(debt.balance)+'</strong></article>').join(""):'<p class="muted">Долги пока не добавлены.</p>';
  $("finance-obligations").innerHTML=financeData.obligations.length?financeData.obligations.map(item=>'<article class="finance-row"><div><b>'+escapeHtml(item.title)+'</b><small>'+item.due_date+' · '+(item.frequency==="monthly"?"ежемесячно":item.frequency==="weekly"?"еженедельно":"один раз")+'</small></div><strong>'+money(item.amount)+'</strong><button class="button ghost" data-obligation-paid="'+escapeHtml(item.id)+'">Оплачено</button></article>').join(""):'<p class="muted">Предстоящих платежей пока нет.</p>';
  const suggestions=financeData.recurring_expense_suggestions||[];
  $("recurring-expense-suggestions").innerHTML=suggestions.length?'<h4>Возможные регулярные платежи</h4><p class="fine">Нашла похожие расходы в истории. Ничего не добавляется автоматически — проверь суммы и даты, затем подтверди создание обязательства.</p>'+suggestions.map((x,i)=>'<article class="finance-row"><div><b>'+escapeHtml(x.title)+'</b><small>'+escapeHtml(x.category)+' · '+x.occurrences+' раза · '+(x.frequency==="monthly"?"ежемесячно":"еженедельно")+' · средняя сумма '+money(x.amount)+'</small><small>Последняя оплата: '+x.last_paid_on+' · следующая дата: '+x.next_date+'</small></div><button class="button ghost" data-recurring-add="'+i+'">Добавить в обязательства</button></article>').join(""):'<p class="muted">Пока не обнаружено достаточно устойчивых повторяющихся расходов. Для предложения нужны минимум три похожие оплаты с близкими суммами и интервалами.</p>';
  $("finance-expense-list").innerHTML=financeData.expenses.length?financeData.expenses.slice(0,12).map(item=>'<article class="finance-row"><div><b>'+escapeHtml(item.title)+'</b><small>'+item.spent_on+' · '+escapeHtml(item.category)+(item.direction_title?' · '+escapeHtml(item.direction_title):' · не распределён')+(item.bucket_title?' · корзина: '+escapeHtml(item.bucket_title):'')+'</small></div><strong>'+money(item.amount)+'</strong><button class="button ghost" data-expense-delete="'+escapeHtml(item.id)+'">×</button></article>').join(""):'<p class="muted">Расходов пока нет.</p>';
  await loadCashflowForecast();
  await loadDebtForecast();
  await loadRevenuePlan();
  await loadCategoryBudget();
}
$("expense-form").addEventListener("submit",async e=>{
  e.preventDefault();
  try{await api("/api/finance",{method:"POST",body:JSON.stringify({action:"expense",title:$("expense-title").value,amount:$("expense-amount").value,category:$("expense-category").value,direction_id:$("expense-direction").value||null,client_id:$("expense-client").value||null,project_id:$("expense-project").value||null,bucket_id:$("expense-bucket").value==="none"?null:$("expense-bucket").value,spent_on:$("expense-date").value})});$("expense-form").reset();await loadFinance();await loadCashflowForecast();}
  catch(err){alert(err.message);}
});
$("debt-form").addEventListener("submit",async e=>{
  e.preventDefault();
  try{await api("/api/finance",{method:"POST",body:JSON.stringify({action:"debt",title:$("debt-title").value,creditor:$("debt-creditor").value,initial_amount:$("debt-amount").value,interest_rate:$("debt-rate").value,minimum_payment:$("debt-minimum").value,due_day:$("debt-due-day").value})});$("debt-form").reset();$("debt-rate").value="0";$("debt-minimum").value="0";await loadFinance();}
  catch(err){alert(err.message);}
});
$("obligation-form").addEventListener("submit",async e=>{
  e.preventDefault();
  try{await api("/api/finance",{method:"POST",body:JSON.stringify({action:"obligation",title:$("obligation-title").value,amount:$("obligation-amount").value,due_date:$("obligation-date").value,frequency:$("obligation-frequency").value,category:$("obligation-category").value})});$("obligation-form").reset();await loadFinance();}
  catch(err){alert(err.message);}
});
$("debt-payment-form").addEventListener("submit",async e=>{
  e.preventDefault();
  try{await api("/api/finance",{method:"POST",body:JSON.stringify({action:"debt_payment",debt_id:$("payment-debt").value,amount:$("debt-payment-amount").value,paid_on:$("debt-payment-date").value})});$("debt-payment-amount").value="";await loadFinance();}
  catch(err){alert(err.message);}
});
$("recurring-expense-suggestions").addEventListener("click",async e=>{
 const button=e.target.closest("[data-recurring-add]");if(!button)return;
 const item=(financeData?.recurring_expense_suggestions||[])[Number(button.dataset.recurringAdd)];if(!item)return;
 if(!confirm('Добавить «'+item.title+'» как '+(item.frequency==="monthly"?"ежемесячный":"еженедельный")+' обязательный платёж на '+money(item.amount)+'?'))return;
 try{await api("/api/finance",{method:"POST",body:JSON.stringify({action:"obligation",title:item.title,amount:item.amount,due_date:item.next_date,frequency:item.frequency,recurrence_day:item.frequency==="monthly"?Number(item.last_paid_on.slice(8,10)):null,category:item.category,notes:"Создано из предложения по истории расходов. Проверь сумму и дату."})});await loadFinance();}
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
  const clientOptions='<option value="">Без клиента</option>'+workspaceData.clients.map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name)+'</option>').join("");
  const projectOptions='<option value="">Без проекта</option>'+workspaceData.projects.filter(p=>!["done","archived"].includes(p.status)).map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.title)+(p.client_name?' · '+escapeHtml(p.client_name):'')+'</option>').join("");
  ["income-client","expense-client"].forEach(id=>$(id).innerHTML=clientOptions);
  ["income-project","expense-project"].forEach(id=>$(id).innerHTML=projectOptions);
  ["income-project","expense-project"].forEach(id=>$(id).onchange=()=>{const project=workspaceData.projects.find(p=>p.id===$(id).value);if(project?.client_id)$(id.replace("-project","-client")).value=project.client_id;});
  $("task-project").innerHTML='<option value="">Без проекта</option>'+workspaceData.projects.filter(p=>!["done","archived"].includes(p.status)).map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.title)+(p.client_name?' · '+escapeHtml(p.client_name):'')+'</option>').join("");
  $("task-life-area").innerHTML='<option value="">Не личная задача</option>'+workspaceData.life_areas.map(a=>'<option value="'+escapeHtml(a.id)+'">'+escapeHtml(a.title)+'</option>').join("");
  const portfolio=workspaceData.clients.reduce((a,c)=>({active:a.active+Number(c.active_projects||0),open:a.open+Number(c.open_tasks||0),overdue:a.overdue+Number(c.overdue_tasks||0),stale:a.stale+Number(c.stale_projects||0),due:a.due+Number(c.outstanding_payment||0)}),{active:0,open:0,overdue:0,stale:0,due:0});
  const activity=workspaceData.client_activity_summary||{week:{},month:{}};
  const activityHtml='<div class="client-activity-period"><b>Работа с клиентами за неделю</b><span>'+Number(activity.week?.interactions||0)+' контактов · '+Number(activity.week?.meetings||0)+' встреч · '+Number(activity.week?.tasks_completed||0)+' задач завершено</span><b>За 30 дней</b><span>'+Number(activity.month?.interactions||0)+' контактов · '+Number(activity.month?.meetings||0)+' встреч · '+Number(activity.month?.tasks_completed||0)+' задач завершено</span></div>';
  $("workspace-clients").innerHTML=activityHtml+(workspaceData.clients.length?'<div class="client-portfolio-summary"><div><small>Активные проекты</small><b>'+portfolio.active+'</b></div><div><small>Открытые задачи</small><b>'+portfolio.open+'</b></div><div class="'+(portfolio.overdue?'warning':'')+'"><small>Просроченные задачи</small><b>'+portfolio.overdue+'</b></div><div><small>Ожидается оплат</small><b>'+money(portfolio.due)+'</b></div></div>':'')+(workspaceData.clients.length?workspaceData.clients.map(c=>{const overdue=Number(c.overdue_tasks||0),last=c.last_activity||"Нет записей",alerts=[];if(Number(c.overdue_project_deadlines||0))alerts.push("Срок проекта прошёл: "+c.overdue_project_deadlines);if(Number(c.upcoming_project_deadlines||0))alerts.push("Срок в ближайшие 7 дней: "+c.upcoming_project_deadlines);if(Number(c.stale_projects||0))alerts.push("Без движения более 14 дней: "+c.stale_projects);if(Number(c.outstanding_payment||0)>0)alerts.push("Ожидается оплата: "+money(c.outstanding_payment));return '<article class="workspace-item client-portfolio-card"><b>'+escapeHtml(c.name)+'</b><small>'+escapeHtml(c.direction_title||"Без направления")+' · '+Number(c.project_count||0)+' проектов · '+({lead:"Потенциальный",active:"Активный",paused:"Пауза",closed:"Завершён"})[c.status]+'</small><div class="client-portfolio-metrics"><span><small>В работе</small><b>'+Number(c.active_projects||0)+' проектов</b></span><span><small>Открыто задач</small><b>'+Number(c.open_tasks||0)+'</b></span><span class="'+(overdue?'warning':'')+'"><small>Просрочено</small><b>'+overdue+'</b></span><span><small>К получению</small><b>'+money(c.outstanding_payment||0)+'</b></span><span><small>Получено всего</small><b>'+money(c.revenue_total||0)+'</b></span><span><small>Прямые расходы всего</small><b>'+money(c.direct_expenses_total||0)+'</b></span><span><small>Финансовый вклад</small><b>'+money(c.economics?.contribution??(Number(c.revenue_total||0)-Number(c.direct_expenses_total||0)))+'</b></span><span><small>Маржа</small><b>'+(c.economics?.margin_percent===null||c.economics?.margin_percent===undefined?"—":c.economics.margin_percent+"%")+'</b></span><span><small>Учтено времени</small><b>'+duration(Number(c.tracked_minutes||0))+'</b></span><span><small>Выручка в час</small><b>'+(Number(c.tracked_minutes||0)>0?money(Number(c.revenue_total||0)/(Number(c.tracked_minutes)/60)):"—")+'</b></span><span><small>Вклад в час</small><b>'+(Number(c.tracked_minutes||0)>0?money((Number(c.revenue_total||0)-Number(c.direct_expenses_total||0))/(Number(c.tracked_minutes)/60)):"—")+'</b></span><span><small>Оценка открытых задач</small><b>'+(Number(c.open_estimated_minutes||0)?duration(Number(c.open_estimated_minutes)): "Не задана")+'</b></span></div><div class="client-risk-flags">'+(alerts.length?alerts.map(x=>'<span>'+escapeHtml(x)+'</span>').join(""):'<span class="ok">Нет критичных сигналов по проектам</span>')+'</div><small>'+(c.next_deadline?'Ближайший срок: '+escapeHtml(c.next_deadline):'Нет предстоящих сроков')+' · Последняя запись: '+escapeHtml(last)+'</small><small>'+escapeHtml(c.contact||"Контакт не указан")+'</small><div class="workspace-actions"><button type="button" class="button ghost" data-open-client-history="'+escapeHtml(c.id)+'">История взаимодействий</button></div><div class="client-history hidden" data-client-history-panel="'+escapeHtml(c.id)+'"></div><details class="workspace-edit"><summary>Изменить клиента</summary><form data-edit-client="'+escapeHtml(c.id)+'"><label>Имя / компания<input name="name" required maxlength="160" value="'+escapeHtml(c.name)+'"></label><label>Контакт<input name="contact" maxlength="240" value="'+escapeHtml(c.contact||"")+'"></label><label>Статус<select name="status"><option value="lead" '+(c.status==="lead"?"selected":"")+'>Потенциальный</option><option value="active" '+(c.status==="active"?"selected":"")+'>Активный</option><option value="paused" '+(c.status==="paused"?"selected":"")+'>Пауза</option><option value="closed" '+(c.status==="closed"?"selected":"")+'>Завершён</option></select></label><label>Заметки<textarea name="notes" rows="2" maxlength="3000">'+escapeHtml(c.notes||"")+'</textarea></label><button type="submit" class="button ghost">Сохранить клиента</button></form></details></article>'}).join(""):'<p class="muted">Клиенты пока не добавлены.</p>');
  const workloadHorizons=workspaceData.project_workload_summary||[];
  $("project-workload-summary").innerHTML=workloadHorizons.length?'<div class="project-workload-heading"><b>Нагрузка по ближайшим срокам</b><small>Оценка оставшейся работы с учётом запланированных встреч, поездок, личных событий и хобби. Сон и рабочие блоки не вычитаются.</small></div><div class="project-workload-grid">'+workloadHorizons.map(h=>'<div><small>Срок до '+h.days+' дней</small><b>'+Number(h.projects||0)+' проектов</b><span>'+duration(Number(h.estimated_minutes||0))+' оценённой работы</span><span>'+Number(h.unestimated_tasks||0)+' задач без оценки</span>'+(workspaceData.work_capacity?.configured?'<span>Календарь занят: '+duration(Number(h.calendar_busy_minutes||0))+'</span><span>Доступно после календаря: '+duration(Number(h.capacity_minutes||0))+'</span><span>Загрузка: '+(h.load_percent===null?'—':h.load_percent+'%')+(h.over_capacity?' · выше ёмкости':'')+'</span>':'')+'</div>').join("")+'</div>'+(workspaceData.work_capacity?.configured?'<small class="fine">График: '+workspaceData.work_capacity.working_days.map(d=>["","Пн","Вт","Ср","Чт","Пт","Сб","Вс"][d]).join(", ")+' · '+duration(workspaceData.work_capacity.daily_capacity_minutes)+' в выбранный день. Это предварительная оценка по срокам, не календарный план.</small>':'<small class="fine">Рабочая ёмкость не настроена. Сохрани график в блоке «План на сегодня», чтобы включить сравнение с доступным временем.</small>'):'';
  const dailyLoad=workspaceData.project_daily_load;
  if(dailyLoad?.configured){
    const dayNames=["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
    const dailyHtml=(dailyLoad.days||[]).map(d=>{const date=new Date(d.date+"T12:00:00"),label=dayNames[date.getDay()]+" "+date.toLocaleDateString("ru-RU",{day:"numeric",month:"short"});return '<div class="daily-load-row '+(d.overloaded?'overloaded':'')+'"><div><b>'+label+'</b><small>'+d.projects.map(p=>escapeHtml(p.title)).join(", ")+'</small></div><span>План: '+duration(d.planned_minutes)+'</span><span>Свободно: '+duration(d.available_minutes)+'</span>'+(d.overloaded?'<strong>Перегрузка</strong>':'')+'</div>';}).join("");
    $("project-workload-summary").insertAdjacentHTML("beforeend",'<div class="daily-load-panel"><b>По дням: предварительное распределение нагрузки</b><small>Оценённые задачи проектов равномерно распределены по рабочим дням до их дедлайнов. Это прогноз нагрузки, а не автоматически созданные календарные задачи.</small>'+dailyHtml+(dailyLoad.projects_without_deadline?'<small>Без срока: '+dailyLoad.projects_without_deadline+' проектов с оценённой работой — они не распределены по дням.</small>':'')+'</div>');
  }
  $("workspace-projects").innerHTML=workspaceData.projects.length?workspaceData.projects.map(p=>{const total=Number(p.total_tasks||0),done=Number(p.done_tasks||0),percent=total?Math.round(done/total*100):0,e=p.economics||{},today=workspaceData.today||new Date().toISOString().slice(0,10),daysToDeadline=p.deadline?Math.round((new Date(p.deadline+"T12:00:00")-new Date(today+"T12:00:00"))/86400000):null,stale=p.last_activity_at&&((Date.now()-new Date(p.last_activity_at).getTime())>14*86400000),risk=[];if(daysToDeadline!==null&&daysToDeadline<0&&["active","waiting"].includes(p.status))risk.push("Срок просрочен");else if(daysToDeadline!==null&&daysToDeadline<=7&&["active","waiting"].includes(p.status))risk.push("До срока "+daysToDeadline+" дн.");if(stale&&["active","waiting"].includes(p.status))risk.push("Нет движения более 14 дней");if(Number(e.outstanding||0)>0&&["active","waiting"].includes(p.status))risk.push("К получению "+money(e.outstanding));const economicStatus={loss:"Отрицательный финансовый результат",over_budget:"Расходы выше бюджета",awaiting_payment:"Есть сумма к получению",on_track:"В пределах плана"}[e.status]||"Недостаточно данных";return '<article class="workspace-item"><b>'+escapeHtml(p.title)+'</b><small>'+(p.client_name?escapeHtml(p.client_name)+' · ':'')+escapeHtml(p.direction_title||"Собственный проект")+'</small><small>'+(p.deadline?'Срок: '+escapeHtml(p.deadline)+' · ':'')+'Задачи: '+done+' из '+total+' выполнено · открыто: '+Number(p.open_tasks||0)+'</small>'+'<div class="project-workload-detail"><span>Осталось по оценкам: <b>'+duration(Number(p.workload?.estimated_minutes||0))+'</b></span><span>Без оценки: <b>'+Number(p.workload?.unestimated_open_tasks||0)+'</b></span>'+(p.workload?.required_hours_per_workday!==null&&p.workload?.required_hours_per_workday!==undefined?'<span>Нужно в среднем: <b>'+p.workload.required_hours_per_workday+' ч / рабочий день</b></span>':'')+'</div>'+(total?'<div class="progress" role="progressbar" aria-label="Готовность проекта" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'"><span style="width:'+percent+'%"></span></div>':'<small class="muted">Пока нет задач — можно составить план с ИИ.</small>')+(risk.length?'<div class="project-risk-flags">'+risk.map(x=>'<span>'+escapeHtml(x)+'</span>').join("")+'</div>':'<div class="project-risk-flags ok"><span>Нет срочных сигналов</span></div>')+'<div class="project-economics"><div><small>Плановая выручка</small><b>'+money(e.planned_revenue||0)+'</b></div><div><small>Получено</small><b>'+money(e.received||0)+'</b></div><div><small>Осталось получить</small><b>'+money(e.outstanding||0)+'</b></div><div><small>Прямые расходы</small><b>'+money(e.direct_expenses||0)+'</b></div><div><small>Бюджет расходов</small><b>'+money(e.planned_cost_budget||0)+'</b></div><div><small>Использовано бюджета</small><b>'+(e.budget_usage_percent===null||e.budget_usage_percent===undefined?"—":e.budget_usage_percent+"%")+'</b></div><div><small>Финансовый вклад</small><b>'+money(e.contribution||0)+'</b></div><div><small>Учтено времени</small><b>'+duration(Math.round(Number(e.hours||0)*60))+'</b></div><div><small>Выручка в час</small><b>'+(e.revenue_per_hour===null||e.revenue_per_hour===undefined?"—":money(e.revenue_per_hour))+'</b></div><div><small>Вклад в час</small><b>'+(e.contribution_per_hour===null||e.contribution_per_hour===undefined?"—":money(e.contribution_per_hour))+'</b></div><div><small>Маржа</small><b>'+(e.margin_percent===null||e.margin_percent===undefined?"—":e.margin_percent+"%")+'</b></div></div><small class="project-economics-status '+(e.status==="loss"||e.status==="over_budget"?"warning":"")+'">'+escapeHtml(economicStatus)+'</small>'+'<details class="workspace-edit"><summary>Изменить проект</summary><form data-edit-project="'+escapeHtml(p.id)+'"><label>Название<input name="title" required maxlength="180" value="'+escapeHtml(p.title)+'"></label><label>Описание<textarea name="description" rows="3" maxlength="5000">'+escapeHtml(p.description||"")+'</textarea></label><label>Ожидаемый результат<textarea name="expected_result" rows="2" maxlength="2000">'+escapeHtml(p.expected_result||"")+'</textarea></label><div class="workspace-inline"><label>Срок<input name="deadline" type="date" value="'+escapeHtml(p.deadline||"")+'"></label><label>Плановая сумма договора / выручки, ₽<input name="budget" type="number" min="0" step="0.01" value="'+Number(p.budget||0)+'"></label><label>Бюджет прямых расходов, ₽<input name="cost_budget" type="number" min="0" step="0.01" value="'+Number(p.cost_budget||0)+'"></label></div><label>Статус<select name="status"><option value="draft" '+(p.status==="draft"?"selected":"")+'>Черновик</option><option value="active" '+(p.status==="active"?"selected":"")+'>В работе</option><option value="waiting" '+(p.status==="waiting"?"selected":"")+'>Ожидание</option><option value="done" '+(p.status==="done"?"selected":"")+'>Завершён</option><option value="archived" '+(p.status==="archived"?"selected":"")+'>Архив</option></select></label><button type="submit" class="button ghost">Сохранить проект</button></form></details><div class="workspace-actions"><span class="status-chip">'+({active:"В работе",draft:"Черновик",waiting:"Ожидание",done:"Завершён",archived:"Архив"})[p.status]+'</span><button type="button" class="button ghost" data-project-plan="'+escapeHtml(p.id)+'">Составить план с ИИ</button><button type="button" class="button ghost" data-project-meetings="'+escapeHtml(p.id)+'">Встречи и протоколы</button><button type="button" class="button ghost" data-project-cashflow="'+escapeHtml(p.id)+'">Платежи и денежный поток</button></div><div class="project-meetings hidden" id="project-meetings-'+escapeHtml(p.id)+'"></div><div class="project-cashflow hidden" id="project-cashflow-'+escapeHtml(p.id)+'"></div></article>'}).join(""):'<p class="muted">Проекты пока не созданы.</p>';
  $("workspace-areas").innerHTML=workspaceData.life_areas.map(a=>'<article class="workspace-item"><b>'+escapeHtml(a.title)+'</b><small>'+escapeHtml(a.description||"Личные задачи и регулярные дела")+'</small></article>').join("");
}
$("client-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/workspace",{method:"POST",body:JSON.stringify({type:"client",name:$("client-name").value,direction_id:$("client-direction").value||null,contact:$("client-contact").value,notes:$("client-notes").value})});$("client-form").reset();await loadWorkspace();}catch(err){alert(err.message);}});
$("project-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/workspace",{method:"POST",body:JSON.stringify({type:"project",title:$("project-title").value,client_id:$("project-client").value||null,direction_id:$("project-direction").value||null,description:$("project-description").value,expected_result:$("project-result").value,deadline:$("project-deadline").value||null,budget:$("project-budget").value||0,cost_budget:$("project-cost-budget").value||0})});$("project-form").reset();await loadWorkspace();}catch(err){alert(err.message);}});
$("life-area-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/workspace",{method:"POST",body:JSON.stringify({type:"life_area",title:$("life-area-title").value,description:$("life-area-description").value})});$("life-area-form").reset();await loadWorkspace();}catch(err){alert(err.message);}});
$("workspace-clients").addEventListener("submit",async e=>{const form=e.target.closest("form[data-edit-client]");if(!form)return;e.preventDefault();const v=Object.fromEntries(new FormData(form));try{await api("/api/workspace",{method:"PATCH",body:JSON.stringify({type:"client",id:form.dataset.editClient,...v})});await loadWorkspace();}catch(err){alert(err.message);}});


function renderProjectCashflow(data,projectId){
 const f=data.forecast||{},items=data.items||[];
 const rows=items.map(x=>'<div class="project-cashflow-row"><div><b>'+escapeHtml(x.title)+'</b><small>'+escapeHtml(x.expected_date)+' · '+(x.flow_type==="income"?"Поступление":"Расход")+' · '+({planned:"Запланировано",realized:"Состоялось",cancelled:"Отменено"}[x.status]||x.status)+'</small>'+(x.note?'<small>'+escapeHtml(x.note)+'</small>':'')+'</div><strong class="'+(x.flow_type==="income"?"positive":"")+'">'+(x.flow_type==="income"?"+":"−")+money(x.amount)+'</strong>'+(x.status==="planned"?'<button type="button" class="button ghost" data-cashflow-realized="'+escapeHtml(x.id)+'">Отметить состоявшимся</button>':'')+'<button type="button" class="button ghost" data-cashflow-delete="'+escapeHtml(x.id)+'">Удалить</button></div>').join("");
 return '<div class="project-cashflow-head"><b>Плановые платежи</b><button type="button" class="button ghost" data-cashflow-close="'+escapeHtml(projectId)+'">Свернуть</button></div><div class="project-cashflow-summary"><span>Ожидаемые поступления <b>'+money(f.planned_incoming||0)+'</b></span><span>Предстоящие расходы <b>'+money(f.planned_outgoing||0)+'</b></span><span>Сальдо <b>'+money(f.net||0)+'</b></span></div>'+(f.first_negative_date?'<p class="project-cashflow-warning">По графику расходы опережают поступления с '+escapeHtml(f.first_negative_date)+'. Минимальный накопленный разрыв: '+money(Math.abs(f.minimum_cumulative||0))+'.</p>':'<p class="fine">По введённому графику накопительный разрыв не обнаружен. Это прогноз только по указанным платежам, не по всем деньгам бизнеса.</p>')+'<form class="project-cashflow-form" data-project-cashflow-form="'+escapeHtml(projectId)+'"><label>Тип<select name="flow_type"><option value="income">Поступление</option><option value="expense">Расход</option></select></label><label>Название<input name="title" required maxlength="180" placeholder="Аванс, этап работ, подрядчик"></label><label>Сумма, ₽<input name="amount" type="number" min="0.01" step="0.01" required></label><label>Дата<input name="expected_date" type="date" required></label><label class="cashflow-note">Комментарий<input name="note" maxlength="500"></label><button class="button primary" type="submit">Добавить платёж</button></form><p class="fine">Отметка «состоялся» убирает платёж из прогноза. Фактическое поступление или расход нужно отдельно внести в финансовый учёт — двойного начисления не будет.</p><div class="project-cashflow-list">'+(rows||'<p class="fine">Плановых платежей пока нет.</p>')+'</div>';
}
function renderMeetingFollowupSummary(summary,followups=[],questions=[]){
 const s=summary||{};
 const labels={todo:"К выполнению",doing:"В работе",waiting:"Ожидание"};
 const pending=(followups||[]).map(item=>'<li class="'+(item.overdue?'is-overdue':'')+'"><b>'+escapeHtml(item.task||item.task_title||"Поручение")+'</b><small>'+escapeHtml(item.meeting_title||"Встреча")+(item.meeting_date?' · '+escapeHtml(item.meeting_date):'')+(item.assignee?' · '+escapeHtml(item.assignee):'')+(item.due_date?' · срок: '+escapeHtml(item.due_date):'')+' · '+(item.task_missing?'задача не создана':escapeHtml(labels[item.task_status]||item.task_status||"статус неизвестен"))+(item.overdue?' · ПРОСРОЧЕНО':'')+'</small></li>').join("");
 return '<div class="meeting-followup-summary"><div><small>Поручений</small><b>'+Number(s.agreements_total||0)+'</b></div><div><small>Выполнено</small><b>'+Number(s.completed||0)+'</b></div><div><small>Ожидает</small><b>'+Number(s.pending||0)+'</b></div><div class="'+(s.overdue?'is-overdue':'')+'"><small>Просрочено</small><b>'+Number(s.overdue||0)+'</b></div><div><small>Открытых вопросов</small><b>'+Number(s.open_questions||0)+'</b></div></div>'+(pending?'<details class="meeting-followup-list"><summary>Невыполненные поручения · '+(followups||[]).length+'</summary><ul>'+pending+'</ul></details>':'<p class="fine">Все поручения выполнены.</p>')+((questions||[]).length?'<details class="meeting-followup-list"><summary>Открытые вопросы · '+questions.length+'</summary><ul>'+questions.map(item=>'<li><b>'+escapeHtml(item.question)+'</b><small>'+escapeHtml(item.meeting_title||"Встреча")+(item.meeting_date?' · '+escapeHtml(item.meeting_date):'')+'</small></li>').join("")+'</ul></details>':'');
}
async function openProjectMeetings(projectId){
 const panel=$("project-meetings-"+projectId);if(!panel)return;
 panel.classList.remove("hidden");panel.innerHTML='<p class="fine">Загружаю протоколы…</p>';
 try{
  const data=await api("/api/meetings?project_id="+encodeURIComponent(projectId));
  panel.innerHTML='<div class="project-cashflow-head"><b>История встреч · '+data.meetings.length+'</b><button type="button" class="button ghost" data-project-meetings-close="'+escapeHtml(projectId)+'">Скрыть</button></div>'+renderMeetingFollowupSummary(data.followup_summary,data.followups,data.open_question_items)+(data.meetings.length?data.meetings.map(m=>'<article class="client-history-entry"><small>Встреча · '+escapeHtml(m.meeting_date||"")+(m.participants?' · '+escapeHtml(m.participants):'')+'</small><b>'+escapeHtml(m.title)+'</b>'+(m.summary?'<p>'+escapeHtml(m.summary)+'</p>':'')+(m.decisions?.length?'<b>Решения</b><ul>'+m.decisions.map(x=>'<li>'+escapeHtml(x)+'</li>').join("")+'</ul>':'')+(m.agreements?.length?'<b>Договорённости и поручения</b><ul>'+m.agreements.map(x=>'<li>'+escapeHtml(typeof x==="string"?x:x.task+(x.assignee?' · Ответственный: '+x.assignee:'')+(x.due_date?' · срок: '+x.due_date:'')+(x.task_id?' · задача: '+(x.task_title||x.task_id)+' ('+({todo:"К выполнению",doing:"В работе",waiting:"Ожидание",done:"Выполнена"}[x.task_status]||x.task_status||"создана")+')':' · задача не создана')+((x.task_id&&x.task_status!=="done"&&(x.task_due_date||x.due_date)&&(x.task_due_date||x.due_date)<(data.today||localToday))?' · ПРОСРОЧЕНО':'')+(x.task_id?' · задача: '+(x.task_title||x.task_id)+' ('+({todo:"К выполнению",doing:"В работе",waiting:"Ожидание",done:"Выполнена"}[x.task_status]||x.task_status||"создана")+')': ' · задача не создана')+((x.task_id&&x.task_status!=="done"&&(x.task_due_date||x.due_date)&&(x.task_due_date||x.due_date)<(data.today||localToday))?' · ПРОСРОЧЕНО':''))+'</li>').join("")+'</ul>':'<small>Поручений нет</small>')+(m.open_questions?.length?'<b>Открытые вопросы</b><ul>'+m.open_questions.map(x=>'<li>'+escapeHtml(x)+'</li>').join("")+'</ul>':'')+'</article>').join(""):'<p class="fine">Встреч по этому проекту пока нет.</p>');
 }catch(err){panel.innerHTML='<p class="project-cashflow-warning">'+escapeHtml(err.message)+'</p>';}
}
async function openProjectCashflow(projectId){
 const panel=$("project-cashflow-"+projectId);if(!panel)return;
 panel.classList.remove("hidden");panel.innerHTML='<p class="fine">Загружаю график платежей…</p>';
 try{const data=await api("/api/project-cashflows?project_id="+encodeURIComponent(projectId));panel.innerHTML=renderProjectCashflow(data,projectId);}
 catch(err){panel.innerHTML='<p class="project-cashflow-warning">'+escapeHtml(err.message)+'</p>';}
}

function renderClientHistory(data){
 const typeLabels={meeting:"Встреча",call:"Звонок",email:"Письмо",message:"Сообщение",note:"Заметка",task:"Задача",project:"Проект",income:"Доход",expense:"Расход"};
 const timeline=(data.timeline||[]).map(item=>'<article class="client-history-entry"><small>'+escapeHtml(typeLabels[item.kind]||item.kind)+' · '+escapeHtml(item.date||"")+(item.project_title?' · '+escapeHtml(item.project_title):'')+'</small><b>'+escapeHtml(item.title||"Без названия")+'</b>'+(item.body?'<p>'+escapeHtml(item.body)+'</p>':'')+(Number.isFinite(item.amount)?'<strong>'+escapeHtml(money(item.amount))+'</strong>':'')+(item.category?'<small>Категория: '+escapeHtml(item.category)+'</small>':'')+(item.status?'<small>Статус: '+escapeHtml(item.status)+'</small>':'')+(item.details?.decisions?.length?'<small>Решения: '+escapeHtml(item.details.decisions.join("; "))+'</small>':'')+(item.kind==="meeting"&&item.details?'<details class="client-meeting-details"><summary>Открыть протокол · поручения и вопросы</summary>'+(item.details.participants?'<p><b>Участники:</b> '+escapeHtml(item.details.participants)+'</p>':'')+(item.details.agreements?.length?'<b>Договорённости и поручения</b><ul>'+item.details.agreements.map(x=>'<li>'+escapeHtml(typeof x==="string"?x:(x.task+(x.assignee?' · Ответственный: '+x.assignee:'')+(x.due_date?' · срок: '+x.due_date:'')))+'</li>').join("")+'</ul>':'<p class="fine">Поручений нет</p>')+(item.details.open_questions?.length?'<b>Открытые вопросы</b><ul>'+item.details.open_questions.map(x=>'<li>'+escapeHtml(x)+'</li>').join("")+'</ul>':'')+(item.details.transcript?'<details><summary>Исходная запись встречи</summary><p>'+escapeHtml(item.details.transcript)+'</p></details>':'')+'</details>':'')+'</article>').join("");
 const projects=(data.projects||[]).map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.title)+'</option>').join("");
 const financial=data.financial||{income:0,expenses:0};
 return '<div class="section-head"><div><b>История: '+escapeHtml(data.client.name)+'</b><p class="fine">Проекты, задачи, встречи, поступления и расходы</p></div></div><div class="client-finance-summary"><article><small>Поступления</small><b>'+money(financial.income)+'</b></article><article><small>Расходы</small><b>'+money(financial.expenses)+'</b></article><article><small>Разница</small><b>'+money(Number(financial.income)-Number(financial.expenses))+'</b></article></div><h4>Контроль договорённостей по встречам</h4>'+renderMeetingFollowupSummary(data.followup_summary,data.followups,data.open_question_items)+'<form class="client-history-form" data-client-history-form="'+escapeHtml(data.client.id)+'"><label>Тип записи<select name="type"><option value="call">Звонок</option><option value="email">Письмо</option><option value="message">Сообщение</option><option value="note">Заметка</option></select></label><label>Дата<input name="occurred_on" type="date" value="'+(localToday||new Date().toISOString().slice(0,10))+'" required></label><label>Проект<select name="project_id"><option value="">Без привязки к проекту</option>'+projects+'</select></label><label>Тема<input name="title" maxlength="180" required placeholder="Например, обсудили объём работ"></label><label>Содержание<textarea name="body" rows="3" maxlength="5000" placeholder="Что обсудили, о чём договорились, что важно помнить"></textarea></label><button class="button primary">Сохранить запись</button></form><div class="client-history-timeline">'+(timeline||'<p class="muted">История пока пустая.</p>')+'</div>';
}
async function loadClientHistory(clientId){
 const panel=document.querySelector('[data-client-history-panel="'+CSS.escape(clientId)+'"]');
 if(!panel)return;
 panel.classList.remove("hidden");panel.innerHTML='<p class="fine">Загружаю историю…</p>';
 try{const data=await api("/api/client-history?client_id="+encodeURIComponent(clientId));panel.innerHTML=renderClientHistory(data);}
 catch(err){panel.innerHTML='<p class="error">'+escapeHtml(err.message)+'</p>';}
}
$("workspace-clients").addEventListener("click",async e=>{
 const button=e.target.closest("[data-open-client-history]");if(!button)return;
 const id=button.dataset.openClientHistory,panel=document.querySelector('[data-client-history-panel="'+CSS.escape(id)+'"]');
 if(!panel)return;
 if(!panel.classList.contains("hidden")){panel.classList.add("hidden");button.textContent="История взаимодействий";return;}
 button.textContent="Скрыть историю";await loadClientHistory(id);
});
$("workspace-clients").addEventListener("submit",async e=>{
 const form=e.target.closest("form[data-client-history-form]");if(!form)return;e.preventDefault();
 const values=Object.fromEntries(new FormData(form));values.client_id=form.dataset.clientHistoryForm;
 const button=form.querySelector("button");button.disabled=true;button.textContent="Сохраняю…";
 try{await api("/api/client-history",{method:"POST",body:JSON.stringify(values)});await loadClientHistory(values.client_id);}
 catch(err){alert(err.message);button.disabled=false;button.textContent="Повторить";}
});

$("workspace-projects").addEventListener("submit",async e=>{const form=e.target.closest("form[data-edit-project]");if(!form)return;e.preventDefault();const v=Object.fromEntries(new FormData(form));try{await api("/api/workspace",{method:"PATCH",body:JSON.stringify({type:"project",id:form.dataset.editProject,...v})});await loadWorkspace();}catch(err){alert(err.message);}});


$("workspace-projects").addEventListener("click",async e=>{
 const meetings=e.target.closest("[data-project-meetings]");if(meetings){await openProjectMeetings(meetings.dataset.projectMeetings);return;}
 const meetingsClose=e.target.closest("[data-project-meetings-close]");if(meetingsClose){const panel=$("project-meetings-"+meetingsClose.dataset.projectMeetingsClose);if(panel)panel.classList.add("hidden");return;}
 const open=e.target.closest("[data-project-cashflow]");if(open){await openProjectCashflow(open.dataset.projectCashflow);return;}
 const close=e.target.closest("[data-cashflow-close]");if(close){const panel=$("project-cashflow-"+close.dataset.cashflowClose);if(panel)panel.classList.add("hidden");return;}
 const done=e.target.closest("[data-cashflow-realized]");if(done){done.disabled=true;try{await api("/api/project-cashflows",{method:"PATCH",body:JSON.stringify({id:done.dataset.cashflowRealized,status:"realized"})});const card=done.closest(".workspace-item"),button=card?.querySelector("[data-project-cashflow]");if(button)await openProjectCashflow(button.dataset.projectCashflow);}catch(err){alert(err.message);done.disabled=false;}return;}
 const remove=e.target.closest("[data-cashflow-delete]");if(remove){remove.disabled=true;try{await api("/api/project-cashflows",{method:"DELETE",body:JSON.stringify({id:remove.dataset.cashflowDelete})});const card=remove.closest(".workspace-item"),button=card?.querySelector("[data-project-cashflow]");if(button)await openProjectCashflow(button.dataset.projectCashflow);}catch(err){alert(err.message);remove.disabled=false;}}
});
$("workspace-projects").addEventListener("submit",async e=>{
 const form=e.target.closest("form[data-project-cashflow-form]");if(!form)return;e.preventDefault();const values=Object.fromEntries(new FormData(form));values.project_id=form.dataset.projectCashflowForm;const button=form.querySelector("button[type=submit]");button.disabled=true;
 try{await api("/api/project-cashflows",{method:"POST",body:JSON.stringify(values)});await openProjectCashflow(values.project_id);}catch(err){alert(err.message);button.disabled=false;}
});

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
  await loadWeeklyWorkload().catch(()=>{});
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
  renderWorkCapacitySettings();
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
      cells.push('<div class="calendar-hour-row"><span class="calendar-hour-label">'+pad2(hour)+':00</span><div class="calendar-hour-events">'+items.map(e=>e.is_sleep_session?'<span class="calendar-hour-event '+eventColors[e.event_type]+'">'+(e.start_at.slice(0,10)<calendarSelected?'↳ ':eventTime(e.start_at)+' ')+escapeHtml(e.title)+'</span>':'<button type="button" class="calendar-hour-event '+eventColors[e.event_type]+'" data-edit-event="'+e.id+'">'+(e.start_at.slice(0,10)<calendarSelected?'↳ ':eventTime(e.start_at)+' ')+escapeHtml(e.title)+'</button>').join("")+'</div></div>');
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
  $("calendar-events").innerHTML=dayEvents.length?dayEvents.map(e=>'<article class="calendar-event'+(e.is_sleep_session?' sleep-session':'')+'"><div class="calendar-event-time">'+eventTime(e.start_at)+'–'+eventTime(e.end_at)+'</div><div class="calendar-event-main"><b>'+escapeHtml(e.title)+'</b><small>'+eventTypes[e.event_type]+' · '+eventDuration(e)+(e.repeat_rule&&e.repeat_rule!=="none"?" · повторяется "+(e.repeat_rule==="daily"?"ежедневно":"еженедельно"):"")+(e.mode!=="none"?" · "+(e.mode==="online"?"онлайн":"офлайн"):"")+'</small>'+(e.location?'<small>'+escapeHtml(e.location)+'</small>':"")+(e.actual_start_at||e.actual_end_at?'<small>Факт: '+(eventTime(e.actual_start_at)||"—")+'–'+(eventTime(e.actual_end_at)||"—")+'</small>':"")+'</div><div class="calendar-event-actions"><button type="button" class="button ghost" data-edit-event="'+e.id+'">Изменить</button><button type="button" class="button ghost" data-delete-event="'+(e.series_id||e.id)+'">Удалить</button></div></article>').join(""):'<p class="muted">На этот день событий пока нет. Добавь встречи, дорогу, хобби или сон.</p>';
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
async function loadWeeklyWorkload(){
 const [data,targetData]=await Promise.all([api("/api/planner/week?focus_minutes="+encodeURIComponent(dailyBlockPreferences.focus)+"&break_minutes="+encodeURIComponent(dailyBlockPreferences.rest)+"&start_time="+encodeURIComponent(dailyBlockPreferences.start)+"&prep_before_minutes="+encodeURIComponent(dailyBlockPreferences.prep)+"&buffer_after_minutes="+encodeURIComponent(dailyBlockPreferences.after)),api("/api/planner/targets")]),week=data.week,s=week.summary;
 estimateAccuracyData=week.estimate_accuracy||null;renderHistoricalEstimateSuggestion();
 const dayNames=["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
 const summary=[["Ёмкость недели",week.configured?duration(s.gross_capacity_minutes):"не настроена"],["Занято календарём",week.configured?duration(s.calendar_busy_minutes):"—"],["Доступно для работы",week.configured?duration(s.available_minutes):"—"],["Задачи со сроком",s.tasks_with_deadline_count+" · "+duration(s.estimated_task_minutes)],["Фактически учтено",duration(week.actual_time?.tracked_minutes||0)+" · "+(week.actual_time?.sessions||0)+" сессий"],["Просрочено",s.overdue_task_count],["Без оценки",s.unestimated_task_count]];
 const metrics=summary.map(([label,value])=>'<article><span>'+label+'</span><b>'+value+'</b></article>').join("");
 const days=week.days.filter(d=>d.working_day).map(d=>{const date=new Date(d.date+"T12:00:00Z"),label=dayNames[date.getUTCDay()]+" · "+date.toLocaleDateString("ru-RU",{day:"numeric",month:"short"});return '<div class="weekly-day '+(d.overloaded?'overloaded':'')+'"><div><b>'+label+'</b><small>Календарь: '+duration(d.calendar_busy_minutes)+' · задачи: '+duration(d.planned_task_minutes)+'</small><small>'+d.tasks.map(t=>escapeHtml(t.title)+' (' +duration(t.minutes)+' · '+escapeHtml(t.priority_label||"Средний")+', '+escapeHtml(t.cognitive_load_label||"Умеренная концентрация")+')').join(' · ')+'</small></div><span>Доступно: '+duration(d.available_minutes)+'</span><span>Задач: '+d.task_count+'</span>'+(d.overloaded?'<strong>Перегрузка</strong>':'')+'</div>';}).join("");
 const warning=week.configured?(s.over_capacity?'<p class="weekly-warning">Оценённая работа со сроком превышает доступную недельную ёмкость на '+duration(Math.abs(s.remaining_minutes))+'. Нужно перенести сроки, пересмотреть объём или увеличить доступность — не пытаться вместить всё.</p>':'<p class="fine">Оценка учитывает выбранные рабочие дни и занятость календаря. Свободное время не считается автоматически обязательством работать.</p>'):'<p class="weekly-warning">Сначала сохрани рабочие дни и доступное время выше — тогда появится расчёт ёмкости и перегрузки.</p>';
 const existingTargets=new Map((targetData.targets||[]).map(t=>[t.direction_id?"d:"+t.direction_id:t.life_area_id?"a:"+t.life_area_id:"p:"+t.project_id,Number(t.target_minutes)/60]));
 const targetInput=(kind,item)=>{const key=(kind==="direction"?"d:":kind==="area"?"a:":"p:")+item.id,value=existingTargets.has(key)?String(existingTargets.get(key)):"";return '<label class="weekly-target-row"><span>'+escapeHtml(item.title)+'</span><input type="number" min="0" max="168" step="0.5" inputmode="decimal" data-target-kind="'+kind+'" data-target-id="'+escapeHtml(item.id)+'" value="'+value+'" placeholder="Не задано"><small>ч / нед.</small></label>';};
 const targetGroups='<div class="weekly-target-group"><h5>Доходные направления</h5>'+workspaceData.directions.map(d=>targetInput("direction",d)).join("")+'</div><div class="weekly-target-group"><h5>Собственные проекты</h5>'+workspaceData.projects.filter(p=>["active","waiting"].includes(p.status)).map(p=>targetInput("project",p)).join("")+'</div><div class="weekly-target-group"><h5>Личные области</h5>'+workspaceData.life_areas.map(a=>targetInput("area",a)).join("")+'</div>';
 const areaTotal=(week.area_balance||[]).reduce((sum,a)=>sum+a.estimated_minutes,0);
 const areaRows=(week.area_balance||[]).map(a=>{const pct=areaTotal?Math.round(a.estimated_minutes/areaTotal*100):0;const label=({personal:"Личная сфера",income:"Доходное направление",project:"Собственный проект",unassigned:"Без категории"})[a.type]||"Другое";const targetText=a.target_minutes===null?'Ориентир не задан':'План: '+duration(a.weekly_estimated_minutes)+' / '+duration(a.target_minutes)+' · '+(a.target_status==='above'?'выше ориентира':a.target_status==='below'?'ниже ориентира':'совпадает');const actualText='Факт по таймеру: '+duration(a.actual_minutes||0)+(a.actual_sessions?' · '+a.actual_sessions+' сессий':'')+(a.target_minutes===null?'': ' / '+duration(a.target_minutes)+' · '+((a.actual_target_gap_minutes||0)>0?'осталось '+duration(a.actual_target_gap_minutes):'ориентир выполнен'));return '<div class="balance-row"><div><b>'+escapeHtml(a.title)+'</b><small>'+label+' · '+a.task_count+' задач'+(a.unestimated_count?' · без оценки: '+a.unestimated_count:'')+'</small><small>'+targetText+'</small><small>'+actualText+'</small></div><strong>'+duration(a.estimated_minutes)+'</strong><div class="balance-track"><span style="width:'+pct+'%"></span></div><small>'+pct+'%</small></div>';}).join("");
 const priorityRows=(week.priority_overview||[]).map(task=>'<div class="balance-row"><div><b>'+escapeHtml(task.title)+'</b><small>'+escapeHtml(task.priority_label)+' · '+escapeHtml(task.cognitive_load_label)+'</small><small>'+(task.urgency_days===null?'Срок не задан':task.urgency_days<0?'Просрочена на '+Math.abs(task.urgency_days)+' дн.':task.urgency_days===0?'Срок сегодня':'До срока '+task.urgency_days+' дн.')+'</small></div><strong>'+task.priority_score+' балл.</strong></div>').join("");
 const priorityPanel='<section class="weekly-balance"><h4>Приоритет и нагрузка на внимание</h4><p class="fine">Предварительная сортировка: важность, близость дедлайна и слова в описании задачи. Метка концентрации — эвристика, её можно уточнить в самой задаче.</p>'+(priorityRows||'<p class="muted">Нет активных задач со сроком.</p>')+'</section>';
 const attentionScenarios=(week.attention_scenarios||[]).map(scenario=>'<article class="weekly-focus-card"><div><b>'+escapeHtml(scenario.title)+'</b><small>'+escapeHtml(scenario.description)+'</small></div>'+(scenario.days||[]).map(day=>'<div class="balance-row"><div><b>'+day.date+(day.overloaded?' · план выше ёмкости':'')+'</b><small>'+duration(day.planned_task_minutes)+' / '+duration(day.available_minutes)+'</small><ul>'+day.tasks.map(task=>'<li>'+escapeHtml(task.title)+' — '+duration(task.minutes)+' · '+escapeHtml(task.cognitive_load_label)+' · '+escapeHtml(task.priority_label)+'</li>').join('')+'</ul></div></div>').join('')+'</article>').join('');
 const attentionPanel='<section class="weekly-focus-scenarios"><h4>Варианты порядка задач по нагрузке на внимание</h4><p class="fine">Это альтернативы порядка выполнения уже распределённых задач. Они не бронируют часы, не меняют дедлайны и не перемещают события календаря. Выбери подходящий порядок вручную.</p>'+(attentionScenarios||'<p class="muted">Нет распределённых задач для построения вариантов.</p>')+'</section>';
 const rhythm=week.daily_rhythm||{},workRhythm=rhythm.work||{},sleepRhythm=rhythm.sleep||{};
 const rhythmPeriods=(workRhythm.by_period||[]).map(row=>'<div class="balance-row"><span>'+escapeHtml(row.period)+'</span><strong>'+row.sessions+' сесс. · '+duration(row.minutes)+'</strong></div>').join('');
 const rhythmPanel='<section class="weekly-balance"><h4>Фактический ритм дня · последние 90 дней</h4><p class="fine">Это время, когда чаще запускались таймеры задач, а не измерение эффективности или качества работы.</p><div class="balance-row"><div><b>Рабочие сессии</b><small>'+workRhythm.sample_sessions+' наблюдений · '+(workRhythm.confidence==="higher"?"достаточно для предварительной картины":workRhythm.confidence==="preliminary"?"пока предварительные данные":"пока недостаточно данных")+'</small></div><strong>'+duration(workRhythm.total_tracked_minutes||0)+'</strong></div><div class="balance-row"><span>Чаще всего фиксировалась работа</span><strong>'+escapeHtml(workRhythm.most_tracked_period||"Нет данных")+'</strong></div><div class="balance-row"><span>Медианное время старта</span><strong>'+escapeHtml(workRhythm.median_start_time||"—")+'</strong></div><div class="balance-row"><span>Средняя длительность сессии</span><strong>'+duration(workRhythm.average_session_minutes||0)+'</strong></div>'+rhythmPeriods+'<h5>Сон</h5><div class="balance-row"><div><b>Заполненные ночи</b><small>'+(sleepRhythm.confidence==="higher"?"Устойчивая выборка":sleepRhythm.confidence==="preliminary"?"Предварительная выборка":"Недостаточно записей для вывода")+'</small></div><strong>'+sleepRhythm.sample_sessions+'</strong></div><div class="balance-row"><span>Средняя продолжительность</span><strong>'+(sleepRhythm.average_duration_minutes===null?"—":duration(sleepRhythm.average_duration_minutes))+'</strong></div><div class="balance-row"><span>Среднее время засыпания</span><strong>'+escapeHtml(sleepRhythm.average_bedtime||"—")+'</strong></div><div class="balance-row"><span>Среднее время пробуждения</span><strong>'+escapeHtml(sleepRhythm.average_wake_time||"—")+'</strong></div><p class="fine">Данные не меняют расписание автоматически. Часовой пояс: '+escapeHtml(rhythm.timezone||"Europe/Moscow")+'.</p></section>';
 const recovery=week.recovery_insights||{},breakRule=recovery.break_rule||{};
 const recoveryPanel='<section class="weekly-balance"><h4>Перерывы и восстановление</h4><p class="fine">Анализ длительности завершённых таймер-сессий. Таймер может оставаться включённым во время отдыха, поэтому это ориентир, а не точное измерение непрерывной концентрации.</p><div class="balance-row"><div><b>Наблюдений</b><small>'+recovery.sample_sessions+' завершённых сессий · '+(recovery.confidence==="higher"?"более устойчивая выборка":recovery.confidence==="preliminary"?"предварительная выборка":"недостаточно данных")+'</small></div><strong>'+Number(recovery.long_session_share_percent||0)+'%</strong></div><div class="balance-row"><span>Медианная длительность</span><strong>'+duration(recovery.median_session_minutes||0)+'</strong></div><div class="balance-row"><span>Самая длинная сессия</span><strong>'+duration(recovery.longest_session_minutes||0)+'</strong></div><div class="balance-row"><span>Сессий от 90 минут</span><strong>'+Number(recovery.sessions_over_90_minutes||0)+'</strong></div><div class="balance-row"><span>Сессий от 2 часов</span><strong>'+Number(recovery.sessions_over_120_minutes||0)+'</strong></div><p>'+escapeHtml(recovery.guidance||"Пока нет данных для рекомендации.")+'</p><h5>Мягкая стартовая настройка перерывов</h5><p>После '+(breakRule.focus_minutes||50)+' минут фокус-блока — около '+(breakRule.break_minutes||10)+' минут отдыха. Можно начать с короткой паузы '+(breakRule.optional_short_break_minutes||5)+' минут.</p><p class="fine">Это необязательная подсказка. Система не создаёт события и не переставляет календарь. '+escapeHtml(recovery.timezone||"")+'</p></section>';
 const dailyBlockScenarios=week.daily_block_scenarios||[];
 const blockPlanCards=renderDailyBlockScenarios(dailyBlockScenarios,dailyBlockPreferences.variant);
 const blockPlanPanel='<section class="weekly-focus-scenarios"><h4>Рабочие блоки и перерывы по времени</h4><div class="voice-task-fields"><label>Начало рабочего дня<input type="time" id="daily-block-start" value="'+escapeHtml(dailyBlockPreferences.start)+'"></label><label>Фокус, минут<input type="number" id="daily-block-focus" min="15" max="120" step="5" value="'+dailyBlockPreferences.focus+'"></label><label>Перерыв, минут<input type="number" id="daily-block-rest" min="3" max="30" step="1" value="'+dailyBlockPreferences.rest+'"></label><label>Подготовка до встреч, минут<input type="number" id="daily-block-prep" min="0" max="120" step="5" value="'+dailyBlockPreferences.prep+'"></label><label>Буфер после встреч, минут<input type="number" id="daily-block-after" min="0" max="120" step="5" value="'+dailyBlockPreferences.after+'"></label></div><p class="fine">Настройки сохраняются в этом браузере. Буфер подготовки расширяет занятое время до встречи, буфер после — после её окончания. Они применяются к встречам, поездкам и другим занятым событиям, кроме сна и событий типа «Работа». Это резерв времени, а не расчёт маршрута. Календарь не меняется; переносы задач возможны только после подтверждения.</p>'+(blockPlanCards||'<p class="muted">Нет задач с оценкой времени для черновика блоков.</p>')+renderDailyReallocationProposals(week.daily_reallocation_proposals)+'</section>';
 const accuracy=week.estimate_accuracy||{},overall=accuracy.overall||{},accuracyRows=(accuracy.by_area||[]).map(row=>'<div class="balance-row"><div><b>'+escapeHtml(row.title)+'</b><small>'+row.sample_count+' завершённых задач · медианная ошибка '+(row.median_error_percent===null?'нет данных':row.median_error_percent+'%')+'</small></div><strong>'+(row.recommended_estimate_multiplier===null?'Пока мало данных':'×'+row.recommended_estimate_multiplier)+'</strong></div>').join("");
 const accuracyPanel='<section class="weekly-balance"><h4>Точность оценок задач</h4><p class="fine">История завершённых задач за последние 90 дней. Множитель — подсказка для будущих оценок, существующие оценки не меняются.</p><div class="weekly-metrics"><article><span>Завершённых задач в выборке</span><b>'+overall.sample_count+'</b></article><article><span>Медианная ошибка оценки</span><b>'+(overall.median_error_percent===null?'—':overall.median_error_percent+'%')+'</b></article><article><span>Поправка к будущим оценкам</span><b>'+(overall.recommended_estimate_multiplier===null?'Недостаточно данных':'×'+overall.recommended_estimate_multiplier)+'</b></article></div>'+(accuracyRows||'<p class="muted">Пока недостаточно завершённых задач с оценкой и фактическим временем. Нужно не менее трёх наблюдений для рекомендации.</p>')+'</section>';
 const calibrated=week.calibrated_load||{},calibratedSummary=calibrated.summary||{},calibratedDays=(calibrated.days||[]).map(day=>'<div class="balance-calendar-row"><span>'+day.date+(day.calibrated_overloaded?' · перегрузка':'')+'</span><b>'+duration(day.calibrated_task_minutes||0)+' / '+duration(day.available_minutes||0)+'</b></div>').join("");
 const calibratedPanel='<section class="weekly-balance"><h4>Прогноз нагрузки с учётом фактической скорости</h4><p class="fine">'+escapeHtml(calibrated.note||"Сценарий по истории завершённых задач.")+'</p><div class="weekly-metrics"><article><span>Скорректированная нагрузка</span><b>'+duration(calibratedSummary.calibrated_task_minutes||0)+'</b></article><article><span>Доступное время</span><b>'+duration(calibratedSummary.available_minutes||0)+'</b></article><article><span>Перегрузка</span><b>'+duration(calibratedSummary.over_capacity_minutes||0)+'</b></article></div><p class="fine">Дни с прогнозируемой перегрузкой: '+(calibratedSummary.overloaded_days||0)+' · скорректированных распределений: '+(calibratedSummary.adjusted_task_allocations||0)+'</p>'+(calibratedDays||'<p class="muted">Нет распределённых задач.</p>')+'</section>';
 const calendarTotal=(week.calendar_balance||[]).reduce((sum,a)=>sum+a.minutes,0);
 const calendarRows=(week.calendar_balance||[]).map(a=>'<div class="balance-calendar-row"><span>'+escapeHtml(a.title)+' · '+a.count+'</span><b>'+duration(a.minutes)+'</b><small>'+(calendarTotal?Math.round(a.minutes/calendarTotal*100):0)+'%</small></div>').join("");
 $("weekly-workload").innerHTML='<div class="section-head"><div><h3>Полная рабочая неделя</h3><p class="fine">'+week.from+' — '+week.to+'</p></div><button type="button" class="button ghost" id="refresh-weekly-workload">Обновить</button></div><div class="weekly-metrics">'+metrics+'</div>'+warning+'<section class="weekly-balance"><h4>Распределение задач по сферам</h4><p class="fine">План — оставшаяся оценка активных задач со сроком; факт — завершённые сессии таймера за неделю. Сессия относится к дню её запуска.</p>'+ (areaRows||'<p class="muted">Нет активных задач по сферам.</p>') +'</section>'+priorityPanel+attentionPanel+rhythmPanel+recoveryPanel+blockPlanPanel+accuracyPanel+calibratedPanel+'<section class="weekly-balance"><h4>Календарные обязательства</h4><p class="fine">Длительность запланированных событий за неделю.</p>'+ (calendarRows||'<p class="muted">Нет календарных событий.</p>') +'</section><div class="weekly-days">'+(days||"")+'</div><section class="weekly-adjustments"><h4>Предложения по разгрузке недели</h4><p class="fine">Это предварительные варианты: сроки и задачи не меняются без отдельного подтверждения.</p>'+(week.adjustment_proposals?.moves?.length?week.adjustment_proposals.moves.map(move=>'<div class="weekly-adjustment"><div><b>'+escapeHtml(move.title)+'</b><small>'+escapeHtml(move.reason)+'</small></div><span>'+move.from+' → '+move.to+'</span><strong>'+duration(move.minutes)+'</strong></div>').join(""):'<p class="muted">Нет безопасных переносов в пределах текущих дедлайнов и свободной ёмкости.</p>')+(week.adjustment_proposals?.unresolved_overload_minutes?'<p class="weekly-warning">После возможных переносов останется перегрузка: '+duration(week.adjustment_proposals.unresolved_overload_minutes)+'. Потребуется пересмотреть объём или сроки.</p>':'')+'</section><section class="weekly-adjustments"><h4>Переносы с учётом фактической скорости</h4><p class="fine">Эти предложения учитывают историческую поправку к оценкам. Высокий приоритет не переносится; дедлайн не нарушается. Ничего не меняется без отдельного действия.</p>'+(week.calibrated_adjustment_proposals?.moves?.length?week.calibrated_adjustment_proposals.moves.map(move=>'<div class="weekly-adjustment"><div><b>'+escapeHtml(move.title)+'</b><small>'+escapeHtml(move.reason)+'</small></div><span>'+move.from+' → '+move.to+'</span><strong>'+duration(move.minutes)+'</strong></div>').join(""):'<p class="muted">По скорректированным оценкам безопасных переносов не найдено.</p>')+(week.calibrated_adjustment_proposals?.unresolved_overload_minutes?'<p class="weekly-warning">Даже после предложенных переносов останется перегрузка: '+duration(week.calibrated_adjustment_proposals.unresolved_overload_minutes)+'.</p>':'')+'</section><section class="weekly-focus-scenarios"><h4>Варианты фокуса на неделю</h4><p class="fine">Это три способа расставить приоритеты между уже существующими задачами. Они не меняют сроки и не добавляют часы к доступной ёмкости.</p>'+(week.focus_scenarios||[]).map(scenario=>'<article class="weekly-focus-card"><div><b>'+escapeHtml(scenario.title)+'</b><small>'+escapeHtml(scenario.description)+'</small></div><div class="weekly-focus-metrics"><span>Задачи: '+duration(scenario.estimated_task_minutes)+'</span><span>Доступно: '+duration(scenario.available_minutes)+'</span>'+(scenario.over_capacity_minutes?'<strong>Перегрузка: '+duration(scenario.over_capacity_minutes)+'</strong>':'<strong>Свободно: '+duration(scenario.remaining_capacity_minutes)+'</strong>')+'</div>'+(scenario.focus.length?'<ul>'+scenario.focus.map(row=>'<li>'+escapeHtml(row.title)+' — '+duration(row.minutes)+(row.target_minutes===null?'':' · ориентир '+duration(row.target_minutes))+'</li>').join('')+'</ul>':'<small class="muted">Пока нет задач или ориентиров для этого сценария.</small>')+'</article>').join('')+'</section><div class="weekly-backlog"><span>Без срока: <b>'+s.without_deadline_count+'</b></span><span>В ожидании: <b>'+s.waiting_task_count+'</b></span><span>Оценённые задачи со сроком: <b>'+s.estimated_task_count+'</b></span></div><small class="fine">Предварительная раскладка по срокам, а не автоматическое бронирование календаря. Задачи без срока и ожидающие ответа не распределяются.</small>';
 $("weekly-targets").innerHTML='<div class="section-head"><div><h4>Желаемое распределение времени</h4><p class="fine">Укажи ориентиры в часах на неделю. Показываем отдельно план оставшихся задач и факт завершённых сессий таймера за неделю. Факт не выводится из оценки задачи и не включает незавершённую сессию. Если задан ориентир проекта, его задачи учитываются в проекте, а не повторно в направлении или личной области. Пустое поле означает, что цель не задана; 0 — сознательно не выделять время.</p></div></div>'+targetGroups+'<div class="weekly-target-actions"><button type="button" class="button ghost" id="save-weekly-targets">Сохранить ориентиры</button><span id="weekly-target-status" class="fine" aria-live="polite"></span></div>';
 $("save-weekly-targets").addEventListener("click",async()=>{
  const button=$("save-weekly-targets"),targets=[...document.querySelectorAll("[data-target-kind]")].filter(input=>input.value.trim()!=="").map(input=>({direction_id:input.dataset.targetKind==="direction"?input.dataset.targetId:null,life_area_id:input.dataset.targetKind==="area"?input.dataset.targetId:null,project_id:input.dataset.targetKind==="project"?input.dataset.targetId:null,target_minutes:Math.round(Number(input.value)*60)}));
  if([...document.querySelectorAll("[data-target-kind]")].some(input=>input.value.trim()!==""&&(!Number.isFinite(Number(input.value))||Number(input.value)<0||Number(input.value)>168))){$("weekly-target-status").textContent="Для каждой сферы укажи от 0 до 168 часов.";return;}
  button.disabled=true;try{await api("/api/planner/targets",{method:"PUT",body:JSON.stringify({targets})});$("weekly-target-status").textContent="Ориентиры сохранены.";await loadWeeklyWorkload();}catch(err){$("weekly-target-status").textContent=err.message;}finally{button.disabled=false;}
 });
 $("refresh-weekly-workload").addEventListener("click",async()=>{const button=$("refresh-weekly-workload");button.disabled=true;try{await loadWeeklyWorkload();}catch(err){alert(err.message);}});
}
function renderWorkCapacitySettings() {
  const days=Array.isArray(userSettings.working_days)?userSettings.working_days:[];
  document.querySelectorAll("[data-workday]").forEach(el=>{el.checked=days.includes(Number(el.dataset.workday));});
  if(userSettings.daily_capacity_minutes)$("weekly-capacity").value=String(userSettings.daily_capacity_minutes);
  $("work-capacity-status").textContent=userSettings.work_capacity_configured?"График сохранён. В оценке учитываются календарные события, кроме сна и рабочих блоков.":"График ещё не настроен — оценка перегрузки отключена.";
}
$("save-work-capacity").addEventListener("click",async()=>{
  const button=$("save-work-capacity"),days=[...document.querySelectorAll("[data-workday]:checked")].map(el=>Number(el.dataset.workday));
  if(!days.length){$("work-capacity-status").textContent="Выбери хотя бы один рабочий день.";return;}
  button.disabled=true;button.textContent="Сохраняю…";
  try{
    await api("/api/settings",{method:"PUT",body:JSON.stringify({monthly_target:userSettings.monthly_target||300000,timezone:userSettings.timezone||"Europe/Moscow",daily_capacity_minutes:Number($("weekly-capacity").value),working_days:days})});
    const {settings}=await api("/api/settings");userSettings=settings||userSettings;renderWorkCapacitySettings();await loadWorkspace();await loadWeeklyWorkload();
    $("work-capacity-status").textContent="Рабочий график сохранён.";
  }catch(err){$("work-capacity-status").textContent=err.message;}
  finally{button.disabled=false;button.textContent="Сохранить рабочий график";}
});
$("make-day-plan").addEventListener("click", async () => {
  const button = $("make-day-plan");
  button.disabled = true; button.textContent = "Составляю план…";
  try {
    const capacity = Number($("planner-capacity").value);
    await api("/api/settings", { method:"PUT", body:JSON.stringify({ monthly_target:userSettings.monthly_target || 300000, timezone:userSettings.timezone || "Europe/Moscow", daily_capacity_minutes:capacity }) });
    const data = await api("/api/planner/day", { method:"POST", body:JSON.stringify({ available_minutes:capacity }) });
    currentDayPlan = data.plan; $("planner-date").textContent = data.date; renderDayPlan(); await loadWeeklyWorkload();
  } catch (err) { alert(err.message); }
  finally { button.disabled = false; button.textContent = "Сформировать план дня с ИИ"; }
});

let charityData={projects:[],people:[],transactions:[]};
async function loadCharity(){
 charityData=await api("/api/charity");
 const s=charityData.summary;
 $("charity-summary").innerHTML=[["Активные проекты",s.active_projects],["Пожертвования и сборы",money(s.donations)],["Расходы на помощь",money(s.expenses)],["Остаток средств по учёту",money(s.net)]].map(x=>'<article><span>'+x[0]+'</span><b>'+x[1]+'</b></article>').join("");
 const projectOptions='<option value="">Выбрать проект</option>'+charityData.projects.filter(p=>p.status==="active"||p.status==="paused").map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.title)+'</option>').join("");
 $("charity-transaction-project").innerHTML=projectOptions;
 $("charity-person-project").innerHTML='<option value="">Общий контакт</option>'+charityData.projects.map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.title)+'</option>').join("");
 $("charity-projects").innerHTML=charityData.projects.length?charityData.projects.map(p=>{const raised=Number(p.donations),spent=Number(p.expenses),target=Number(p.target_amount),pct=target?Math.min(100,Math.round(raised/target*100)):0;return '<article class="workspace-item"><b>'+escapeHtml(p.title)+'</b><small>'+escapeHtml(p.organization||"Организация не указана")+' · '+({active:"Активен",paused:"Пауза",completed:"Завершён",archived:"Архив"})[p.status]+'</small><small>Собрано '+money(raised)+(target?' из '+money(target)+' ('+pct+'%)':'')+' · расходы '+money(spent)+' · остаток '+money(raised-spent)+'</small>'+(target?'<div class="progress"><span style="width:'+pct+'%"></span></div>':'')+'<label class="charity-status">Статус<select data-charity-status="'+escapeHtml(p.id)+'"><option value="active" '+(p.status==="active"?"selected":"")+'>Активен</option><option value="paused" '+(p.status==="paused"?"selected":"")+'>Пауза</option><option value="completed" '+(p.status==="completed"?"selected":"")+'>Завершён</option><option value="archived" '+(p.status==="archived"?"selected":"")+'>Архив</option></select></label></article>'}).join(""):'<p class="muted">Пока нет благотворительных проектов.</p>';
 $("charity-transactions").innerHTML=charityData.transactions.length?charityData.transactions.slice(0,30).map(t=>'<article class="finance-row"><div><b>'+escapeHtml(t.title)+'</b><small>'+escapeHtml(t.project_title)+' · '+t.occurred_on+' · '+(t.type==="donation"?"Пожертвование":"Расход")+(t.category?' · '+escapeHtml(t.category):'')+'</small></div><strong>'+ (t.type==="donation"?"+":"−")+money(t.amount)+'</strong><button type="button" class="button ghost" data-charity-delete-transaction="'+escapeHtml(t.id)+'">×</button></article>').join(""):'<p class="muted">Операций пока нет.</p>';
 $("charity-people").innerHTML=charityData.people.length?charityData.people.map(p=>'<article class="workspace-item"><b>'+escapeHtml(p.name)+'</b><small>'+({partner:"Партнёр",volunteer:"Волонтёр",supporter:"Сторонник / жертвователь"})[p.role]+' · '+escapeHtml(p.project_title||"Общий контакт")+'</small>'+(p.contact?'<small>'+escapeHtml(p.contact)+'</small>':'')+'<button type="button" class="button ghost" data-charity-delete-person="'+escapeHtml(p.id)+'">Удалить</button></article>').join(""):'<p class="muted">Контакты пока не добавлены.</p>';
 $("charity-transaction-date").value=financeData?.today||localToday;
}
$("charity-project-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/charity",{method:"POST",body:JSON.stringify({type:"project",title:$("charity-project-title").value,organization:$("charity-project-organization").value,purpose:$("charity-project-purpose").value,target_amount:$("charity-project-target").value,start_date:$("charity-project-start").value||null,end_date:$("charity-project-end").value||null})});e.target.reset();await loadCharity();}catch(err){alert(err.message);}});
$("charity-transaction-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/charity",{method:"POST",body:JSON.stringify({type:"transaction",project_id:$("charity-transaction-project").value,transaction_type:$("charity-transaction-type").value,title:$("charity-transaction-title").value,category:$("charity-transaction-category").value,amount:$("charity-transaction-amount").value,occurred_on:$("charity-transaction-date").value,note:$("charity-transaction-note").value})});e.target.reset();await loadCharity();}catch(err){alert(err.message);}});
$("charity-person-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/charity",{method:"POST",body:JSON.stringify({type:"person",name:$("charity-person-name").value,role:$("charity-person-role").value,project_id:$("charity-person-project").value||null,contact:$("charity-person-contact").value,notes:$("charity-person-notes").value})});e.target.reset();await loadCharity();}catch(err){alert(err.message);}});
$("charity-projects").addEventListener("change",async e=>{const select=e.target.closest("[data-charity-status]");if(!select)return;try{await api("/api/charity",{method:"PATCH",body:JSON.stringify({type:"project",id:select.dataset.charityStatus,status:select.value})});await loadCharity();}catch(err){alert(err.message);}});
$("charity-transactions").addEventListener("click",async e=>{const b=e.target.closest("[data-charity-delete-transaction]");if(!b)return;if(!confirm("Удалить эту благотворительную операцию?"))return;try{await api("/api/charity",{method:"DELETE",body:JSON.stringify({type:"transaction",id:b.dataset.charityDeleteTransaction})});await loadCharity();}catch(err){alert(err.message);}});
$("charity-people").addEventListener("click",async e=>{const b=e.target.closest("[data-charity-delete-person]");if(!b)return;if(!confirm("Удалить этот контакт?"))return;try{await api("/api/charity",{method:"DELETE",body:JSON.stringify({type:"person",id:b.dataset.charityDeletePerson})});await loadCharity();}catch(err){alert(err.message);}});

let dreamsData={dreams:[],goals:[]};
const dreamCategoryNames={home:"Дом и недвижимость",travel:"Путешествия",business:"Бизнес и проекты",health:"Здоровье",learning:"Обучение",experience:"Впечатления",help:"Помощь другим",purchase:"Покупки",other:"Другое"};
function dreamDateLabel(v){return v?new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"short",year:"numeric"}).format(new Date(v+"T12:00:00")):"Срок пока не задан";}
async function loadDreams(){
 dreamsData=await api("/api/dreams");
 $("dreams-list").innerHTML=dreamsData.dreams.length?dreamsData.dreams.map(d=>'<article class="dream-card">'+(d.image_url?'<img src="'+escapeHtml(d.image_url)+'" alt="" loading="lazy">':'')+'<div class="dream-card-body"><div class="dream-card-meta">'+dreamCategoryNames[d.category]+' · '+({high:"Очень хочется",medium:"Важно",low:"Когда-нибудь"})[d.priority]+'</div><b>'+escapeHtml(d.title)+'</b>'+(d.description?'<p>'+escapeHtml(d.description)+'</p>':'')+(d.reason?'<small>Почему важно: '+escapeHtml(d.reason)+'</small>':'')+'<div class="dream-card-meta">'+(d.estimated_cost!==null?'Оценка: '+money(d.estimated_cost):'Стоимость не определена')+' · '+dreamDateLabel(d.desired_date)+'</div>'+(d.reference_url?'<a href="'+escapeHtml(d.reference_url)+'" target="_blank" rel="noopener noreferrer">Открыть ссылку</a>':'')+'<div class="dream-card-actions">'+(d.status==="converted"?'<span class="status-pill">Цель создана</span>':'<button type="button" class="button primary" data-dream-convert="'+escapeHtml(d.id)+'">Превратить в цель</button>')+'<select data-dream-status="'+escapeHtml(d.id)+'" '+(d.status==="converted"?"disabled":"")+'><option value="dream" '+(d.status==="dream"?"selected":"")+'>Мечта</option><option value="considering" '+(d.status==="considering"?"selected":"")+'>Обдумываю</option><option value="paused" '+(d.status==="paused"?"selected":"")+'>Отложена</option><option value="completed" '+(d.status==="completed"?"selected":"")+'>Исполнена</option></select><button type="button" class="button ghost" data-dream-delete="'+escapeHtml(d.id)+'">Удалить</button></div></div></article>').join(""):'<p class="muted">Здесь будут мечты — большие и маленькие. Необязательно сразу знать их стоимость.</p>';
 $("financial-goals-list").innerHTML=dreamsData.goals.length?dreamsData.goals.map(g=>{const pct=Math.min(100,Math.round(Number(g.saved_amount)/Number(g.target_amount)*100));const months=g.monthly_contribution>0?Math.ceil(Math.max(0,g.target_amount-g.saved_amount)/g.monthly_contribution):null;return '<article class="dream-goal-card"><div class="dream-card-meta">Приоритет: '+({high:"высокий",medium:"средний",low:"низкий"})[g.priority]+'</div><b>'+escapeHtml(g.title)+'</b><strong>'+money(g.saved_amount)+' из '+money(g.target_amount)+'</strong><div class="progress"><span style="width:'+pct+'%"></span></div><small>Взнос: '+money(g.monthly_contribution)+' в месяц · '+(g.target_date?'срок '+dreamDateLabel(g.target_date):months!==null?'при таком взносе примерно '+months+' мес.':'срок не рассчитан')+'</small><button type="button" class="button ghost" data-goal-plan="'+escapeHtml(g.id)+'">Оценить достижимость</button><div id="goal-plan-'+escapeHtml(g.id)+'" class="goal-plan-result"></div><label class="dream-goal-status">Статус<select data-goal-status="'+escapeHtml(g.id)+'"><option value="active" '+(g.status==="active"?"selected":"")+'>Активна</option><option value="paused" '+(g.status==="paused"?"selected":"")+'>Пауза</option><option value="completed" '+(g.status==="completed"?"selected":"")+'>Достигнута</option><option value="archived" '+(g.status==="archived"?"selected":"")+'>Архив</option></select></label></article>'}).join(""):'<p class="muted">Пока нет финансовых целей. Можно создать их из мечты.</p>';
}
$("dream-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/dreams",{method:"POST",body:JSON.stringify({action:"dream",title:$("dream-title").value,category:$("dream-category").value,estimated_cost:$("dream-cost").value,desired_date:$("dream-date").value||null,priority:$("dream-priority").value,image_url:$("dream-image").value,reference_url:$("dream-link").value,description:$("dream-description").value,reason:$("dream-reason").value})});e.target.reset();await loadDreams();}catch(err){alert(err.message);}});
$("dreams-list").addEventListener("click",async e=>{
 const convert=e.target.closest("[data-dream-convert]"),del=e.target.closest("[data-dream-delete]");
 if(del){if(!confirm("Удалить эту мечту?"))return;try{await api("/api/dreams",{method:"DELETE",body:JSON.stringify({type:"dream",id:del.dataset.dreamDelete})});await loadDreams();}catch(err){alert(err.message);}return;}
 if(convert){const d=dreamsData.dreams.find(x=>x.id===convert.dataset.dreamConvert);if(!d)return;const suggested=Number(d.estimated_cost)||0;const amountInput=prompt("Целевая сумма в рублях:",suggested?String(suggested):"");if(amountInput===null)return;const target=Number(amountInput);if(!Number.isFinite(target)||target<=0){alert("Укажи положительную целевую сумму.");return;}const monthlyInput=prompt("Сколько планируешь откладывать в месяц?","0");if(monthlyInput===null)return;const monthly=Number(monthlyInput);if(!Number.isFinite(monthly)||monthly<0){alert("Проверь ежемесячный взнос.");return;}const date=prompt("Желаемая дата достижения (ГГГГ-ММ-ДД), можно оставить пустой:",d.desired_date||"");if(date===null)return;try{await api("/api/dreams",{method:"POST",body:JSON.stringify({action:"goal",dream_id:d.id,title:d.title,description:d.description,target_amount:target,monthly_contribution:monthly,target_date:date||null,priority:d.priority})});await loadDreams();}catch(err){alert(err.message);}}
});
$("dreams-list").addEventListener("change",async e=>{const s=e.target.closest("[data-dream-status]");if(!s)return;try{await api("/api/dreams",{method:"PATCH",body:JSON.stringify({type:"dream",id:s.dataset.dreamStatus,status:s.value})});await loadDreams();}catch(err){alert(err.message);}});
$("financial-goals-list").addEventListener("click",async e=>{const b=e.target.closest("[data-goal-plan]");if(!b)return;const id=b.dataset.goalPlan,slot=$("goal-plan-"+id);b.disabled=true;b.textContent="Рассчитываю…";try{const result=await api("/api/dreams/plan",{method:"POST",body:JSON.stringify({goal_id:id})});const c=result.calculation;slot.innerHTML='<div class="goal-plan-box"><b>Предварительная оценка достижимости</b><p>Средний остаток после расходов и выплат: '+(c.average_monthly_surplus===null?'недостаточно данных':money(c.average_monthly_surplus))+' в месяц</p><p>Расходы по бюджету и истории: '+money(result.expense_basis.monthly_forecast)+' в месяц</p><small>Категорий по бюджету: '+result.expense_basis.budgeted_categories+' · по истории: '+result.expense_basis.history_categories+'</small><p>Другие активные цели: '+money(c.active_goal_contributions)+' в месяц</p><p>Осторожный доступный взнос: '+(c.safe_monthly_contribution===null?'пока нельзя рассчитать':money(c.safe_monthly_contribution))+' в месяц</p>'+(c.required_monthly_contribution!==null?'<p>Для выбранного срока нужно: '+money(c.required_monthly_contribution)+' в месяц</p>':'')+(c.estimated_months!==null?'<p>При осторожном взносе ориентир: '+c.estimated_months+' мес.</p>':'')+'<b>'+(c.feasible===true?'Выбранный срок выглядит достижимым по зарегистрированной истории.':c.feasible===false?'Выбранный срок слишком напряжённый по текущей истории.':'Для надёжной оценки нужны записи о доходах за период.')+'</b><small>'+escapeHtml(result.disclaimer)+'</small></div>';}catch(err){slot.textContent=err.message;}finally{b.disabled=false;b.textContent="Обновить оценку";}});
$("financial-goals-list").addEventListener("change",async e=>{const s=e.target.closest("[data-goal-status]");if(!s)return;try{await api("/api/dreams",{method:"PATCH",body:JSON.stringify({type:"goal",id:s.dataset.goalStatus,status:s.value})});await loadDreams();}catch(err){alert(err.message);}});

let sleepSessions=[];
let sleepTargetMinutes=null;
function sleepLocalDate(){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:userSettings.timezone||"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));return v.year+"-"+v.month+"-"+v.day;
}
function sleepWallTimeEpoch(value,timezone){
 if(!value||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(value))return null;
 const [date,time]=value.split("T"),[year,month,day]=date.split("-").map(Number),[hour,minute]=time.split(":").map(Number);
 const target=Date.UTC(year,month-1,day,hour,minute),normalized=new Date(target);
 if(normalized.getUTCFullYear()!==year||normalized.getUTCMonth()!==month-1||normalized.getUTCDate()!==day||hour>23||minute>59)return null;
 const partsAt=epoch=>Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(epoch)).map(p=>[p.type,p.value]));
 const offsets=new Set();
 for(let delta=-2160;delta<=2160;delta+=180){const sample=target+delta*60000,p=partsAt(sample);offsets.add(Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-Math.floor(sample/60000)*60000);}
 const matches=new Set();
 for(const offset of offsets){const candidate=target-offset,p=partsAt(candidate);if(+p.year===year&&+p.month===month&&+p.day===day&&+p.hour===hour&&+p.minute===minute)matches.add(candidate);}
 return matches.size===1?[...matches][0]:null;
}
function sleepDuration(start,end,startTimezone="Europe/Moscow",endTimezone=startTimezone){
 if(!start||!end)return null;
 try{const a=sleepWallTimeEpoch(start,startTimezone),b=sleepWallTimeEpoch(end,endTimezone);return a!==null&&b!==null&&b>a?Math.round((b-a)/60000):null;}catch{return null;}
}
function averageSleepMinutes(sessions,days){
 const today=sleepLocalDate(),start=shiftDate(today,-(days-1));
 // sleep_date is a local calendar date in the session's stored timezone.
 // Compare date-only ISO strings; do not reinterpret them as UTC instants.
 const period=sessions.filter(s=>s.sleep_date>=start&&s.sleep_date<=today);
 const values=period.map(s=>sleepDuration(s.fell_asleep_at,s.woke_at,s.asleep_timezone||s.timezone,s.wake_timezone||s.timezone)).filter(v=>v!==null);
 return {minutes:values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null,count:values.length,incompleteCount:period.length-values.length};
}
function averageSleepClock(sessions,days,timeField){
 const today=sleepLocalDate(),start=shiftDate(today,-(days-1));
 const records=sessions.filter(s=>s.sleep_date>=start&&s.sleep_date<=today&&s[timeField]);
 const minutes=records.map(s=>{const value=s[timeField];if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return null;const [h,m]=value.slice(11).split(":").map(Number);return h<24&&m<60?h*60+m:null;}).filter(v=>v!==null);
 if(!minutes.length)return {time:null,count:0,variation:null};
 const angles=minutes.map(v=>v/1440*2*Math.PI),x=angles.reduce((a,b)=>a+Math.cos(b),0),y=angles.reduce((a,b)=>a+Math.sin(b),0);
 if(Math.hypot(x,y)<1e-8)return {time:null,count:minutes.length,variation:null};
 const mean=((Math.atan2(y,x)/(2*Math.PI)*1440)%1440+1440)%1440;
 const distances=minutes.map(v=>{const d=Math.abs(v-mean);return Math.min(d,1440-d);});
 return {time:Math.round(mean)%1440,count:minutes.length,variation:Math.round(distances.reduce((a,b)=>a+b,0)/distances.length)};
}
function sleepDurationVariability(sessions,days){
 const today=sleepLocalDate(),start=shiftDate(today,-(days-1));
 const values=sessions.filter(s=>s.sleep_date>=start&&s.sleep_date<=today).map(s=>sleepDuration(s.fell_asleep_at,s.woke_at,s.asleep_timezone||s.timezone,s.wake_timezone||s.timezone)).filter(v=>v!==null);
 if(values.length<2)return {minutes:null,count:values.length};
 const mean=values.reduce((a,b)=>a+b,0)/values.length;
 return {minutes:Math.round(Math.sqrt(values.reduce((sum,v)=>sum+(v-mean)**2,0)/values.length)),count:values.length};
}
function sleepClockLabel(minutes){
 if(minutes===null)return "Недостаточно данных";
 const value=((minutes%1440)+1440)%1440;
 return String(Math.floor(value/60)).padStart(2,"0")+":"+String(value%60).padStart(2,"0");
}
function sleepGoalComparison(sessions,days,targetMinutes){
 if(!Number.isInteger(targetMinutes)||targetMinutes<180||targetMinutes>720||targetMinutes%15!==0)return {target:null,average:null,delta:null,count:0,below:0,atOrAbove:0};
 const today=sleepLocalDate(),start=shiftDate(today,-(days-1));
 const values=sessions.filter(s=>s.sleep_date>=start&&s.sleep_date<=today).map(s=>sleepDuration(s.fell_asleep_at,s.woke_at,s.asleep_timezone||s.timezone,s.wake_timezone||s.timezone)).filter(v=>v!==null);
 if(!values.length)return {target:targetMinutes,average:null,delta:null,count:0,below:0,atOrAbove:0};
 const average=Math.round(values.reduce((a,b)=>a+b,0)/values.length);
 return {target:targetMinutes,average,delta:average-targetMinutes,count:values.length,below:values.filter(v=>v<targetMinutes).length,atOrAbove:values.filter(v=>v>=targetMinutes).length};
}
function sleepDurationLabel(minutes){
 if(minutes===null)return "Недостаточно данных";
 const h=Math.floor(minutes/60),m=minutes%60;return h+" ч"+(m?" "+m+" мин":"");
}
function renderSleepDurationChart(sessions,days=30){
 const today=sleepLocalDate(),start=shiftDate(today,-(days-1));
 const byDate=new Map();
 sessions.filter(s=>s.sleep_date>=start&&s.sleep_date<=today).forEach(s=>{
  const minutes=sleepDuration(s.fell_asleep_at,s.woke_at,s.asleep_timezone||s.timezone,s.wake_timezone||s.timezone);
  if(minutes!==null)byDate.set(s.sleep_date,minutes);
 });
 const entries=Array.from({length:days},(_,i)=>{
  const date=shiftDate(start,i),minutes=byDate.has(date)?byDate.get(date):null;
  const height=minutes===null?0:Math.max(2,Math.min(720,minutes)/720*100);
  const label=minutes===null?"Нет полной записи":sleepDurationLabel(minutes);
  return '<div class="sleep-chart-day" title="'+escapeHtml(date+' · '+label)+'"><div class="sleep-chart-track">'+(minutes===null?'<span class="sleep-chart-missing"></span>':'<span class="sleep-chart-bar" style="height:'+height.toFixed(1)+'%"></span>')+'</div><small>'+escapeHtml(date.slice(8,10))+'</small></div>';
 }).join("");
 const count=byDate.size;
 return '<section class="sleep-chart-card"><div class="sleep-chart-heading"><div><strong>Продолжительность сна · 30 дней</strong><p class="fine">'+count+' полных ночей из '+days+' календарных дней</p></div></div><div class="sleep-chart-wrap"><div class="sleep-chart-axis"><span>12 ч</span><span>6 ч</span><span>0</span></div><div class="sleep-chart-grid">'+entries+'</div></div><p class="fine">Каждый столбец — отдельная ночь. Пустое место означает, что нет полной записи; это не нулевой сон. Столбцы выше 12 часов визуально ограничены, точное значение видно при наведении.</p></section>';
}
function renderSleep(){
 const periods=[{label:"7 дней",days:7},{label:"30 дней",days:30}];
 const cards=periods.map(({label,days})=>{
  const duration=averageSleepMinutes(sleepSessions,days);
  const asleep=averageSleepClock(sleepSessions,days,"fell_asleep_at");
  const wake=averageSleepClock(sleepSessions,days,"woke_at");
  const durationSpread=sleepDurationVariability(sleepSessions,days);
  const goal=sleepGoalComparison(sleepSessions,days,sleepTargetMinutes);
  const metric=(name,value,detail)=>'<div class="sleep-stat"><span>'+name+'</span><strong>'+value+'</strong><small>'+detail+'</small></div>';
  const goalValue=goal.target===null?"Цель не задана":goal.count?(goal.delta===0?"Среднее совпадает с целью":goal.delta>0?"На "+sleepDurationLabel(goal.delta)+" выше цели":"На "+sleepDurationLabel(Math.abs(goal.delta))+" ниже цели"):"Недостаточно данных";
  const goalDetail=goal.target===null?"Задайте личную цель выше":goal.count?goal.count+" полных ночей · "+goal.below+" ниже · "+goal.atOrAbove+" на уровне или выше":"Пока нет полных ночей для сравнения";
  return metric("Средняя продолжительность · "+label,duration.count?sleepDurationLabel(duration.minutes):"Недостаточно данных",duration.count+" полных ночей"+(duration.incompleteCount?" · "+duration.incompleteCount+" неполных":""))
   +metric("Сравнение с моей целью · "+label,goalValue,goalDetail)
   +metric("Среднее засыпание · "+label,sleepClockLabel(asleep.time),asleep.count+" отметок")
   +metric("Среднее пробуждение · "+label,sleepClockLabel(wake.time),wake.count+" отметок")
   +metric("Разброс времени засыпания · "+label,asleep.variation===null?"Недостаточно данных":sleepDurationLabel(asleep.variation),asleep.count+" отметок · среднее отклонение по кругу суток")
   +metric("Разброс длительности · "+label,durationSpread.minutes===null?"Недостаточно данных":sleepDurationLabel(durationSpread.minutes),durationSpread.count+" полных ночей · стандартное отклонение");
 }).join("");
 $("sleep-chart").innerHTML=renderSleepDurationChart(sleepSessions,30);
 $("sleep-summary").innerHTML=cards+'<p class="fine">В расчётах используются только фактические отметки. Время засыпания и пробуждения сравнивается по местным часам каждой записи; разброс продолжительности считается только для полных ночей. Для оценки регулярности нужно хотя бы две отметки. Пропущенные дни не считаются нулевым сном.</p>';
 const today=sleepLocalDate(),yesterday=shiftDate(today,-1);
 const current=sleepSessions.find(s=>s.sleep_date===today||s.sleep_date===yesterday);
 const status=$("sleep-status");
 status.textContent=current?(current.woke_at?"Пробуждение зафиксировано: "+current.woke_at.slice(11,16):"Ночь начата "+(current.went_to_bed_at?current.went_to_bed_at.slice(11,16):"без отметки времени")+" · пробуждение ещё не подтверждено"):"Пробуждение за сегодня ещё не подтверждено. Отметь его здесь, когда проснёшься.";
 $("sleep-history").innerHTML=sleepSessions.length?sleepSessions.map(s=>{
  const durationMinutes=sleepDuration(s.fell_asleep_at,s.woke_at,s.asleep_timezone||s.timezone,s.wake_timezone||s.timezone);
  const bedTimezone=s.bed_timezone||s.timezone||"Europe/Moscow",asleepTimezone=s.asleep_timezone||s.timezone||"Europe/Moscow",wakeTimezone=s.wake_timezone||s.timezone||"Europe/Moscow";
  return '<article class="sleep-entry"><div class="sleep-entry-head"><strong>Ночь '+escapeHtml(s.sleep_date)+'</strong><b>'+sleepDurationLabel(durationMinutes)+'</b></div><form class="sleep-edit-form" data-sleep-edit="'+escapeHtml(s.id)+'"><label>Легла<input type="datetime-local" name="went_to_bed_at" value="'+escapeHtml(s.went_to_bed_at||"")+'"></label><label>Часовой пояс отметки «Легла»<input name="bed_timezone" value="'+escapeHtml(bedTimezone)+'" placeholder="Europe/Amsterdam"></label><label>Уснула примерно<input type="datetime-local" name="fell_asleep_at" value="'+escapeHtml(s.fell_asleep_at||"")+'"></label><label>Часовой пояс засыпания<input name="asleep_timezone" value="'+escapeHtml(asleepTimezone)+'" placeholder="Europe/Amsterdam"></label><label>Проснулась<input type="datetime-local" name="woke_at" value="'+escapeHtml(s.woke_at||"")+'"></label><label>Часовой пояс пробуждения<input name="wake_timezone" value="'+escapeHtml(wakeTimezone)+'" placeholder="Europe/Amsterdam"></label><label class="sleep-note">Заметка<input name="note" maxlength="1000" value="'+escapeHtml(s.note||"")+'"></label><button class="button ghost" type="submit">Сохранить исправления</button></form><button type="button" class="button ghost" data-sleep-delete="'+escapeHtml(s.id)+'">Удалить запись</button><small class="fine">Часовые пояса задаются отдельно для каждого времени. Например, если поездка пересекла границу часового пояса, укажите его в соответствующем поле.</small></article>';
 }).join(""):'<p class="muted">Здесь появится история сна.</p>';
}
async function loadSleep(){
 const data=await api("/api/sleep?limit=90");sleepSessions=data.sessions||[];sleepTargetMinutes=data.sleep_target_minutes==null?null:Number(data.sleep_target_minutes);
 const field=$("sleep-goal-hours");if(field)field.value=sleepTargetMinutes===null?"":String(sleepTargetMinutes/60);
 const goalStatus=$("sleep-goal-status");if(goalStatus)goalStatus.textContent=sleepTargetMinutes===null?"Личная цель не задана":"Цель: "+sleepDurationLabel(sleepTargetMinutes);
 renderSleep();
}
async function saveSleepGoal(value){
 const status=$("sleep-goal-status"),save=$("sleep-goal-form").querySelector('button[type="submit"]');
 save.disabled=true;
 try{
  const minutes=value===""?null:Math.round(Number(value)*60);
  const result=await api("/api/sleep",{method:"POST",body:JSON.stringify({action:"goal",sleep_target_minutes:minutes})});
  sleepTargetMinutes=result.sleep_target_minutes==null?null:Number(result.sleep_target_minutes);
  status.textContent=sleepTargetMinutes===null?"Личная цель не задана":"Сохранено: "+sleepDurationLabel(sleepTargetMinutes);
  renderSleep();
 }catch(error){status.textContent=error.message;}
 finally{save.disabled=false;}
}
$("sleep-goal-form").addEventListener("submit",async event=>{
 event.preventDefault();
 const value=$("sleep-goal-hours").value;
 if(value!==""&&(!Number.isFinite(Number(value))||Number(value)<3||Number(value)>12||!Number.isInteger(Number(value)*4))){ $("sleep-goal-status").textContent="Укажите от 3 до 12 часов";return; }
 await saveSleepGoal(value);
});
$("sleep-goal-clear").addEventListener("click",async()=>{ $("sleep-goal-hours").value="";await saveSleepGoal(""); });
async function markSleep(action){
 const button=action==="bed"?$("sleep-bed"):action==="asleep"?$("sleep-asleep"):$("sleep-wake");
 button.disabled=true;
 try{await api("/api/sleep",{method:"POST",body:JSON.stringify({action})});await loadSleep();}
 catch(err){alert(err.message);}
 finally{button.disabled=false;}
}

function decodePushKey(value){
 const normalized=String(value).replace(/-/g,"+").replace(/_/g,"/");
 const raw=atob(normalized+"=".repeat((4-normalized.length%4)%4));
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function refreshWakeNotificationStatus(){
 const button=$("wake-notifications-toggle"),status=$("wake-notifications-status");
 if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window)){
  status.textContent="Этот браузер не поддерживает push-уведомления. Подтверждение пробуждения доступно в приложении.";
  button.disabled=true;return;
 }
 try{
  const registration=await navigator.serviceWorker.register("/sw.js");
  const local=await registration.pushManager.getSubscription();
  const endpoint=local?encodeURIComponent(local.endpoint):"";
  const data=await api("/api/push-subscriptions"+(endpoint?"?endpoint="+endpoint:""));
  if(!data.supported){
   status.textContent="Отправка уведомлений ещё не настроена на сервере. Кнопка пробуждения в приложении уже доступна.";
   button.disabled=true;return;
  }
  if(data.subscribed&&local){
   button.textContent="Отключить уведомления";
   status.textContent="Уведомления включены: каждый день в 06:00 по часовому поясу настроек.";
  }else{
   button.textContent="Включить уведомление в 06:00";
   status.textContent=Notification.permission==="denied"?"Разрешение на уведомления запрещено в настройках браузера.":"Можно включить ежедневное уведомление. Время пробуждения сохранится при нажатии.";
  }
  button.disabled=false;
 }catch(error){
  status.textContent="Не удалось проверить уведомления: "+error.message;
  button.disabled=true;
 }
}
$("wake-notifications-toggle").addEventListener("click",async()=>{
 const button=$("wake-notifications-toggle"),status=$("wake-notifications-status");
 button.disabled=true;
 try{
  const registration=await navigator.serviceWorker.register("/sw.js");
  const current=await registration.pushManager.getSubscription();
  const config=await api("/api/push-subscriptions"+(current?"?endpoint="+encodeURIComponent(current.endpoint):""));
  if(current&&config.subscribed){
   await api("/api/push-subscriptions",{method:"DELETE",body:JSON.stringify({endpoint:current.endpoint})});
   await current.unsubscribe();
   status.textContent="Уведомления отключены.";
  }else{
   let permission=Notification.permission;
   if(permission==="default")permission=await Notification.requestPermission();
   if(permission!=="granted")throw new Error("Разрешите уведомления в настройках браузера.");
   if(!config.public_key)throw new Error("На сервере пока не настроена отправка уведомлений.");
   let subscription=current;
   if(subscription){
    // A browser subscription may belong to a previous account; replace it instead of transferring ownership.
    await subscription.unsubscribe();
    subscription=null;
   }
   subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodePushKey(config.public_key)});
   try{
    await api("/api/push-subscriptions",{method:"POST",body:JSON.stringify({subscription:subscription.toJSON()})});
   }catch(error){
    // Do not leave an unregistered browser subscription behind after a failed save.
    await subscription.unsubscribe().catch(()=>false);
    throw error;
   }
   status.textContent="Уведомления включены: ежедневно в 06:00 по часовому поясу настроек.";
  }
  await refreshWakeNotificationStatus();
 }catch(error){status.textContent=error.message;}
 finally{button.disabled=false;}
});

$("sleep-bed").addEventListener("click",()=>markSleep("bed"));
$("sleep-asleep").addEventListener("click",()=>markSleep("asleep"));
$("sleep-wake").addEventListener("click",()=>markSleep("wake"));
$("sleep-history").addEventListener("click",async event=>{
 const button=event.target.closest("[data-sleep-delete]");if(!button)return;
 if(!confirm("Удалить запись о сне?"))return;
 button.disabled=true;
 try{await api("/api/sleep",{method:"POST",body:JSON.stringify({action:"delete",id:button.dataset.sleepDelete})});await loadSleep();}
 catch(err){alert(err.message);button.disabled=false;}
});
$("sleep-history").addEventListener("submit",async event=>{
 const form=event.target.closest("[data-sleep-edit]");if(!form)return;event.preventDefault();
 const data=new FormData(form),payload={action:"edit",id:form.dataset.sleepEdit};
 for(const key of ["went_to_bed_at","fell_asleep_at","woke_at","bed_timezone","asleep_timezone","wake_timezone","note"])payload[key]=data.get(key)||null;
 const button=form.querySelector("button");button.disabled=true;
 try{await api("/api/sleep",{method:"POST",body:JSON.stringify(payload)});await loadSleep();}
 catch(err){alert(err.message);button.disabled=false;}
});

async function boot() {
  try {
    const { user } = await api("/api/auth/me");
    if (!user) return showAuth();
    showApp(user.email);
    const wakeRequested=new URLSearchParams(window.location.search).get("wake")==="1";
    if(wakeRequested){
      window.history.replaceState({}, "", window.location.pathname+window.location.hash);
      try{await api("/api/sleep",{method:"POST",body:JSON.stringify({action:"wake",source:"push"})});}
      catch(error){$("sleep-status").textContent="Не удалось автоматически подтвердить пробуждение. Нажмите «Подтвердить пробуждение» после восстановления соединения.";}
    }
    await refreshWakeNotificationStatus().catch(()=>{}); await loadDashboardData(); await loadFinance(); await loadProfitability(); await loadRevenuePlan(); await loadRevenueScenarios(); await loadSalesPlan(); await loadDeals(); await loadAnalytics(); await loadWorkspace(); await loadCharity(); await loadDreams(); await loadRecurringTemplates(); await loadTasks(); calendarSelected=localToday; calendarAnchor=new Date(localToday+"T12:00:00"); await loadCalendar(); await loadSleep().catch(err=>{ $("sleep-status").textContent="Не удалось загрузить записи сна: "+err.message; }); await loadPlanner();
  } catch { showAuth(); }
}
boot();
