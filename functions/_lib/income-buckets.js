export const DEFAULT_INCOME_BUCKETS = [
  { title: "Жильё", percentage: 30, bucket_type: "spending" },
  { title: "Питание", percentage: 20, bucket_type: "spending" },
  { title: "Долги и обязательства", percentage: 20, bucket_type: "spending" },
  { title: "Капитал", percentage: 10, bucket_type: "capital" },
  { title: "Коты", percentage: 5, bucket_type: "spending" },
  { title: "Транспорт", percentage: 5, bucket_type: "spending" },
  { title: "Здоровье и уход", percentage: 5, bucket_type: "spending" },
  { title: "Свободные расходы", percentage: 5, bucket_type: "spending" }
];

export function allocateIncome(amount, buckets) {
  const total = Number(amount);
  if (!Number.isFinite(total) || total <= 0) throw new Error("Invalid income amount");
  const active = buckets.filter(bucket => Number(bucket.active ?? 1) === 1 && Number(bucket.percentage) > 0);
  const percentageTotal = active.reduce((sum, bucket) => sum + Number(bucket.percentage), 0);
  if (Math.abs(percentageTotal - 100) > 0.0001) throw new Error("Income bucket percentages must total 100%");
  let allocated = 0;
  return active.map((bucket, index) => {
    const value = index === active.length - 1
      ? Math.round((total - allocated) * 100) / 100
      : Math.round(total * Number(bucket.percentage)) / 100;
    allocated += value;
    return { bucket_id: bucket.id, percentage: Number(bucket.percentage), amount: value };
  });
}

export function calculateBucketBalances(buckets, allocations, expenses) {
  return buckets.map(bucket => {
    const allocated = allocations.filter(row => row.bucket_id === bucket.id).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const spent = expenses.filter(row => row.bucket_id === bucket.id).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return { ...bucket, allocated: Math.round(allocated * 100) / 100, spent: Math.round(spent * 100) / 100, balance: Math.round((allocated - spent) * 100) / 100 };
  });
}


export function normalizeBucketTitle(value) {
  const title = String(value ?? "").trim();
  if (title.length < 2 || title.length > 60) {
    throw new Error("Bucket title must contain 2 to 60 characters");
  }
  return title;
}
