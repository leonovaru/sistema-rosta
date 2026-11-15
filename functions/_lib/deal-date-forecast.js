function addDays(date,days){
 const match=String(date||"").match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})/);
 if(!match||!Number.isFinite(days)||days<0)return null;
 const value=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])+Math.round(days)));
 return Number.isFinite(value.getTime())?value.toISOString().slice(0,10):null;
}
export function buildDealDateForecast(deals=[],{cycleByDirection=new Map(),firstContactByClient=new Map(),minimumSample=3}={}){
 return deals.map(deal=>{
  const firstContact=deal.direction_id&&deal.client_id?firstContactByClient.get(deal.direction_id+"::"+deal.client_id):null;
  const cycle=deal.direction_id?cycleByDirection.get(deal.direction_id):null;
  const sample=Number(cycle?.contact_to_won_sample)||0,averageDays=Number(cycle?.avg_contact_to_won_days);
  const manualClose=deal.expected_close_date||null;
  const estimatedClose=!manualClose&&firstContact&&sample>=minimumSample&&Number.isFinite(averageDays)?addDays(firstContact,averageDays):null;
  return {...deal,estimated_close_date:manualClose||estimatedClose,close_date_is_estimated:Boolean(estimatedClose),close_date_estimate_source:manualClose?"manual":estimatedClose?"observed_sales_cycle":"not_available",sales_cycle_sample:sample,sales_cycle_average_days:Number.isFinite(averageDays)?averageDays:null};
 });
}
