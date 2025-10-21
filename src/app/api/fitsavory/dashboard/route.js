import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { query, queryOne } from '@/lib/db'
import { isAuthDisabled } from '@/lib/auth-utils'

const DEFAULT_TARGETS = {
  calories: 2000,
  protein: 150,
  carbs: 250,
  fat: 67,
  waterMl: 2000
}

const normalizeDate = (value) => {
  if (!value) return null
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const asString = value.toString()
  return asString.includes('T') ? asString.split('T')[0] : asString
}

const aggregateLogDaySummaries = (logs) => {
  if (!Array.isArray(logs) || !logs.length) return []

  const dayMap = new Map()

  const resolveDate = (log) =>
    normalizeDate(
      log?.log_date ??
        log?.logDate ??
        log?.date ??
        log?.created_at ??
        log?.createdAt ??
        null
    )

  const ensureEntry = (date) => {
    if (!dayMap.has(date)) {
      dayMap.set(date, { calories: 0, protein: 0, carbs: 0, fat: 0, waterGoalMl: null })
    }
    return dayMap.get(date)
  }

  logs.forEach((log) => {
    const date = resolveDate(log)
    if (!date) return

    const entry = ensureEntry(date)

    const addMetric = (key, ...candidates) => {
      for (const candidate of candidates) {
        const numeric = Number(candidate)
        if (Number.isFinite(numeric)) {
          entry[key] += numeric
          return
        }
      }
    }

    addMetric('calories', log?.calories_consumed, log?.caloriesConsumed, log?.totals?.calories)
    addMetric('protein', log?.protein_g, log?.protein, log?.totals?.protein)
    addMetric('carbs', log?.carbs_g, log?.carbs, log?.totals?.carbs)
    addMetric('fat', log?.fat_g, log?.fat, log?.totals?.fat)

    const waterGoal = parseWaterGoal(log?.waterGoalMl ?? log?.water_goal_ml ?? log?.goalMl ?? log?.goal_ml)
    if (waterGoal) {
      entry.waterGoalMl = waterGoal
    }
  })

  return Array.from(dayMap.entries())
    .map(([date, totals]) => ({
      date,
      totals: {
        calories: Math.round(totals.calories),
        protein: Math.round(totals.protein),
        carbs: Math.round(totals.carbs),
        fat: Math.round(totals.fat)
      },
      waterGoalMl: totals.waterGoalMl
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

const MEAL_TYPE_ORDER = ['BREAKFAST', 'LUNCH', 'DINNER']

const safeNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const normalizeTargets = (targets = {}) => ({
  calories: safeNumber(targets.calories) ?? DEFAULT_TARGETS.calories,
  protein: safeNumber(targets.protein) ?? DEFAULT_TARGETS.protein,
  carbs: safeNumber(targets.carbs) ?? DEFAULT_TARGETS.carbs,
  fat: safeNumber(targets.fat) ?? DEFAULT_TARGETS.fat,
  waterMl:
    safeNumber(targets.waterMl ?? targets.water_ml ?? targets.waterGoal ?? targets.water_goal) ?? DEFAULT_TARGETS.waterMl
})

const parseWaterGoal = (value) => {
  const numeric = safeNumber(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null
  }
  return Math.round(numeric)
}

const parseJson = (value, fallback = {}) => {
  if (!value || typeof value !== 'string') return fallback
  try {
    return JSON.parse(value)
  } catch (error) {
    return fallback
  }
}

const safeQuery = async (sql, params = []) => {
  try {
    return await query(sql, params)
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      console.warn('Dashboard query skipped due to missing table:', error?.sqlMessage || error?.message || error)
      return []
    }
    throw error
  }
}

const resolveUserId = async (session) => {
  const rawId = session?.user?.id
  if (rawId && rawId.toString().trim()) {
    return rawId.toString().trim()
  }

  const email = session?.user?.email
  if (!email) {
    return null
  }

  try {
    const user = await queryOne('SELECT id FROM users WHERE email = ? LIMIT 1', [email])
    const emailId = user?.id ?? user?.ID
    if (emailId) {
      return emailId.toString().trim()
    }
  } catch (error) {
    console.warn('Failed to resolve user ID by email:', error?.message || error)
  }

  if (!isAuthDisabled) {
    return null
  }

  const now = new Date()
  const fallbackName = session.user.name?.trim() || email.split('@')[0] || 'FitSavory User'

  try {
    await query(
      `INSERT INTO users (
         name,
         email,
         role,
         email_verified,
         subscription_status,
         created_at,
         updated_at,
         is_verified
       ) VALUES (?, ?, 'USER', 0, 'none', ?, ?, 0)`,
      [fallbackName, email, now, now]
    )
  } catch (error) {
    if (error?.code !== 'ER_DUP_ENTRY') {
      console.warn('Failed to auto-create user during dashboard resolve:', error?.message || error)
    }
  }

  try {
    const user = await queryOne('SELECT id FROM users WHERE email = ? LIMIT 1', [email])
    const emailId = user?.id ?? user?.ID
    if (emailId) {
      return emailId.toString().trim()
    }
  } catch (error) {
    console.warn('Retry lookup after mock user creation failed:', error?.message || error)
  }

  return null
}

const accumulateTotals = (totals, dayTotals) => {
  if (!dayTotals) return totals

  const updated = { ...totals }
  if (Number.isFinite(dayTotals.calories)) updated.calories += Number(dayTotals.calories)
  if (Number.isFinite(dayTotals.protein)) updated.protein += Number(dayTotals.protein)
  if (Number.isFinite(dayTotals.carbs)) updated.carbs += Number(dayTotals.carbs)
  if (Number.isFinite(dayTotals.fat)) updated.fat += Number(dayTotals.fat)
  return updated
}

const percentageOf = (value, target) => {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) {
    return null
  }
  return Math.round((Number(value) / Number(target)) * 100)
}

const mapMealRow = (row) => {
  const notes = parseJson(row.notes)
  const nutrition = notes?.nutrition || {}
  return {
    id: row.recipe_id || notes?.externalId || null,
    mealType: row.meal_type,
    dayNumber: row.day_number,
    date: row.date ?? null,
    title: row.custom_meal_name || row.recipe_title || 'Custom meal',
    nutrition: {
      calories: safeNumber(nutrition.calories ?? row.recipe_calories),
      protein: safeNumber(nutrition.protein ?? row.recipe_protein),
      carbs: safeNumber(nutrition.carbs ?? row.recipe_carbs),
      fat: safeNumber(nutrition.fat ?? row.recipe_fat)
    },
    source: notes?.source || null
  }
}

const summarizeLogs = (logs) => {
  if (!logs.length) {
    return {
      count: 0,
      averages: null,
      totals: null,
      lastEntry: null,
      dailyLogs: []
    }
  }

  const sums = {
    caloriesConsumed: 0,
    caloriesBurned: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    waterMl: 0
  }

  let entriesWithValue = {
    caloriesConsumed: 0,
    caloriesBurned: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    waterMl: 0
  }

  logs.forEach((log) => {
    const addIfNumber = (key, value) => {
      if (Number.isFinite(value)) {
        sums[key] += Number(value)
        entriesWithValue[key] += 1
      }
    }

    addIfNumber('caloriesConsumed', log.calories_consumed ?? log.caloriesConsumed)
    addIfNumber('caloriesBurned', log.calories_burned ?? log.caloriesBurned)
    addIfNumber('protein', log.protein_g ?? log.protein)
    addIfNumber('carbs', log.carbs_g ?? log.carbs)
    addIfNumber('fat', log.fat_g ?? log.fat)
    addIfNumber('waterMl', log.water_ml ?? log.waterMl)
  })

  const averages = Object.fromEntries(
    Object.keys(sums).map((key) => {
      const count = entriesWithValue[key]
      return [key, count > 0 ? Math.round((sums[key] / count) * 10) / 10 : null]
    })
  )

  const dailyLogs = logs.slice(0, 14).map((log) => ({
    id: log.id ?? log.log_id ?? null,
    date: normalizeDate(log.log_date ?? log.logDate ?? log.date ?? null),
    caloriesConsumed: safeNumber(log.calories_consumed ?? log.caloriesConsumed),
    caloriesBurned: safeNumber(log.calories_burned ?? log.caloriesBurned),
    protein: safeNumber(log.protein_g ?? log.protein),
    carbs: safeNumber(log.carbs_g ?? log.carbs),
    fat: safeNumber(log.fat_g ?? log.fat),
    waterMl: safeNumber(log.water_ml ?? log.waterMl)
  }))

  return {
    count: logs.length,
    totals: sums,
    averages,
    lastEntry: logs[0] ?? null,
    dailyLogs
  }
}

const safeQueryOne = async (sql, params = []) => {
  try {
    return await queryOne(sql, params)
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      console.warn('Dashboard single-row query skipped due to missing table:', error?.sqlMessage || error?.message || error)
      return null
    }
    throw error
  }
}

const normalizeNumericId = (value) => {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const loadDashboardData = async (userId) => {
  const latestPlan = await queryOne(
    `SELECT *
       FROM meal_plans
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  )

  if (!latestPlan) {
    const fallbackDietPlan = await safeQueryOne(
      `SELECT *
         FROM diet_plans
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId]
    )

    const fallbackDietPlanId = normalizeNumericId(fallbackDietPlan?.id)

    const dietPlanLogs = fallbackDietPlanId
      ? await safeQuery(
          `SELECT *
             FROM diet_plan_logs
            WHERE user_id = ?
              AND diet_plan_id = ?
            ORDER BY log_date DESC
            LIMIT 60`,
          [userId, fallbackDietPlanId]
        )
      : []

    const logSummary = summarizeLogs(dietPlanLogs)
    const logDaySummaries = aggregateLogDaySummaries(dietPlanLogs)

    return {
      planSummary: {
        planId: null,
        name: fallbackDietPlan?.name ?? 'Recent Intake',
        startDate: fallbackDietPlan?.start_date ?? null,
        endDate: fallbackDietPlan?.end_date ?? null,
        totalDays: logDaySummaries.length,
        targets: fallbackDietPlan
          ? normalizeTargets({
              calories: fallbackDietPlan.daily_calories,
              protein: fallbackDietPlan.protein_g,
              carbs: fallbackDietPlan.carbs_g,
              fat: fallbackDietPlan.fat_g
            })
          : DEFAULT_TARGETS,
        daySummaries: [],
        consumptionDaySummaries: logDaySummaries
      },
      macroSummary: null,
      goalStats: null,
      nutritionTargets: fallbackDietPlan
        ? normalizeTargets({
            calories: fallbackDietPlan.daily_calories,
            protein: fallbackDietPlan.protein_g,
            carbs: fallbackDietPlan.carbs_g,
            fat: fallbackDietPlan.fat_g
          })
        : DEFAULT_TARGETS,
      recentMeals: [],
      nutritionProfile: {
        logs: {
          count: logSummary.count,
          averages: logSummary.averages,
          totals: logSummary.totals,
          lastEntry: logSummary.lastEntry
        }
      },
      activeDietPlan: fallbackDietPlan
        ? {
            id: fallbackDietPlan.id,
            name: fallbackDietPlan.name ?? null,
            startDate: fallbackDietPlan.start_date ?? null,
            endDate: fallbackDietPlan.end_date ?? null,
            totalDays: fallbackDietPlan.total_days ?? null,
            status: fallbackDietPlan.status ?? null
          }
        : null
    }
  }

  const planTargets = normalizeTargets(parseJson(latestPlan.description)?.targets)
  const dietPlanId = normalizeNumericId(latestPlan.diet_plan_id)

  const activeDietPlan = dietPlanId
    ? await safeQueryOne(
        `SELECT id, name, start_date, end_date, total_days, status, daily_calories, protein_g, carbs_g, fat_g
           FROM diet_plans
          WHERE id = ?
            AND user_id = ?
          LIMIT 1`,
        [dietPlanId, userId]
      )
    : null

  const resolvedTargets = activeDietPlan
    ? normalizeTargets({
        calories: activeDietPlan.daily_calories,
        protein: activeDietPlan.protein_g,
        carbs: activeDietPlan.carbs_g,
        fat: activeDietPlan.fat_g
      })
    : planTargets

  const dayRows = await safeQuery(
    `SELECT id, day_number, date, notes
       FROM meal_plan_days
      WHERE meal_plan_id = ?
      ORDER BY day_number ASC`,
    [latestPlan.id]
  )

  const daySummaries = dayRows.map((row) => {
    const notes = parseJson(row.notes)
    const totals = notes?.totals || {}
    const waterGoal = parseWaterGoal(notes?.waterGoalMl ?? notes?.water_goal_ml ?? notes?.waterGoal)
    return {
      dayNumber: row.day_number,
      date: normalizeDate(row.date),
      totals: {
        calories: safeNumber(totals.calories) ?? 0,
        protein: safeNumber(totals.protein) ?? 0,
        carbs: safeNumber(totals.carbs) ?? 0,
        fat: safeNumber(totals.fat) ?? 0
      },
      waterGoalMl: waterGoal
    }
  })

  const planAggregatedTotals = daySummaries.reduce(
    (acc, day) => accumulateTotals(acc, day.totals),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )

  const daysCount = daySummaries.length

  const planAverageDayTotals = daysCount
    ? {
        calories: Math.round(planAggregatedTotals.calories / daysCount),
        protein: Math.round(planAggregatedTotals.protein / daysCount),
        carbs: Math.round(planAggregatedTotals.carbs / daysCount),
        fat: Math.round(planAggregatedTotals.fat / daysCount)
      }
    : null

  const buildGoalEntry = (current, target) => {
    const roundedCurrent = Number.isFinite(current) ? Math.round(current) : null
    const roundedTarget = Number.isFinite(target) ? Math.round(target) : null
    const percentage =
      roundedCurrent != null && roundedTarget != null
        ? percentageOf(roundedCurrent, roundedTarget)
        : null

    return {
      current: roundedCurrent,
      target: roundedTarget,
      percentage
    }
  }

  const computeGoalStats = (averages) => {
    if (!averages) return null
    return {
      calories: buildGoalEntry(averages.calories, resolvedTargets.calories),
      protein: buildGoalEntry(averages.protein, resolvedTargets.protein),
      carbs: buildGoalEntry(averages.carbs, resolvedTargets.carbs),
      fat: buildGoalEntry(averages.fat, resolvedTargets.fat)
    }
  }

  let goalStats = computeGoalStats(planAverageDayTotals)

  const todayIso = new Date().toISOString().split('T')[0]
  const planDaySummaryToday = daySummaries.find((day) => day?.date === todayIso) || null

  let activeDaySource = 'plan'
  let activeDaySummary = planDaySummaryToday || daySummaries[0] || { dayNumber: null, date: todayIso, totals: { calories: 0, protein: 0, carbs: 0, fat: 0 } }

  let currentDayTotals = {
    calories: Math.round(activeDaySummary?.totals?.calories ?? 0),
    protein: Math.round(activeDaySummary?.totals?.protein ?? 0),
    carbs: Math.round(activeDaySummary?.totals?.carbs ?? 0),
    fat: Math.round(activeDaySummary?.totals?.fat ?? 0)
  }

  const mealRows = await safeQuery(
    `SELECT m.*, d.day_number, d.date, r.title AS recipe_title, r.slug AS recipe_slug,
            n.calories AS recipe_calories, n.protein AS recipe_protein,
            n.carbs AS recipe_carbs, n.fats AS recipe_fat
       FROM meal_plan_meals m
       JOIN meal_plan_days d ON d.id = m.day_id
       LEFT JOIN recipes r ON m.recipe_id = r.id
       LEFT JOIN nutritional_info n ON n.recipe_id = r.id
      WHERE d.meal_plan_id = ?
      ORDER BY d.day_number DESC, m.order ASC
      LIMIT 24`,
    [latestPlan.id]
  )

  const recentMeals = mealRows
    .map(mapMealRow)
    .sort((a, b) => {
      if (a.dayNumber === b.dayNumber) {
        const aIndex = MEAL_TYPE_ORDER.indexOf(a.mealType)
        const bIndex = MEAL_TYPE_ORDER.indexOf(b.mealType)
        return bIndex - aIndex
      }
      return b.dayNumber - a.dayNumber
    })
    .slice(0, 9)

  const logRows = dietPlanId
    ? await safeQuery(
        `SELECT *
           FROM diet_plan_logs
          WHERE user_id = ?
            AND diet_plan_id = ?
          ORDER BY log_date DESC
          LIMIT 60`,
        [userId, dietPlanId]
      )
    : []

  const logSummary = summarizeLogs(logRows)
  const logDaySummaries = aggregateLogDaySummaries(logRows)

  const logAggregatedTotals = logDaySummaries.reduce(
    (acc, day) => accumulateTotals(acc, day.totals),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )

  const logDaysCount = logDaySummaries.length

  const logAverageDayTotals = logDaysCount
    ? {
        calories: Math.round(logAggregatedTotals.calories / logDaysCount),
        protein: Math.round(logAggregatedTotals.protein / logDaysCount),
        carbs: Math.round(logAggregatedTotals.carbs / logDaysCount),
        fat: Math.round(logAggregatedTotals.fat / logDaysCount)
      }
    : null

  const logDaySummaryToday = logDaySummaries.find((day) => day?.date === todayIso) || null
  if (logDaySummaryToday) {
    activeDaySource = 'logged'
    activeDaySummary = { ...activeDaySummary, date: logDaySummaryToday.date ?? activeDaySummary?.date ?? todayIso, totals: logDaySummaryToday.totals }
    currentDayTotals = {
      calories: Math.round(logDaySummaryToday.totals.calories ?? 0),
      protein: Math.round(logDaySummaryToday.totals.protein ?? 0),
      carbs: Math.round(logDaySummaryToday.totals.carbs ?? 0),
      fat: Math.round(logDaySummaryToday.totals.fat ?? 0)
    }
  }

  const effectiveAggregatedTotals = logDaysCount ? logAggregatedTotals : planAggregatedTotals
  const effectiveAverageTotals = logAverageDayTotals ?? planAverageDayTotals

  goalStats = computeGoalStats(effectiveAverageTotals)

  const macroPercentages = {
    calories: percentageOf(currentDayTotals.calories, resolvedTargets.calories),
    protein: percentageOf(currentDayTotals.protein, resolvedTargets.protein),
    carbs: percentageOf(currentDayTotals.carbs, resolvedTargets.carbs),
    fat: percentageOf(currentDayTotals.fat, resolvedTargets.fat)
  }

  return {
    planSummary: {
      planId: latestPlan.id,
      name: latestPlan.name,
      startDate: latestPlan.start_date,
      endDate: latestPlan.end_date,
      totalDays: daySummaries.length,
      targets: resolvedTargets,
      averagePlanTotals: planAverageDayTotals,
      averageLoggedTotals: logAverageDayTotals,
      daySummaries,
      consumptionDaySummaries: logDaySummaries
    },
    macroSummary: {
      targets: resolvedTargets,
      planAverages: effectiveAverageTotals,
      planReferenceAverages: planAverageDayTotals,
      percentages: macroPercentages,
      activeDay: {
        dayNumber: activeDaySummary?.dayNumber ?? null,
        date: activeDaySummary?.date ?? null,
        source: activeDaySource,
        totals: currentDayTotals
      },
      totals: effectiveAggregatedTotals,
      planTotals: planAggregatedTotals,
      loggedTotals: logAggregatedTotals
    },
    goalStats,
    nutritionTargets: resolvedTargets,
    recentMeals,
    nutritionProfile: {
      logs: logSummary,
      hydration: {
        averageWaterMl: logSummary.averages?.waterMl ?? null
      },
      sleep: {
        averageHours: logSummary.averages?.sleepHours ?? null
      },
      energy: {
        averageLevel: logSummary.averages?.energyLevel ?? null
      }
    },
    activeDietPlan: activeDietPlan
      ? {
          id: activeDietPlan.id,
          name: activeDietPlan.name ?? null,
          startDate: activeDietPlan.start_date ?? null,
          endDate: activeDietPlan.end_date ?? null,
          totalDays: activeDietPlan.total_days ?? null,
          status: activeDietPlan.status ?? null
        }
      : null
  }
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = await resolveUserId(session)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dashboardData = await loadDashboardData(userId)
    return NextResponse.json(dashboardData)
  } catch (error) {
    console.error('Failed to load FitSavory dashboard data:', error)
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 })
  }
}
