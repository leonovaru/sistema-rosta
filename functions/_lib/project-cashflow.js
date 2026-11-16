export function summarizeProjectCashflow(items,{today}={}){
 const future=(items||[]).filter(x=>x.status==="planned"&&x.expected_date>=today);
 const incoming=future.filter(x=>x.flow_type==="income").reduce((s,x)=>s+Number(x.amount||0),0);
 const outgoing=future.filter(x=>x.flow_type==="expense").reduce((s,x)=>s+Number(x.amount||0),0);
 const byDate=new Map();for(const x of future)byDate.set(x.expected_date,(byDate.get(x.expected_date)||0)+(x.flow_type==="income"?1:-1)*Number(x.amount||0));
 let cumulative=0,minimum=0,firstNegative=null;
 for(const [date,delta] of [...byDate.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){cumulative+=delta;if(cumulative<minimum){minimum=cumulative;if(!firstNegative)firstNegative=date;}}
 return {planned_incoming:incoming,planned_outgoing:outgoing,net:incoming-outgoing,minimum_cumulative:minimum,first_negative_date:firstNegative};
}
