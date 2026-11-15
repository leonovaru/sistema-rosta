const amount=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:0;};
export function buildProfitability({incomeRows=[],expenseRows=[],taskRows=[],openTaskRows=[]}={}){
 const map=new Map();
 const get=(id,title)=>{const key=id||"unassigned";if(!map.has(key))map.set(key,{direction_id:id||null,direction_title:title||"Без направления",revenue:0,direct_expenses:0,completed_tasks:0,active_tasks:0,actual_minutes:0,tracked_minutes:0});return map.get(key);};
 for(const row of incomeRows)get(row.direction_id,row.direction_title).revenue+=amount(row.total);
 for(const row of expenseRows)get(row.direction_id,row.direction_title).direct_expenses+=amount(row.total);
 for(const row of taskRows){const x=get(row.direction_id,row.direction_title);x.completed_tasks+=Number(row.completed_tasks)||0;x.actual_minutes+=amount(row.actual_minutes);}
 for(const row of openTaskRows){const x=get(row.direction_id,row.direction_title);x.active_tasks+=Number(row.active_tasks)||0;x.tracked_minutes+=amount(row.tracked_minutes);}
 const directions=[...map.values()].map(x=>{const contribution=x.revenue-x.direct_expenses,totalMinutes=x.actual_minutes+x.tracked_minutes,hours=totalMinutes/60;return {...x,total_minutes:totalMinutes,contribution,share_percent:null,margin_percent:x.revenue?Math.round(contribution/x.revenue*1000)/10:null,hours:Math.round(hours*100)/100,revenue_per_hour:hours?Math.round(x.revenue/hours*100)/100:null,contribution_per_hour:hours?Math.round(contribution/hours*100)/100:null};}).sort((a,b)=>b.contribution-a.contribution);
 const total=directions.reduce((a,x)=>{for(const k of ["revenue","direct_expenses","contribution","completed_tasks","active_tasks","actual_minutes","tracked_minutes","total_minutes"])a[k]+=x[k];return a;},{revenue:0,direct_expenses:0,contribution:0,completed_tasks:0,active_tasks:0,actual_minutes:0,tracked_minutes:0,total_minutes:0});
 for(const x of directions)x.share_percent=total.revenue?Math.round(x.revenue/total.revenue*1000)/10:null;
 const hours=total.total_minutes/60;
 return {summary:{...total,hours:Math.round(hours*100)/100,margin_percent:total.revenue?Math.round(total.contribution/total.revenue*1000)/10:null,contribution_per_hour:hours?Math.round(total.contribution/hours*100)/100:null},directions};
}

export function attachObservedSalesMetrics(directions=[],funnelRows=[]){
 const byDirection=new Map(funnelRows.map(row=>[row.direction_id,row]));
 return directions.map(row=>({...row,...(byDirection.get(row.direction_id)||{
  observed_contacted_clients:0,qualified_clients:0,won_clients:0,
  observed_contact_to_lead_percent:null,observed_lead_to_sale_percent:null,
  avg_contact_to_negotiation_days:null,contact_to_negotiation_sample:0,
  avg_contact_to_proposal_days:null,contact_to_proposal_sample:0,
  avg_contact_to_won_days:null,contact_to_won_sample:0
 })}));
}
export function buildCompletedTaskResiduals(taskRows=[],timerTotals=[]){
 const tracked=new Map((timerTotals||[]).map(row=>[String(row.task_id),Math.max(0,Number(row.tracked_minutes)||0)]));
 const map=new Map();
 for(const task of taskRows||[]){
  const minutes=Math.max(0,Number(task.actual_minutes)||0)-Math.max(0,tracked.get(String(task.id))||0);
  const key=task.direction_id||"unassigned";
  const row=map.get(key)||{direction_id:task.direction_id||null,direction_title:task.direction_title||"Без направления",completed_tasks:0,actual_minutes:0};
  row.completed_tasks+=1;
  row.actual_minutes+=Math.max(0,minutes);
  map.set(key,row);
 }
 return [...map.values()];
}
