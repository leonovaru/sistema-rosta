export function suggestAdjustedEstimate(baseMinutes, accuracy, scopeKey = null) {
  const base = Number(baseMinutes);
  if (!Number.isFinite(base) || base < 5 || base > 10000) return null;
  const scoped = scopeKey ? (accuracy?.by_area || []).find(row => row.key === scopeKey) : null;
  const source = scoped?.recommended_estimate_multiplier != null ? scoped : accuracy?.overall;
  if (!source || source.recommended_estimate_multiplier == null || source.sample_count < (accuracy?.minimum_samples || 3)) return null;
  const multiplier = Number(source.recommended_estimate_multiplier);
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null;
  const suggestedMinutes = Math.max(5, Math.min(10000, Math.round(base * multiplier / 5) * 5));
  return {
    base_minutes: Math.round(base),
    suggested_minutes: suggestedMinutes,
    multiplier,
    sample_count: source.sample_count,
    scope: source === scoped ? "specific" : "overall",
    title: source === scoped ? scoped.title : "вся история задач"
  };
}
