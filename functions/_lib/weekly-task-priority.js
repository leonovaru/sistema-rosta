const HIGH_FOCUS=/(стратег|анализ|аналит|исслед|разработ|проектирован|архитект|планирован|концепц|сложн|расчет|расчёт|модел|автоматизац|код|программ|текст|документ|презентац|подготов|решен|решён|диагност|систем)/i;
const LOW_FOCUS=/(позвон|звон|ответ|отправ|письм|оплат|купить|заказ|проверить статус|напомин|разобрать почту|внести|заполнить|сверить|опубликов|переслать|забрать|заехать)/i;
const PRIORITY={high:30,medium:18,low:8};
function dayDiff(from,to){const a=new Date(String(from).slice(0,10)+"T12:00:00Z"),b=new Date(String(to).slice(0,10)+"T12:00:00Z");return Math.round((b-a)/86400000);}
export function assessWeeklyTask(task,today){
 const priority=task.priority||"medium",daysToDue=task.due_date?dayDiff(today,task.due_date):null;
 const urgency=daysToDue===null?0:daysToDue<0?45:daysToDue===0?40:daysToDue<=2?32:daysToDue<=4?22:daysToDue<=7?12:4;
 const text=[task.title,task.description].filter(Boolean).join(" ");
 const cognitive=HIGH_FOCUS.test(text)?"high":LOW_FOCUS.test(text)?"low":"medium";
 const attention={high:18,medium:10,low:3}[cognitive];
 const score=(PRIORITY[priority]??18)+urgency+attention;
 return {priority_score:score,priority_label:priority==="high"?"Высокий":priority==="low"?"Низкий":"Средний",urgency_days:daysToDue,cognitive_load:cognitive,cognitive_load_label:cognitive==="high"?"Высокая концентрация":cognitive==="low"?"Низкая концентрация":"Умеренная концентрация",assessment_note:"Предварительная оценка по приоритету, сроку и формулировке задачи; при необходимости её можно изменить вручную."};
}
export function attachWeeklyTaskPriority(week,tasks=[],today){
 const byId=new Map((tasks||[]).map(task=>[String(task.id),task]));
 for(const day of week.days||[]){
  day.tasks=(day.tasks||[]).map(item=>({...item,...assessWeeklyTask({...byId.get(String(item.id)),...item},today)})).sort((a,b)=>b.priority_score-a.priority_score||a.minutes-b.minutes);
 }
 week.priority_overview=(tasks||[]).filter(task=>["todo","doing"].includes(task.status)&&task.due_date).map(task=>({...task,...assessWeeklyTask(task,today)})).sort((a,b)=>b.priority_score-a.priority_score).slice(0,10);
 return week;
}
