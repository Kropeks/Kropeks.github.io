import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { query, queryOne, transaction } from '@/lib/db'
import { isAuthDisabled } from '@/lib/auth-utils'
import recipeAPI from '@/lib/recipeAPI'

const DEFAULT_TARGETS = {
  calories: 2000,
  protein: 150,
  carbs: 250,
  fat: 67
}

const DEFAULT_PLAN_DAYS = 7

const MEAL_ORDER = ['BREAKFAST', 'LUNCH', 'DINNER']

const NUTRIENT_KEYS = ['calories', 'protein', 'carbs', 'fat']

const MAX_SNACKS_PER_DAY = 6
const MAX_MEAL_ATTEMPTS = 10
const MAX_PORTION_MULTIPLIER = 3
const MIN_PORTION_MULTIPLIER = 1
const REMAINING_TOLERANCE = 0.5

const createEmptyTotals = () => ({ calories: 0, protein: 0, carbs: 0, fat: 0 })

const resolveUserId = async (session) => {
  if (!session?.user) {
    return null
  }

  const directId = Number.parseInt(session.user.id, 10)
  if (Number.isInteger(directId)) {
    return directId
  }

  if (session.user.email) {
    try {
      const user = await queryOne('SELECT id FROM users WHERE email = ? LIMIT 1', [session.user.email])
      const emailId = Number.parseInt(user?.id ?? user?.ID, 10)
      if (Number.isInteger(emailId)) {
        return emailId
      }
    } catch (error) {
      console.warn('Failed to resolve user ID by email:', error?.message || error)
    }

    if (isAuthDisabled) {
      const now = new Date()
      const fallbackName = session.user.name?.trim() || session.user.email.split('@')[0] || 'FitSavory User'

      try {
        const insertResult = await query(
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
          [fallbackName, session.user.email, now, now]
        )

        const insertedId = Number.parseInt(insertResult?.insertId, 10)
        if (Number.isInteger(insertedId)) {
          return insertedId
        }
      } catch (error) {
        if (error?.code !== 'ER_DUP_ENTRY') {
          console.warn('Failed to auto-create mock user:', error?.message || error)
        }
      }

      try {
        const user = await queryOne('SELECT id FROM users WHERE email = ? LIMIT 1', [session.user.email])
        const emailId = Number.parseInt(user?.id ?? user?.ID, 10)
        if (Number.isInteger(emailId)) {
          return emailId
        }
      } catch (error) {
        console.warn('Retry lookup after mock user creation failed:', error?.message || error)
      }
    }
  }

  return null
}

const parseInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const parseJson = (value, fallback) => {
  if (!value || typeof value !== 'string') return fallback
  try {
    return JSON.parse(value)
  } catch (error) {
    return fallback
  }
}

const parseNullableNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const normalizeTargets = (rawTargets, fallbackTargets = DEFAULT_TARGETS) => {
  const resolve = (value, fallback) => {
    const parsed = parseNullableNumber(value)
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback
  }

  return {
    calories: resolve(rawTargets?.calories, fallbackTargets.calories),
    protein: resolve(rawTargets?.protein, fallbackTargets.protein),
    carbs: resolve(rawTargets?.carbs, fallbackTargets.carbs),
    fat: resolve(rawTargets?.fat, fallbackTargets.fat),
    waterMl: resolve(rawTargets?.waterMl ?? rawTargets?.water_ml ?? rawTargets?.waterGoal ?? rawTargets?.water_goal, fallbackTargets.waterMl ?? fallbackTargets.water_ml ?? null)
  }
}

const parseNullableInteger = (value) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

const toDateOrNull = (value) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const differenceInDaysInclusive = (startDate, endDate) => {
  const start = toDateOrNull(startDate)
  const end = toDateOrNull(endDate)

  if (!start || !end) {
    return null
  }

  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  const diff = Math.round((endUtc - startUtc) / (24 * 60 * 60 * 1000))

  return diff >= 0 ? diff + 1 : null
}

const clampDayCount = (value) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PLAN_DAYS
  }
  return Math.max(1, Math.min(14, Math.round(parsed)))
}

const loadDietPlan = async (dietPlanId, userId) => {
  if (!Number.isInteger(dietPlanId) || !Number.isInteger(userId)) {
    return null
  }

  return await queryOne(
    `SELECT id, user_id, name, goal, plan_type, start_date, end_date, total_days, daily_calories, protein_g, carbs_g, fat_g, target_weight_kg, status
       FROM diet_plans
      WHERE id = ?
        AND user_id = ?
      LIMIT 1`,
    [dietPlanId, userId]
  )
}

const toSlug = (value) => {
  if (!value) return null
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || null
}

const formatDate = (date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const addDays = (date, days) => {
  const clone = new Date(date)
  clone.setDate(clone.getDate() + days)
  return clone
}

export async function GET(request) {
  try {
    const session = await auth()
    const userId = await resolveUserId(session)

    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const planIdParam = parseNullableInteger(searchParams.get('planId'))
    const dietPlanIdParam = parseNullableInteger(searchParams.get('dietPlanId'))

    let planRow = null

    if (Number.isInteger(planIdParam)) {
      planRow = await queryOne(
        `SELECT *
           FROM meal_plans
          WHERE id = ?
            AND user_id = ?
          LIMIT 1`,
        [planIdParam, userId]
      )
    } else if (Number.isInteger(dietPlanIdParam)) {
      planRow = await queryOne(
        `SELECT *
           FROM meal_plans
          WHERE user_id = ?
            AND diet_plan_id = ?
          ORDER BY created_at DESC
          LIMIT 1`,
        [userId, dietPlanIdParam]
      )
    } else {
      planRow = await queryOne(
        `SELECT mp.*
           FROM meal_plans mp
           LEFT JOIN diet_plans dp ON mp.diet_plan_id = dp.id
          WHERE mp.user_id = ?
          ORDER BY CASE
                     WHEN dp.status = 'active' THEN 0
                     WHEN dp.status IS NULL THEN 1
                     ELSE 2
                   END,
                   mp.created_at DESC
          LIMIT 1`,
        [userId]
      )

      if (!planRow) {
        planRow = await queryOne(
          `SELECT *
             FROM meal_plans
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 1`,
          [userId]
        )
      }
    }

    if (!planRow) {
      return NextResponse.json({ mealPlan: null, targets: null, metadata: null })
    }

    const linkedDietPlanId = parseNullableInteger(planRow?.diet_plan_id)
    const linkedDietPlan = Number.isInteger(linkedDietPlanId) ? await loadDietPlan(linkedDietPlanId, userId) : null

    const dayRows = await query(
      `SELECT *
         FROM meal_plan_days
        WHERE meal_plan_id = ?
        ORDER BY day_number ASC`,
      [planRow.id]
    )

    const dayIds = dayRows.map((day) => day.id)
    let mealRows = []

    if (dayIds.length) {
      const placeholders = dayIds.map(() => '?').join(', ')
      mealRows = await query(
        `SELECT m.*, r.title AS recipe_title, r.slug AS recipe_slug, n.calories AS recipe_calories,
                n.protein AS recipe_protein, n.carbs AS recipe_carbs, n.fats AS recipe_fat
           FROM meal_plan_meals m
           LEFT JOIN recipes r ON m.recipe_id = r.id
           LEFT JOIN nutritional_info n ON n.recipe_id = r.id
          WHERE m.day_id IN (${placeholders})
          ORDER BY m.day_id ASC, m.order ASC, m.id ASC`,
        dayIds
      )
    }

    await backfillMealNotes(mealRows)
    const response = mapPlanFromRows(planRow, dayRows, mealRows, linkedDietPlan)
    return NextResponse.json(response)
  } catch (error) {
    console.error('Error loading meal plan:', error)
    return NextResponse.json(
      { error: 'Failed to load meal plan', details: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request) {
  try {
    const session = await auth()
    const userId = await resolveUserId(session)

    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await request.json().catch(() => ({}))
    const dietPlanId = parseNullableInteger(
      payload.dietPlanId ?? payload.planId ?? payload.diet_plan_id ?? payload.diet_planId
    )

    let dietPlan = null
    if (Number.isInteger(dietPlanId)) {
      dietPlan = await loadDietPlan(dietPlanId, userId)
      if (!dietPlan) {
        return NextResponse.json({ error: 'Diet plan not found' }, { status: 404 })
      }
    }

    const dietPlanTargets = dietPlan
      ? normalizeTargets({
          calories: dietPlan.daily_calories,
          protein: dietPlan.protein_g,
          carbs: dietPlan.carbs_g,
          fat: dietPlan.fat_g
        })
      : DEFAULT_TARGETS

    const payloadTargetsInput = {
      calories: payload.calories ?? payload.targets?.calories,
      protein: payload.protein ?? payload.targets?.protein,
      carbs: payload.carbs ?? payload.targets?.carbs,
      fat: payload.fat ?? payload.targets?.fat
    }

    const targets = normalizeTargets(payloadTargetsInput, dietPlanTargets)

    const requestedDaysValue = parseNullableNumber(payload.days ?? payload.totalDays)
    const dietPlanDayCount = dietPlan
      ? differenceInDaysInclusive(dietPlan.start_date, dietPlan.end_date) ?? parseNullableNumber(dietPlan.total_days)
      : null
    const days = clampDayCount(requestedDaysValue ?? dietPlanDayCount ?? DEFAULT_PLAN_DAYS)

    const startDate = toDateOrNull(payload.startDate) ?? toDateOrNull(dietPlan?.start_date) ?? new Date()
    let endDate = toDateOrNull(payload.endDate) ?? toDateOrNull(dietPlan?.end_date)
    const inclusiveDiff = differenceInDaysInclusive(startDate, endDate)
    if (!Number.isFinite(inclusiveDiff) || inclusiveDiff < 1) {
      endDate = addDays(startDate, days - 1)
    }

    const planName = payload.name?.toString().trim() || dietPlan?.name || `FitSavory Plan (${formatDate(startDate)})`
    const generatedPlan = await generateMealPlan(targets, days)

    const planRecord = await persistMealPlan({
      userId,
      dietPlanId: dietPlan?.id ?? null,
      name: planName,
      startDate,
      endDate,
      targets,
      generatedPlan
    })

    const metadata = {
      planId: planRecord.id,
      dietPlanId: planRecord.diet_plan_id ?? null,
      dietPlan,
      targets,
      totals: generatedPlan.totals
    }

    return NextResponse.json({ ...planRecord, metadata }, { status: 201 })
  } catch (error) {
    console.error('Error creating meal plan:', error)
    return NextResponse.json(
      { error: 'Failed to create meal plan', details: error.message },
      { status: 500 }
    )
  }
}

async function persistMealPlan({ userId, dietPlanId = null, name, startDate, endDate, targets, generatedPlan }) {
  const now = new Date()

  const planId = await transaction(async (connection) => {
    const descriptionPayload = {
      source: 'FitSavory',
      generatedAt: now.toISOString(),
      targets,
      dietPlanId
    }

    const [planResult] = await connection.query(
      `INSERT INTO meal_plans (
         user_id,
         diet_plan_id,
         name,
         description,
         target_calories,
         target_protein,
         target_carbs,
         target_fat,
         start_date,
         end_date,
         is_public,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        userId,
        dietPlanId,
        name,
        JSON.stringify(descriptionPayload),
        targets.calories,
        targets.protein,
        targets.carbs,
        targets.fat,
        formatDate(startDate),
        formatDate(endDate),
        now,
        now
      ]
    )

    const planIdInserted = planResult.insertId

    for (const day of generatedPlan.mealPlan) {
      const dayDate = addDays(startDate, day.day - 1)
      const dayNotes = JSON.stringify({ totals: day.totals, waterGoalMl: day.waterGoalMl })

      const [dayResult] = await connection.query(
        `INSERT INTO meal_plan_days (
           meal_plan_id,
           day_number,
           date,
           notes
         ) VALUES (?, ?, ?, ?)`,
        [planIdInserted, day.day, formatDate(dayDate), dayNotes]
      )

      const dayId = dayResult.insertId
      const mealsForDay = flattenMeals(day)

      for (const entry of mealsForDay) {
        const notesPayload = {
          nutrition: entry.nutrition,
          source: entry.source,
          externalId: entry.externalId ?? null,
          slug: entry.slug ?? null
        }

        await connection.query(
          `INSERT INTO meal_plan_meals (
             day_id,
             meal_type,
             recipe_id,
             custom_meal_name,
             custom_meal_description,
             \`order\`,
             notes
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            dayId,
            entry.mealType,
            entry.recipeId,
            entry.name,
            entry.description,
            entry.order,
            JSON.stringify(notesPayload)
          ]
        )
      }
    }

    return planIdInserted
  })

  return await loadMealPlan(planId, userId)
}

async function loadMealPlan(planId, userId) {
  const planRow = await queryOne(
    `SELECT *
       FROM meal_plans
      WHERE id = ?
        AND user_id = ?
      LIMIT 1`,
    [planId, userId]
  )

  if (!planRow) {
    return { mealPlan: null, targets: null, metadata: null }
  }

  const linkedDietPlanId = parseNullableInteger(planRow?.diet_plan_id)
  const linkedDietPlan = Number.isInteger(linkedDietPlanId) ? await loadDietPlan(linkedDietPlanId, userId) : null

  const dayRows = await query(
    `SELECT *
       FROM meal_plan_days
      WHERE meal_plan_id = ?
      ORDER BY day_number ASC`,
    [planRow.id]
  )

  const dayIds = dayRows.map((day) => day.id)
  let mealRows = []

  if (dayIds.length) {
    const placeholders = dayIds.map(() => '?').join(', ')
    mealRows = await query(
      `SELECT m.*, r.title AS recipe_title, r.slug AS recipe_slug, n.calories AS recipe_calories,
              n.protein AS recipe_protein, n.carbs AS recipe_carbs, n.fats AS recipe_fat
         FROM meal_plan_meals m
         LEFT JOIN recipes r ON m.recipe_id = r.id
         LEFT JOIN nutritional_info n ON n.recipe_id = r.id
        WHERE m.day_id IN (${placeholders})
        ORDER BY m.day_id ASC, m.order ASC, m.id ASC`,
      dayIds
    )
  }

  await backfillMealNotes(mealRows)
  return mapPlanFromRows(planRow, dayRows, mealRows, linkedDietPlan)
}

function mapPlanFromRows(planRow, dayRows, mealRows, linkedDietPlan) {
  const description = parseJson(planRow.description, {})
  const dayMap = new Map()

  dayRows.forEach((day) => {
    const notes = parseJson(day.notes, {})
    dayMap.set(day.id, {
      day: day.day_number,
      date: day.date,
      totals: notes?.totals || { calories: 0, protein: 0, carbs: 0, fat: 0 },
      waterGoalMl: notes?.waterGoalMl || null,
      breakfast: null,
      lunch: null,
      dinner: null,
      snacks: []
    })
  })

  mealRows.forEach((meal) => {
    const notes = parseJson(meal.notes, {})
    const payload = {
      id: notes?.externalId ?? meal.recipe_id,
      title: meal.custom_meal_name || meal.recipe_title || 'Custom meal',
      description: meal.custom_meal_description || null,
      recipeSlug: meal.recipe_slug || notes?.slug || null,
      nutrition: buildNutritionPayload(notes?.nutrition, meal),
      source: notes?.source || null
    }

    const day = dayMap.get(meal.day_id)
    if (!day) return

    if (meal.meal_type === 'BREAKFAST') {
      day.breakfast = payload
    } else if (meal.meal_type === 'LUNCH') {
      day.lunch = payload
    } else if (meal.meal_type === 'DINNER') {
      day.dinner = payload
    } else {
      day.snacks.push(payload)
    }
  })

  const mealPlan = Array.from(dayMap.values()).sort((a, b) => a.day - b.day)

  const planTargets = normalizeTargets({
    calories: planRow.target_calories ?? description?.targets?.calories,
    protein: planRow.target_protein ?? description?.targets?.protein,
    carbs: planRow.target_carbs ?? description?.targets?.carbs,
    fat: planRow.target_fat ?? description?.targets?.fat
  })

  const dietPlanTargets = linkedDietPlan
    ? normalizeTargets(
        {
          calories: linkedDietPlan.daily_calories,
          protein: linkedDietPlan.protein_g,
          carbs: linkedDietPlan.carbs_g,
          fat: linkedDietPlan.fat_g
        },
        planTargets
      )
    : null

  const mergedTargets = dietPlanTargets ?? planTargets

  const dietPlanPayload = linkedDietPlan
    ? {
        id: linkedDietPlan.id,
        name: linkedDietPlan.name,
        goal: linkedDietPlan.goal,
        planType: linkedDietPlan.plan_type,
        startDate: linkedDietPlan.start_date,
        endDate: linkedDietPlan.end_date,
        totalDays: linkedDietPlan.total_days,
        targets: dietPlanTargets,
        dailyCalories: linkedDietPlan.daily_calories ? Number(linkedDietPlan.daily_calories) : null,
        targetWeightKg: linkedDietPlan.target_weight_kg ? Number(linkedDietPlan.target_weight_kg) : null,
        status: linkedDietPlan.status || 'active'
      }
    : null

  return {
    planId: planRow.id,
    name: planRow.name,
    targets: mergedTargets,
    metadata: {
      startDate: planRow.start_date,
      endDate: planRow.end_date,
      generatedAt: description.generatedAt || null,
      dietPlanId: linkedDietPlan?.id ?? null
    },
    dietPlan: dietPlanPayload,
    mealPlan
  }
}

function buildNutritionPayload(existing, mealRow) {
  if (existing) {
    return existing
  }

  return {
    calories: mealRow.recipe_calories ?? null,
    protein: mealRow.recipe_protein ?? null,
    carbs: mealRow.recipe_carbs ?? null,
    fat: mealRow.recipe_fat ?? null
  }
}

function flattenMeals(day) {
  const result = []

  MEAL_ORDER.forEach((type, index) => {
    const key = type.toLowerCase()
    const meal = day[key]
    if (!meal) return

    const recipeId = Number.isInteger(meal.localRecipeId) ? meal.localRecipeId : null

    result.push({
      mealType: type,
      recipeId,
      name: meal.title || `Untitled ${type.toLowerCase()}`,
      description: meal.description || null,
      order: index + 1,
      nutrition: meal.nutrition || null,
      source: meal.source || null,
      externalId: meal.externalId ?? meal.id ?? null,
      slug: meal.slug || null
    })
  })

  if (Array.isArray(day.snacks)) {
    day.snacks.forEach((snack, snackIndex) => {
      const recipeId = Number.isInteger(snack.localRecipeId) ? snack.localRecipeId : null

      result.push({
        mealType: 'SNACK',
        recipeId,
        name: snack.title || `Snack ${snackIndex + 1}`,
        description: snack.description || null,
        order: MEAL_ORDER.length + snackIndex + 1,
        nutrition: snack.nutrition || null,
        source: snack.source || null,
        externalId: snack.externalId ?? snack.id ?? null,
        slug: snack.slug || null
      })
    })
  }

  return result
}

const toRoundedMacro = (value) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}

const normalizeNutritionObject = (nutrition) => {
  if (!nutrition) return null
  const normalized = {
    calories: toRoundedMacro(nutrition.calories),
    protein: toRoundedMacro(nutrition.protein),
    carbs: toRoundedMacro(nutrition.carbs),
    fat: toRoundedMacro(nutrition.fat)
  }

  return hasMeaningfulNutrition(normalized) ? normalized : null
}

const buildNutritionLookupQuery = (meal) => {
  const parts = []
  if (meal?.custom_meal_name) parts.push(meal.custom_meal_name)
  if (meal?.recipe_title && meal.recipe_title !== meal.custom_meal_name) parts.push(meal.recipe_title)
  if (meal?.recipe_slug && meal.recipe_slug !== meal.custom_meal_name) parts.push(meal.recipe_slug)
  return parts.filter(Boolean).join(', ')
}

async function resolveMealNutrition(meal, notes) {
  const existing = normalizeNutritionObject(notes?.nutrition)
  if (existing) {
    return existing
  }

  const inferredSource = notes?.source || (meal?.recipe_id ? 'community' : 'mealdb')
  const identifier =
    notes?.externalId ??
    meal?.recipe_id ??
    meal?.recipe_slug ??
    meal?.custom_meal_name ??
    meal?.id ??
    null

  if (identifier) {
    try {
      const recipeDetails = await recipeAPI.getRecipeWithNutrition(identifier, inferredSource)
      const normalized = normalizeNutritionObject(recipeDetails?.nutrition)
      if (normalized) {
        return normalized
      }
    } catch (error) {
      console.warn('Failed to enrich meal nutrition via recipe lookup:', error?.message || error)
    }
  }

  const query = buildNutritionLookupQuery(meal)
  if (query) {
    try {
      const lookup = await recipeAPI.getNutritionInfo(query)
      const normalized = normalizeNutritionObject(lookup)
      if (normalized) {
        return normalized
      }
    } catch (error) {
      console.warn('Failed to estimate nutrition via keyword lookup:', error?.message || error)
    }
  }

  return null
}

async function backfillMealNotes(mealRows = []) {
  if (!Array.isArray(mealRows) || mealRows.length === 0) {
    return
  }

  const updates = []

  for (const meal of mealRows) {
    if (!meal) return
    const notes = parseJson(meal.notes, {})
    const updatedNotes = { ...notes }
    let needsUpdate = false

    if (!updatedNotes.slug) {
      const slugCandidate =
        notes?.slug ||
        meal.recipe_slug ||
        (meal.recipe_title ? toSlug(meal.recipe_title) : null) ||
        (meal.custom_meal_name ? toSlug(meal.custom_meal_name) : null)

      if (slugCandidate) {
        updatedNotes.slug = slugCandidate
        needsUpdate = true
      }
    }

    if (!updatedNotes.externalId) {
      const externalIdCandidate =
        notes?.externalId ??
        meal.recipe_id ??
        meal.recipe_slug ??
        meal.custom_meal_name ??
        meal.id

      if (externalIdCandidate !== undefined && externalIdCandidate !== null) {
        updatedNotes.externalId = externalIdCandidate
        needsUpdate = true
      }
    }

    if (!updatedNotes.source) {
      const derivedSource = notes?.source || (meal.recipe_id ? 'community' : 'mealdb')
      if (derivedSource) {
        updatedNotes.source = derivedSource
        needsUpdate = true
      }
    }

    if (!hasMeaningfulNutrition(updatedNotes.nutrition)) {
      const nutrition = await resolveMealNutrition(meal, updatedNotes)
      if (nutrition) {
        updatedNotes.nutrition = nutrition
        needsUpdate = true
      }
    }

    if (needsUpdate) {
      updates.push({ id: meal.id, notes: updatedNotes })
      meal.notes = JSON.stringify(updatedNotes)
    }
  }

  if (!updates.length) {
    return
  }

  const results = await Promise.allSettled(
    updates.map(({ id, notes }) =>
      query('UPDATE meal_plan_meals SET notes = ? WHERE id = ?', [JSON.stringify(notes), id])
    )
  )

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const failed = updates[index]
      console.warn('Failed to backfill meal notes', {
        mealPlanMealId: failed.id,
        error: result.reason?.message || result.reason
      })
    }
  })
}

async function fetchRandomCommunityRecipe(excludeDatabaseIds = new Set()) {
  try {
    const candidates = await query(
      `SELECT
         r.id,
         r.slug
       FROM recipes r
      WHERE r.is_public = 1
        AND (r.status IS NULL OR r.status IN ('active', 'published', 'approved'))
        AND (r.approval_status IS NULL OR r.approval_status IN ('approved', 'active'))
        AND (r.is_premium IS NULL OR r.is_premium = 0)
      ORDER BY RAND()
      LIMIT 5`
    )

    for (const candidate of candidates) {
      if (excludeDatabaseIds.has(candidate.id)) {
        continue
      }
      const identifier = candidate.slug || candidate.id
      const recipe = await recipeAPI.getCommunityRecipeById(identifier)
      if (recipe?.databaseId) {
        return recipe
      }
    }
  } catch (error) {
    console.warn('Failed to fetch random community recipe for meal plan generation:', error?.message || error)
  }

  return null
}

const hasMeaningfulNutrition = (nutrition) =>
  nutrition && Number.isFinite(nutrition.calories) && nutrition.calories > 0

async function normalizeMealPayload(meal) {
  if (!meal) return null

  const nutrition = meal?.nutrition || {}
  const rawId = meal?.id ?? meal?.recipeId ?? null
  const numericId = Number.parseInt(rawId, 10)
  const providedSlug = typeof meal?.slug === 'string' && meal.slug.trim() ? meal.slug.trim() : null
  const fallbackSlug = toSlug(meal?.title || meal?.strMeal || meal?.name || meal?.label || '')
  const slug = providedSlug || fallbackSlug
  const normalizedSource = typeof meal?.source === 'string' ? meal.source.toLowerCase() : null
  const explicitLocalId = Number.parseInt(meal?.localRecipeId, 10)
  const databaseLocalId = Number.parseInt(meal?.databaseId, 10)
  const isCommunityRecipe = normalizedSource === 'community'
  const localRecipeId = Number.isInteger(explicitLocalId)
    ? explicitLocalId
    : Number.isInteger(databaseLocalId)
      ? databaseLocalId
      : isCommunityRecipe && Number.isInteger(numericId)
        ? numericId
        : null

  const normalizeValue = (value) => {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? Math.round(parsed) : null
  }

  const payload = {
    id: rawId,
    localRecipeId,
    externalId: meal?.externalId ?? rawId ?? meal?.originalId ?? meal?.slug ?? null,
    slug,
    title: meal?.title || meal?.strMeal || 'Untitled meal',
    description: meal?.description || meal?.summary || null,
    nutrition: {
      calories: normalizeValue(nutrition.calories || meal?.calories),
      protein: normalizeValue(nutrition.protein || nutrition.protein_g || meal?.protein),
      carbs: normalizeValue(nutrition.carbs || nutrition.carbohydrates_total_g || meal?.carbs),
      fat: normalizeValue(nutrition.fat || nutrition.fat_total_g || meal?.fat)
    },
    source: meal?.source || meal?.url || meal?.strSource || null
  }

  if (hasMeaningfulNutrition(payload.nutrition)) {
    return payload
  }

  try {
    const ingredientQuery = typeof recipeAPI.buildNutritionQueryFromIngredients === 'function'
      ? recipeAPI.buildNutritionQueryFromIngredients(meal.ingredients || [])
      : null

    const fallbackQuery = ingredientQuery || payload.title

    if (fallbackQuery && typeof recipeAPI.getNutritionInfo === 'function') {
      const ninjasNutrition = await recipeAPI.getNutritionInfo(fallbackQuery)
      if (ninjasNutrition) {
        payload.nutrition = {
          calories: normalizeValue(ninjasNutrition.calories),
          protein: normalizeValue(ninjasNutrition.protein),
          carbs: normalizeValue(ninjasNutrition.carbs),
          fat: normalizeValue(ninjasNutrition.fat)
        }
      }
    }
  } catch (nutritionError) {
    console.warn('Failed to enrich meal nutrition via CalorieNinjas:', nutritionError?.message || nutritionError)
  }

  return payload
}

async function generateMealPlan(targets, days) {
  const meals = []
  const usedCommunityRecipeIds = new Set()

  const getCommunityMeal = async () => {
    const recipe = await fetchRandomCommunityRecipe(usedCommunityRecipeIds)
    if (!recipe) {
      return null
    }

    const normalized = await normalizeMealPayload({
      ...recipe,
      localRecipeId: recipe.databaseId ?? recipe.id,
      databaseId: recipe.databaseId ?? recipe.id,
      externalId: recipe.slug || recipe.id || recipe.databaseId?.toString()
    })

    if (recipe.databaseId && Number.isInteger(Number.parseInt(recipe.databaseId, 10))) {
      usedCommunityRecipeIds.add(Number.parseInt(recipe.databaseId, 10))
    }

    return normalized
  }

  const getMealDbMeal = async () => {
    const recipes = await recipeAPI.getRandomRecipesMealDB(1)
    if (!Array.isArray(recipes) || !recipes.length) {
      return null
    }
    return await normalizeMealPayload(recipes[0])
  }

  const getNextMealEntry = async () => {
    const communityMeal = await getCommunityMeal()
    if (communityMeal) {
      return communityMeal
    }
    return await getMealDbMeal()
  }

  for (let day = 1; day <= days; day += 1) {
    const dayMeals = {
      day,
      breakfast: null,
      lunch: null,
      dinner: null,
      snacks: [],
      totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }
    }

    try {
      const breakfastEntry = await getNextMealEntry()
      if (breakfastEntry) {
        dayMeals.breakfast = breakfastEntry
        dayMeals.totals = accumulateTotals(dayMeals.totals, breakfastEntry?.nutrition)
      }

      const lunchEntry = await getNextMealEntry()
      if (lunchEntry) {
        dayMeals.lunch = lunchEntry
        dayMeals.totals = accumulateTotals(dayMeals.totals, lunchEntry?.nutrition)
      }

      const dinnerEntry = await getNextMealEntry()
      if (dinnerEntry) {
        dayMeals.dinner = dinnerEntry
        dayMeals.totals = accumulateTotals(dayMeals.totals, dinnerEntry?.nutrition)
      }

      const snackCount = 2
      for (let snackIndex = 0; snackIndex < snackCount; snackIndex += 1) {
        const snackEntry = await getNextMealEntry()
        if (snackEntry) {
          dayMeals.snacks.push(snackEntry)
          dayMeals.totals = accumulateTotals(dayMeals.totals, snackEntry?.nutrition)
        }
      }
    } catch (error) {
      console.warn(`Failed to build day ${day} meals:`, error?.message || error)
    }

    meals.push(dayMeals)
  }

  return { targets, mealPlan: meals }
}

async function generateScaledMealPlan(targets, days) {
  const meals = []
  const usedCommunityRecipeIds = new Set()

  const getCommunityMeal = async () => {
    const recipe = await fetchRandomCommunityRecipe(usedCommunityRecipeIds)
    if (!recipe) {
      return null
    }

    const normalized = await normalizeMealPayload({
      ...recipe,
      localRecipeId: recipe.databaseId ?? recipe.id,
      databaseId: recipe.databaseId ?? recipe.id,
      externalId: recipe.slug || recipe.id || recipe.databaseId?.toString()
    })

    if (recipe.databaseId && Number.isInteger(Number.parseInt(recipe.databaseId, 10))) {
      usedCommunityRecipeIds.add(Number.parseInt(recipe.databaseId, 10))
    }

    return normalized
  }

  const getMealDbMeal = async () => {
    const recipes = await recipeAPI.getRandomRecipesMealDB(1)
    if (!Array.isArray(recipes) || !recipes.length) {
      return null
    }
    return await normalizeMealPayload(recipes[0])
  }

  const fetchCandidateMeal = async () => {
    for (let attempt = 0; attempt < MAX_MEAL_ATTEMPTS; attempt += 1) {
      const communityMeal = await getCommunityMeal()
      if (communityMeal && hasMeaningfulNutrition(communityMeal.nutrition)) {
        return communityMeal
      }

      const mealDbMeal = await getMealDbMeal()
      if (mealDbMeal && hasMeaningfulNutrition(mealDbMeal.nutrition)) {
        return mealDbMeal
      }
    }

    return null
  }

  const pickScaledMeal = async (remainingTotals) => {
    for (let attempt = 0; attempt < MAX_MEAL_ATTEMPTS; attempt += 1) {
      const candidate = await fetchCandidateMeal()
      if (!candidate) {
        continue
      }

      const scaled = scaleMealForRemaining(candidate, remainingTotals)
      if (!scaled) {
        continue
      }

      return scaled
    }

    return null
  }

  for (let day = 1; day <= days; day += 1) {
    const dayMeals = {
      day,
      breakfast: null,
      lunch: null,
      dinner: null,
      snacks: [],
      totals: createEmptyTotals()
    }

    let remaining = { ...targets }

    const assignMealSlot = async (slotKey) => {
      const result = await pickScaledMeal(remaining)
      if (!result) {
        return
      }

      dayMeals[slotKey] = result.meal
      dayMeals.totals = addTotals(dayMeals.totals, result.nutrition)
      remaining = subtractTotals(remaining, result.nutrition)
    }

    try {
      await assignMealSlot('breakfast')
      await assignMealSlot('lunch')
      await assignMealSlot('dinner')
    } catch (error) {
      console.warn(`Failed to build core meals for day ${day}:`, error?.message || error)
    }

    let snackAttempts = 0
    while (!isWithinTolerance(remaining) && dayMeals.snacks.length < MAX_SNACKS_PER_DAY) {
      snackAttempts += 1
      if (snackAttempts > MAX_SNACKS_PER_DAY * MAX_MEAL_ATTEMPTS) {
        break
      }

      const snackResult = await pickScaledMeal(remaining)
      if (!snackResult) {
        continue
      }

      dayMeals.snacks.push(snackResult.meal)
      dayMeals.totals = addTotals(dayMeals.totals, snackResult.nutrition)
      remaining = subtractTotals(remaining, snackResult.nutrition)
    }

    if (!isWithinTolerance(remaining)) {
      dayMeals.metadata = {
        ...(dayMeals.metadata || {}),
        remaining
      }
    }

    meals.push(dayMeals)
  }

  return { targets, mealPlan: meals }
}

function toNumberOrNull(value) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function accumulateTotals(totals, nutrition) {
  if (!nutrition) return totals

  const updated = { ...totals }

  if (Number.isFinite(nutrition.calories)) updated.calories += Number(nutrition.calories)
  if (Number.isFinite(nutrition.protein)) updated.protein += Number(nutrition.protein)
  if (Number.isFinite(nutrition.carbs)) updated.carbs += Number(nutrition.carbs)
  if (Number.isFinite(nutrition.fat)) updated.fat += Number(nutrition.fat)

  return updated
}

function addTotals(totals, nutrition) {
  return accumulateTotals(totals, nutrition)
}

function subtractTotals(current, nutrition) {
  const updated = {}
  NUTRIENT_KEYS.forEach((key) => {
    const base = Number(current?.[key]) || 0
    const amount = Number(nutrition?.[key]) || 0
    const next = base - amount
    updated[key] = Number.isFinite(next) && next > 0 ? next : 0
  })
  return updated
}

function multiplyNutrition(nutrition, multiplier) {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return null
  }

  const scaled = {}
  let hasPositive = false

  NUTRIENT_KEYS.forEach((key) => {
    const value = Number(nutrition?.[key])
    if (Number.isFinite(value) && value > 0) {
      const result = Math.round(value * multiplier)
      scaled[key] = result
      if (result > 0) {
        hasPositive = true
      }
    } else {
      scaled[key] = 0
    }
  })

  return hasPositive ? scaled : null
}

function fitsWithinRemaining(nutrition, remaining) {
  return NUTRIENT_KEYS.every((key) => {
    const need = Number(remaining?.[key]) || 0
    const value = Number(nutrition?.[key]) || 0
    return need + REMAINING_TOLERANCE >= value
  })
}

function isWithinTolerance(remainingTotals) {
  return NUTRIENT_KEYS.every((key) => {
    const remaining = Number(remainingTotals?.[key]) || 0
    return remaining <= REMAINING_TOLERANCE
  })
}

function scaleMealForRemaining(meal, remainingTotals) {
  if (!meal || !meal.nutrition) {
    return null
  }

  let multiplier = MAX_PORTION_MULTIPLIER
  let hasPositiveMacro = false

  for (const key of NUTRIENT_KEYS) {
    const mealValue = Number(meal.nutrition?.[key])
    if (!Number.isFinite(mealValue) || mealValue <= 0) {
      continue
    }

    hasPositiveMacro = true

    const remaining = Number(remainingTotals?.[key]) || 0
    if (remaining <= REMAINING_TOLERANCE) {
      return null
    }

    const ratio = remaining / mealValue
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return null
    }

    if (ratio < 1) {
      return null
    }

    multiplier = Math.min(multiplier, ratio)
  }

  if (!hasPositiveMacro) {
    return null
  }

  multiplier = Math.max(MIN_PORTION_MULTIPLIER, Math.min(multiplier, MAX_PORTION_MULTIPLIER))

  const scaledNutrition = multiplyNutrition(meal.nutrition, multiplier)
  if (!scaledNutrition) {
    return null
  }

  if (!fitsWithinRemaining(scaledNutrition, remainingTotals)) {
    return null
  }

  const normalizedMultiplier = Number(multiplier.toFixed(2))
  const mealPayload = {
    ...meal,
    nutrition: scaledNutrition
  }

  if (Math.abs(normalizedMultiplier - 1) > 0.01) {
    mealPayload.portionMultiplier = normalizedMultiplier
  }

  return {
    meal: mealPayload,
    nutrition: scaledNutrition
  }
}

