export const computeConsecutiveDayStreak = ({
  completedDates,
  todayIso,
  dateFormatter = (value) => value
}) => {
  if (!Array.isArray(completedDates) || !completedDates.length) {
    return 0
  }

  const normalized = new Set(
    completedDates
      .map((value) => dateFormatter(value))
      .filter((value) => typeof value === 'string' && value.length)
  )

  if (!normalized.size) {
    return 0
  }

  const today = todayIso ?? new Date().toISOString().slice(0, 10)
  const cursor = new Date(today)
  if (Number.isNaN(cursor.getTime())) {
    return 0
  }

  let streak = 0
  while (true) {
    const iso = cursor.toISOString().slice(0, 10)
    if (!normalized.has(iso)) {
      break
    }
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return streak
}
