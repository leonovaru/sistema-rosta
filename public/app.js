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
   const tasks=selected.map(i=>{const a=m.agreements[i];return {title:a.task,description:[a.assignee?"Ответственный: "+a.assignee:"", "Договорённость встречи: "+m.title].filter(Boolean).join("\n"),due_date:a.due_date,priority:"medium",project_id:a.project_id||m.project_id||null,client_id:a.client_id||m.client_id||null,operation:"create"};});
   const created=await api("/api/tasks/voice-intake",{method:"POST",body:JSON.stringify({action:"save",tasks})});
   const taskIds=created.created_task_ids||[];if(taskIds.length!==selected.length)throw new Error("Задачи созданы, но не удалось получить все идентификаторы для связи с протоколом.");
   await api("/api/meetings",{method:"POST",body:JSON.stringify({action:"link_tasks",meeting_id:m.saved_id,links:selected.map((agreement_index,i)=>({agreement_index,task_id:taskIds[i]}))})});
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
 profitabilityData=await api("/api/analytics/profitability");
 const s=profitabilityData.summary;
 $("profitability-period").textContent=profitabilityData.period.from+" — "+profitabilityData.period.to;
 $("profitability-summary").innerHTML=[
 ["Поступления",money(s.revenue)],["Прямые расходы",money(s.direct_expenses)],["Вклад направлений",money(s.contribution)],["Фактическое время",duration(s.actual_minutes)],["Завершено задач",s.completed_tasks],["Вклад на час",s.contribution_per_hour===null?"Нет данных":money(s.contribution_per_hour)]
 ].map(x=>'<article><span>'+x[0]+'</span><b>'+x[1]+'</b></article>').join("");
 $("profitability-directions").innerHTML=profitabilityData.directions.length?profitabilityData.directions.map(x=>'<article class="analytics-row"><div><b>'+escapeHtml(x.direction_title)+'</b><small>Доход '+money(x.revenue)+' · расходы '+money(x.direct_expenses)+' · маржа '+(x.margin_percent===null?"—":x.margin_percent+"%")+' · '+x.completed_tasks+' задач / '+duration(x.actual_minutes)+'</small></div><div><strong>'+money(x.contribution)+'</strong><small>вклад · '+(x.contribution_per_hour===null?"нет учёта времени":money(x.contribution_per_hour)+"/ч")+'</small></div></article>').join(""):'<p class="muted">Пока нет доходов, расходов или завершённых задач за период.</p>';
}
$("refresh-profitability").addEventListener("click",async()=>{const b=$("refresh-profitability");b.disabled=true;try{await loadProfitability();}catch(err){alert(err.message);}finally{b.disabled=false;}});

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
 host.innerHTML=revenueScenariosData.scenarios.map(s=>'<article class="scenario-card"><div class="scenario-head"><div><b>'+escapeHtml(s.title)+'</b><small>'+escapeHtml(s.description)+'</small></div><strong>'+money(s.target)+'</strong></div><div class="scenario-metrics"><span>Нужно в неделю: <b>'+money(s.weekly_target)+'</b></span><span>Продаж по заданным чекам: <b>'+s.directions.reduce((sum,d)=>sum+(d.required_sales||0),0)+(s.directions.some(d=>d.required_sales===null)?' + не рассчитано':'')+'</b></span><span>Нагрузка: <b>'+(s.weekly_required_hours===null?'недостаточно истории':duration(Math.round(s.weekly_required_hours*60))+' в неделю')+'</b></span><span>Вместимость: <b>'+(s.capacity_fit===null?'не оценена':s.capacity_fit?'укладывается':'выше доступного времени')+'</b></span></div><details><summary>Разбивка по направлениям</summary><div class="scenario-directions">'+s.directions.map(d=>'<div><b>'+escapeHtml(d.title)+'</b><span>'+money(d.monthly_target)+' / мес. · '+money(d.weekly_target)+' / нед.</span><small>'+(d.required_sales===null?'Средний чек не задан':d.required_sales+' продаж по '+money(d.average_sale_amount))+' · '+(d.weekly_hours===null?'нет оценки времени':duration(Math.round(d.weekly_hours*60))+' в неделю')+'</small></div>').join('')+'</div></details></article>').join('');
 $("revenue-scenarios-note").textContent="Нагрузка рассчитана по фактическим поступлениям и времени завершённых задач за последние 90 дней. Если истории нет, оценка времени не подменяется догадкой. Доступное время — 5 рабочих дней по установленной дневной ёмкости.";
}
$("refresh-revenue-scenarios").addEventListener("click",async()=>{const b=$("refresh-revenue-scenarios");b.disabled=true;try{await loadRevenueScenarios();}catch(err){alert(err.message);}finally{b.disabled=false;}});

let salesPlanData=null;
async function loadSalesPlan(){
 salesPlanData=await api("/api/finance/sales-plan");
 const host=$("sales-plan-directions");
 host.innerHTML=salesPlanData.directions.map(d=>'<article class="sales-plan-card"><div class="sales-plan-title"><b>'+escapeHtml(d.title)+'</b><span>Осталось до цели: '+money(d.remaining_target)+'</span></div><div class="sales-plan-inputs"><label>Контакт → обращение, %<input type="number" min="0" max="100" step="1" data-sales-response="'+escapeHtml(d.direction_id)+'" value="'+d.contact_to_lead_percent+'"></label><label>Обращение → продажа, %<input type="number" min="0" max="100" step="1" data-sales-close="'+escapeHtml(d.direction_id)+'" value="'+d.lead_to_sale_percent+'"></label></div><div class="sales-plan-numbers"><span>Продаж: <b>'+(d.sales_required===null?'укажи средний чек':d.sales_required)+'</b></span><span>Обращений: <b>'+(d.qualified_leads_required===null?'—':d.qualified_leads_required)+'</b></span><span>Первичных контактов: <b>'+(d.outreach_required===null?'—':d.outreach_required)+'</b></span></div><p class="fine">'+(d.assumptions_default?'Используются стартовые допущения 40% и 20%. Измени их на свои показатели.':'Используются сохранённые тобой конверсии.')+'</p><button type="button" class="button ghost" data-sales-create="'+escapeHtml(d.direction_id)+'" '+(d.outreach_required===null||d.outreach_required===0?'disabled':'')+'>Добавить задачи на неделю</button></article>').join('');
 $("sales-plan-note").textContent="Расчёт строится от оставшейся цели, среднего чека и двух конверсий. Это модель воронки, а не обещание результата. Уточняй проценты по фактической статистике.";
}
$("save-sales-plan").addEventListener("click",async()=>{
 const b=$("save-sales-plan");b.disabled=true;
 try{const rows=salesPlanData.directions.map(d=>({direction_id:d.direction_id,contact_to_lead_percent:document.querySelector('[data-sales-response="'+d.direction_id+'"]').value,lead_to_sale_percent:document.querySelector('[data-sales-close="'+d.direction_id+'"]').value}));await api("/api/finance/sales-plan",{method:"POST",body:JSON.stringify({directions:rows})});await loadSalesPlan();}
 catch(err){alert(err.message);}finally{b.disabled=false;}
});
$("sales-plan-directions").addEventListener("click",async e=>{
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
  ["income-project","expense-project"].forEach(id=>$(id).addEventListener("change",()=>{const project=workspaceData.projects.find(p=>p.id===$(id).value);if(project?.client_id)$(id.replace("-project","-client")).value=project.client_id;}));
  $("task-project").innerHTML='<option value="">Без проекта</option>'+workspaceData.projects.filter(p=>!["done","archived"].includes(p.status)).map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.title)+(p.client_name?' · '+escapeHtml(p.client_name):'')+'</option>').join("");
  $("task-life-area").innerHTML='<option value="">Не личная задача</option>'+workspaceData.life_areas.map(a=>'<option value="'+escapeHtml(a.id)+'">'+escapeHtml(a.title)+'</option>').join("");
  $("workspace-clients").innerHTML=workspaceData.clients.length?workspaceData.clients.map(c=>'<article class="workspace-item"><b>'+escapeHtml(c.name)+'</b><small>'+escapeHtml(c.direction_title||"Без направления")+' · '+Number(c.project_count||0)+' проектов</small><small>'+escapeHtml(c.contact||"Контакт не указан")+'</small><div class="workspace-actions"><button type="button" class="button ghost" data-open-client-history="'+escapeHtml(c.id)+'">История взаимодействий</button></div><div class="client-history hidden" data-client-history-panel="'+escapeHtml(c.id)+'"></div><details class="workspace-edit"><summary>Изменить клиента</summary><form data-edit-client="'+escapeHtml(c.id)+'"><label>Имя / компания<input name="name" required maxlength="160" value="'+escapeHtml(c.name)+'"></label><label>Контакт<input name="contact" maxlength="240" value="'+escapeHtml(c.contact||"")+'"></label><label>Статус<select name="status"><option value="lead" '+(c.status==="lead"?"selected":"")+'>Потенциальный</option><option value="active" '+(c.status==="active"?"selected":"")+'>Активный</option><option value="paused" '+(c.status==="paused"?"selected":"")+'>Пауза</option><option value="closed" '+(c.status==="closed"?"selected":"")+'>Завершён</option></select></label><label>Заметки<textarea name="notes" rows="2" maxlength="3000">'+escapeHtml(c.notes||"")+'</textarea></label><button type="submit" class="button ghost">Сохранить клиента</button></form></details></article>').join(""):'<p class="muted">Клиенты пока не добавлены.</p>';
  $("workspace-projects").innerHTML=workspaceData.projects.length?workspaceData.projects.map(p=>{const total=Number(p.total_tasks||0),done=Number(p.done_tasks||0),percent=total?Math.round(done/total*100):0,e=p.economics||{},economicStatus={loss:"Отрицательный финансовый результат",over_budget:"Расходы выше бюджета",awaiting_payment:"Есть сумма к получению",on_track:"В пределах плана"}[e.status]||"Недостаточно данных";return '<article class="workspace-item"><b>'+escapeHtml(p.title)+'</b><small>'+(p.client_name?escapeHtml(p.client_name)+' · ':'')+escapeHtml(p.direction_title||"Собственный проект")+'</small><small>'+(p.deadline?'Срок: '+escapeHtml(p.deadline)+' · ':'')+'Задачи: '+done+' из '+total+' выполнено · открыто: '+Number(p.open_tasks||0)+'</small>'+(total?'<div class="progress" role="progressbar" aria-label="Готовность проекта" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'"><span style="width:'+percent+'%"></span></div>':'<small class="muted">Пока нет задач — можно составить план с ИИ.</small>')+'<div class="project-economics"><div><small>Плановая выручка</small><b>'+money(e.planned_revenue||0)+'</b></div><div><small>Получено</small><b>'+money(e.received||0)+'</b></div><div><small>Осталось получить</small><b>'+money(e.outstanding||0)+'</b></div><div><small>Прямые расходы</small><b>'+money(e.direct_expenses||0)+'</b></div><div><small>Бюджет расходов</small><b>'+money(e.planned_cost_budget||0)+'</b></div><div><small>Использовано бюджета</small><b>'+(e.budget_usage_percent===null||e.budget_usage_percent===undefined?"—":e.budget_usage_percent+"%")+'</b></div><div><small>Финансовый вклад</small><b>'+money(e.contribution||0)+'</b></div><div><small>Учтено времени</small><b>'+duration(Math.round(Number(e.hours||0)*60))+'</b></div><div><small>Выручка в час</small><b>'+(e.revenue_per_hour===null||e.revenue_per_hour===undefined?"—":money(e.revenue_per_hour))+'</b></div><div><small>Вклад в час</small><b>'+(e.contribution_per_hour===null||e.contribution_per_hour===undefined?"—":money(e.contribution_per_hour))+'</b></div><div><small>Маржа</small><b>'+(e.margin_percent===null||e.margin_percent===undefined?"—":e.margin_percent+"%")+'</b></div></div><small class="project-economics-status '+(e.status==="loss"||e.status==="over_budget"?"warning":"")+'">'+escapeHtml(economicStatus)+'</small>'+'<details class="workspace-edit"><summary>Изменить проект</summary><form data-edit-project="'+escapeHtml(p.id)+'"><label>Название<input name="title" required maxlength="180" value="'+escapeHtml(p.title)+'"></label><label>Описание<textarea name="description" rows="3" maxlength="5000">'+escapeHtml(p.description||"")+'</textarea></label><label>Ожидаемый результат<textarea name="expected_result" rows="2" maxlength="2000">'+escapeHtml(p.expected_result||"")+'</textarea></label><div class="workspace-inline"><label>Срок<input name="deadline" type="date" value="'+escapeHtml(p.deadline||"")+'"></label><label>Плановая сумма договора / выручки, ₽<input name="budget" type="number" min="0" step="0.01" value="'+Number(p.budget||0)+'"></label><label>Бюджет прямых расходов, ₽<input name="cost_budget" type="number" min="0" step="0.01" value="'+Number(p.cost_budget||0)+'"></label></div><label>Статус<select name="status"><option value="draft" '+(p.status==="draft"?"selected":"")+'>Черновик</option><option value="active" '+(p.status==="active"?"selected":"")+'>В работе</option><option value="waiting" '+(p.status==="waiting"?"selected":"")+'>Ожидание</option><option value="done" '+(p.status==="done"?"selected":"")+'>Завершён</option><option value="archived" '+(p.status==="archived"?"selected":"")+'>Архив</option></select></label><button type="submit" class="button ghost">Сохранить проект</button></form></details><div class="workspace-actions"><span class="status-chip">'+({active:"В работе",draft:"Черновик",waiting:"Ожидание",done:"Завершён",archived:"Архив"})[p.status]+'</span><button type="button" class="button ghost" data-project-plan="'+escapeHtml(p.id)+'">Составить план с ИИ</button><button type="button" class="button ghost" data-project-meetings="'+escapeHtml(p.id)+'">Встречи и протоколы</button><button type="button" class="button ghost" data-project-cashflow="'+escapeHtml(p.id)+'">Платежи и денежный поток</button></div><div class="project-meetings hidden" id="project-meetings-'+escapeHtml(p.id)+'"></div><div class="project-cashflow hidden" id="project-cashflow-'+escapeHtml(p.id)+'"></div></article>'}).join(""):'<p class="muted">Проекты пока не созданы.</p>';
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
async function openProjectMeetings(projectId){
 const panel=$("project-meetings-"+projectId);if(!panel)return;
 panel.classList.remove("hidden");panel.innerHTML='<p class="fine">Загружаю протоколы…</p>';
 try{
  const data=await api("/api/meetings?project_id="+encodeURIComponent(projectId));
  panel.innerHTML='<div class="project-cashflow-head"><b>История встреч · '+data.meetings.length+'</b><button type="button" class="button ghost" data-project-meetings-close="'+escapeHtml(projectId)+'">Скрыть</button></div>'+(data.meetings.length?data.meetings.map(m=>'<article class="client-history-entry"><small>Встреча · '+escapeHtml(m.meeting_date||"")+(m.participants?' · '+escapeHtml(m.participants):'')+'</small><b>'+escapeHtml(m.title)+'</b>'+(m.summary?'<p>'+escapeHtml(m.summary)+'</p>':'')+(m.decisions?.length?'<b>Решения</b><ul>'+m.decisions.map(x=>'<li>'+escapeHtml(x)+'</li>').join("")+'</ul>':'')+(m.agreements?.length?'<b>Договорённости и поручения</b><ul>'+m.agreements.map(x=>'<li>'+escapeHtml(typeof x==="string"?x:x.task+(x.assignee?' · Ответственный: '+x.assignee:'')+(x.due_date?' · срок: '+x.due_date:'')+(x.task_id?' · задача: '+(x.task_title||x.task_id)+' ('+({todo:"К выполнению",doing:"В работе",waiting:"Ожидание",done:"Выполнена"}[x.task_status]||x.task_status||"создана")+')':''))+'</li>').join("")+'</ul>':'<small>Поручений нет</small>')+(m.open_questions?.length?'<b>Открытые вопросы</b><ul>'+m.open_questions.map(x=>'<li>'+escapeHtml(x)+'</li>').join("")+'</ul>':'')+'</article>').join(""):'<p class="fine">Встреч по этому проекту пока нет.</p>');
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
 return '<div class="section-head"><div><b>История: '+escapeHtml(data.client.name)+'</b><p class="fine">Проекты, задачи, встречи, поступления и расходы</p></div></div><div class="client-finance-summary"><article><small>Поступления</small><b>'+money(financial.income)+'</b></article><article><small>Расходы</small><b>'+money(financial.expenses)+'</b></article><article><small>Разница</small><b>'+money(Number(financial.income)-Number(financial.expenses))+'</b></article></div><form class="client-history-form" data-client-history-form="'+escapeHtml(data.client.id)+'"><label>Тип записи<select name="type"><option value="call">Звонок</option><option value="email">Письмо</option><option value="message">Сообщение</option><option value="note">Заметка</option></select></label><label>Дата<input name="occurred_on" type="date" value="'+(localToday||new Date().toISOString().slice(0,10))+'" required></label><label>Проект<select name="project_id"><option value="">Без привязки к проекту</option>'+projects+'</select></label><label>Тема<input name="title" maxlength="180" required placeholder="Например, обсудили объём работ"></label><label>Содержание<textarea name="body" rows="3" maxlength="5000" placeholder="Что обсудили, о чём договорились, что важно помнить"></textarea></label><button class="button primary">Сохранить запись</button></form><div class="client-history-timeline">'+(timeline||'<p class="muted">История пока пустая.</p>')+'</div>';
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

async function boot() {
  try {
    const { user } = await api("/api/auth/me");
    if (!user) return showAuth();
    showApp(user.email); await loadDashboardData(); await loadFinance(); await loadProfitability(); await loadRevenuePlan(); await loadRevenueScenarios(); await loadSalesPlan(); await loadAnalytics(); await loadWorkspace(); await loadCharity(); await loadDreams(); await loadRecurringTemplates(); await loadTasks(); calendarSelected=localToday; calendarAnchor=new Date(localToday+"T12:00:00"); await loadCalendar(); await loadPlanner();
  } catch { showAuth(); }
}
boot();
