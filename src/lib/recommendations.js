export const recommendDailyWaterMl = ({
  weightKg,
  calories,
  workoutsPerWeek,
  fallback = 2000
} = {}) => {
  const contributions = []

  if (Number.isFinite(weightKg) && weightKg > 0) {
    contributions.push(weightKg * 35)
  }

  if (Number.isFinite(calories) && calories > 0) {
    contributions.push(calories * 0.35)
  }

  if (Number.isFinite(workoutsPerWeek) && workoutsPerWeek > 0) {
    contributions.push(350 * Math.min(workoutsPerWeek, 14))
  }

  const merged = contributions.length
    ? contributions.reduce((sum, value) => sum + value, 0) / contributions.length
    : fallback

  const safe = Number.isFinite(merged) && merged > 0 ? merged : fallback
  return Math.round(Math.max(1200, Math.min(safe, 5000)))
}
