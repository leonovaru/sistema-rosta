function round1(value){return Math.round(value*10)/10;}
export function buildBucketRecommendations(buckets=[],incomeRows=[],spendingRows=[],{historyMonths=3}={}){
 const incomeByMonth=new Map(incomeRows.map(row=>[row.month,Number(row.total)||0]));
 const incomeMonths=[...incomeByMonth.entries()].filter(([,value])=>value>0).map(([month])=>month).sort();
 const monthsWithIncome=incomeMonths.length;
 const totalIncome=[...incomeByMonth.values()].reduce((sum,value)=>sum+value,0);
 const monthIndex=month=>Number(month.slice(0,4))*12+Number(month.slice(5,7));
 const observedMonths=incomeMonths.length?Math.min(historyMonths,monthIndex(incomeMonths[incomeMonths.length-1])-monthIndex(incomeMonths[0])+1):historyMonths;
 const averageMonthlyIncome=totalIncome/observedMonths;
 if(monthsWithIncome<2||averageMonthlyIncome<=0)return {ready:false,history_months:observedMonths,history_window_months:historyMonths,months_with_income:monthsWithIncome,average_monthly_income:Math.round(averageMonthlyIncome),buckets:[]};
 const spendingByBucket=new Map();
 for(const row of spendingRows)spendingByBucket.set(row.bucket_id,(spendingByBucket.get(row.bucket_id)||0)+(Number(row.total)||0));
 const nonCapital=buckets.filter(bucket=>bucket.bucket_type!=="capital");
 const capital=buckets.find(bucket=>bucket.bucket_type==="capital");
 const base=nonCapital.map(bucket=>{
  const averageMonthlySpending=(spendingByBucket.get(bucket.id)||0)/observedMonths;
  const observed=averageMonthlySpending>0;
  return {id:bucket.id,title:bucket.title,current_percentage:Number(bucket.percentage),average_monthly_spending:Math.round(averageMonthlySpending),raw_percentage:observed?averageMonthlySpending/averageMonthlyIncome*100:Number(bucket.percentage),based_on_spending:observed};
 });
 const rawTotal=base.reduce((sum,row)=>sum+row.raw_percentage,0),scale=rawTotal>90?90/rawTotal:1;
 let recommendedTotal=0;
 const recommended=base.map(row=>{const percentage=round1(row.raw_percentage*scale);recommendedTotal+=percentage;return {...row,recommended_percentage:percentage};});
 const capitalPercentage=capital?round1(100-recommendedTotal):0;
 if(capital)recommended.push({id:capital.id,title:capital.title,current_percentage:Number(capital.percentage),average_monthly_spending:Math.round((spendingByBucket.get(capital.id)||0)/observedMonths),based_on_spending:false,recommended_percentage:capitalPercentage});
 if(!capital&&recommended.length){recommended[recommended.length-1].recommended_percentage=round1(recommended[recommended.length-1].recommended_percentage+(100-recommended.reduce((sum,row)=>sum+row.recommended_percentage,0)));}
 return {ready:true,history_months:observedMonths,history_window_months:historyMonths,months_with_income:monthsWithIncome,average_monthly_income:Math.round(averageMonthlyIncome),buckets:recommended};
}
