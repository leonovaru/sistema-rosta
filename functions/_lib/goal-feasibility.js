export function buildGoalFeasibility({income=0,expenses=0,debtPayments=0,obligationPayments=0,activeGoalContributions=0,targetAmount=0,savedAmount=0,months=null,historyDays=90}={}) {
 const values=[income,expenses,debtPayments,obligationPayments,activeGoalContributions,targetAmount,savedAmount].map(Number);
 if(values.some(v=>!Number.isFinite(v)||v<0)) throw new Error("Invalid goal planning values");
 const [inc,exp,debt,obligations,active,target,saved]=values;
 const enoughHistory=historyDays>=60&&inc>0;
 const averageMonthlySurplus=enoughHistory?((inc-exp-debt-obligations)/historyDays)*30.4375:null;
 const availableBeforeGoals=averageMonthlySurplus===null?null:Math.max(0,averageMonthlySurplus-active);
 const safeMonthlyContribution=availableBeforeGoals===null?null:Math.floor(availableBeforeGoals*0.7);
 const remaining=Math.max(0,target-saved);
 const requiredMonthly=months&&months>0?Math.ceil(remaining/months):null;
 const estimatedMonths=safeMonthlyContribution>0?Math.ceil(remaining/safeMonthlyContribution):null;
 return {history_days:historyDays,has_enough_history:enoughHistory,average_monthly_surplus:averageMonthlySurplus===null?null:Math.round(averageMonthlySurplus),active_goal_contributions:Math.round(active),available_before_goals:availableBeforeGoals===null?null:Math.round(availableBeforeGoals),safety_factor:0.7,safe_monthly_contribution:safeMonthlyContribution,remaining_amount:Math.round(remaining),required_monthly_contribution:requiredMonthly,estimated_months:estimatedMonths,feasible:requiredMonthly===null||safeMonthlyContribution===null?null:requiredMonthly<=safeMonthlyContribution};
}