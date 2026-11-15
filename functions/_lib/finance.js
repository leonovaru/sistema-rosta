export function addDays(date,days) {
  const value=new Date(date+"T12:00:00Z");
  value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
}
export function addPeriod(date,frequency,recurrenceDay=null) {
  if(frequency==="weekly")return addDays(date,7);
  if(frequency!=="monthly")return null;
  const [year,month,day]=date.split("-").map(Number);
  const anchor=Number(recurrenceDay)||day;
  const next=new Date(Date.UTC(year,month,1,12));
  const last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0,12)).getUTCDate();
  return next.getUTCFullYear()+"-"+String(next.getUTCMonth()+1).padStart(2,"0")+"-"+String(Math.min(anchor,last)).padStart(2,"0");
}


// Управленческая модель: месячное начисление по номинальной ставке / 12.
// Фактический договор может использовать ежедневное начисление и другой порядок платежей.
export function forecastDebt(debt, extraMonthlyPayment=0, maxMonths=60) {
  let balance=Math.max(0,Number(debt.balance)||0);
  const annualRate=Math.max(0,Number(debt.interest_rate)||0);
  const minimum=Math.max(0,Number(debt.minimum_payment)||0);
  const extra=Math.max(0,Number(extraMonthlyPayment)||0);
  const monthlyRate=annualRate/1200;
  let totalInterest=0,totalPaid=0;
  const schedule=[];
  for(let month=1;month<=maxMonths&&balance>0.005;month++){
    const opening=balance;
    const interest=Math.round(balance*monthlyRate*100)/100;
    balance=Math.round((balance+interest)*100)/100;
    totalInterest+=interest;
    const payment=Math.min(balance,minimum+extra);
    balance=Math.max(0,Math.round((balance-payment)*100)/100);
    totalPaid+=payment;
    schedule.push({month,opening_balance:opening,interest,payment,closing_balance:balance});
  }
  return {months_to_payoff:balance<=0.005?schedule.length:null,total_interest:Math.round(totalInterest*100)/100,total_paid:Math.round(totalPaid*100)/100,projected_balance:balance,schedule,limited:balance>0.005&&schedule.length>=maxMonths};
}
export function buildDebtForecast(debts, extraMonthlyPayment=0, maxMonths=60) {
  const open=debts.filter(d=>d.status==="open"&&Number(d.balance)>0);
  const items=open.map(debt=>({id:debt.id,title:debt.title,creditor:debt.creditor||"",current_balance:Number(debt.balance),annual_rate:Number(debt.interest_rate)||0,minimum_payment:Number(debt.minimum_payment)||0,...forecastDebt(debt,extraMonthlyPayment,maxMonths)}));
  const maxLength=Math.max(0,...items.map(x=>x.schedule.length));
  const months=Array.from({length:maxLength},(_,i)=>{
    const rows=items.filter(x=>x.schedule[i]).map(x=>x.schedule[i]);
    return {month:i+1,payment:Math.round(rows.reduce((s,x)=>s+x.payment,0)*100)/100,interest:Math.round(rows.reduce((s,x)=>s+x.interest,0)*100)/100,balance:Math.round(items.reduce((s,x)=>s+(x.schedule[i]?.closing_balance??x.projected_balance),0)*100)/100};
  });
  return {extra_monthly_payment:extraMonthlyPayment,max_months:maxMonths,debts:items,summary:{current_balance:Math.round(items.reduce((s,x)=>s+x.current_balance,0)*100)/100,projected_interest:Math.round(items.reduce((s,x)=>s+x.total_interest,0)*100)/100,monthly_minimum:Math.round(items.reduce((s,x)=>s+x.minimum_payment,0)*100)/100,months_to_payoff:items.length&&items.every(x=>x.months_to_payoff!==null)?Math.max(...items.map(x=>x.months_to_payoff)):null,unresolved:items.some(x=>x.months_to_payoff===null)},months};
}