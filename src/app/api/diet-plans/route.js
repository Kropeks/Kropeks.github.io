import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

import { auth } from '@/auth'
import { query, queryOne, transaction } from '@/lib/db'
import { isAuthDisabled } from '@/lib/auth-utils'

const GOAL_OPTIONS = new Set([
  'weight_loss',
  'weight_gain',
  'maintain_weight',
  'build_muscle',
  'improve_health',
  'other'
])

const PLAN_TYPES = new Set(['standard', 'keto', 'mediterranean', 'paleo', 'vegan', 'custom'])
const PLAN_STATUSES = new Set(['active', 'paused', 'completed', 'cancelled'])

const differenceInDaysInclusive = (startDate, endDate) => {
  if (!startDate || !endDate) return 0
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  const diff = Math.round((endUtc - startUtc) / MS_PER_DAY)
  return diff >= 0 ? diff + 1 : 0
}

export async function DELETE(request) {
  try {
    const session = await auth()
    const userId = await resolveUserId(session)

    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const planId = searchParams.get('planId')?.trim()

    if (!planId) {
      return NextResponse.json({ error: 'dietPlanId is required' }, { status: 400 })
    }

    const plan = await queryOne(
      `SELECT id
         FROM diet_plans
        WHERE id = ?
          AND user_id = ?
        LIMIT 1`,
      [planId, userId]
    )

    if (!plan) {
      return NextResponse.json({ error: 'Diet plan not found' }, { status: 404 })
    }

    await transaction(async (connection) => {
      await connection.query(
        `DELETE FROM diet_plan_logs
          WHERE diet_plan_id = ?
            AND user_id = ?`,
        [planId, userId]
      )

      const mealPlanRows = await connection.query(
        `SELECT id
           FROM meal_plans
          WHERE diet_plan_id = ?
            AND user_id = ?`,
        [planId, userId]
      )

      const [rows] = mealPlanRows
      const mealPlanIds = Array.isArray(rows) ? rows.map((row) => row.id) : []

      if (mealPlanIds.length) {
        const placeholders = mealPlanIds.map(() => '?').join(', ')

        await connection.query(
          `DELETE FROM meal_plan_meals
             WHERE day_id IN (
               SELECT id
                 FROM meal_plan_days
                WHERE meal_plan_id IN (${placeholders})
             )`,
          mealPlanIds
        )

        await connection.query(
          `DELETE FROM meal_plan_days
             WHERE meal_plan_id IN (${placeholders})`,
          mealPlanIds
        )

        await connection.query(
          `DELETE FROM meal_plans
             WHERE id IN (${placeholders})
               AND user_id = ?`,
          [...mealPlanIds, userId]
        )
      }

      await connection.query(
        `DELETE FROM diet_plans
          WHERE id = ?
            AND user_id = ?
          LIMIT 1`,
        [planId, userId]
      )
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete diet plan:', error)
    return NextResponse.json({ error: 'Failed to delete diet plan' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const session = await auth()
    const userId = await resolveUserId(session)

    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 })
    }

    const rawPlanId = body.planId ?? body.id
    const nextStatus = body.status?.trim()

    if (!rawPlanId) {
      return NextResponse.json({ error: 'Diet plan ID is required' }, { status: 400 })
    }

    if (!nextStatus || !PLAN_STATUSES.has(nextStatus)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 })
    }

    const planId = String(rawPlanId)

    const updateResult = await query(
      `UPDATE diet_plans
          SET status = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND user_id = ?
        LIMIT 1`,
      [nextStatus, planId, userId]
    )

    if (!updateResult?.affectedRows) {
      return NextResponse.json({ error: 'Diet plan not found' }, { status: 404 })
    }

    const [plan] = await loadPlansForUser(userId, [planId])

    return NextResponse.json({ plan: plan ?? null })
  } catch (error) {
    console.error('Failed to update diet plan status:', error)
    return NextResponse.json({ error: 'Failed to update diet plan status' }, { status: 500 })
  }
}

const toDateInputString = (value) => {
  if (!value) return null
  if (typeof value === 'string') {
    if (!value.includes('T')) return value
    return value.split('T')[0]
  }
  try {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) {
      return null
    }
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  } catch (error) {
    return null
  }
}

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const clampPercentage = (value) => {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

const mapPlanRow = (row, latestLog) => {
  if (!row) return null

  const totalDaysFromRow = toNumberOrNull(row.total_days)
  const startDate = toDateInputString(row.start_date)
  const endDate = toDateInputString(row.end_date)
  const computedTotalDays = totalDaysFromRow || differenceInDaysInclusive(startDate, endDate)
  const completedDays = toNumberOrNull(row.completed_days) || 0
  const progressFromRow = row.progress_percentage !== null && row.progress_percentage !== undefined
    ? Number(row.progress_percentage)
    : null
  const derivedProgress = computedTotalDays > 0 ? (completedDays / computedTotalDays) * 100 : 0
  const progressPercentage = clampPercentage(progressFromRow ?? derivedProgress)

  return {
    id: row.id,
    name: row.name,
    description: row.description || null,
    goal: row.goal,
    planType: row.plan_type,
    startDate,
    endDate,
    dailyCalories: toNumberOrNull(row.daily_calories),
    macros: {
      protein: toNumberOrNull(row.protein_g),
      carbs: toNumberOrNull(row.carbs_g),
      fat: toNumberOrNull(row.fat_g)
    },
    targetWeightKg: toNumberOrNull(row.target_weight_kg),
    status: row.status || 'active',
    progressPercentage,
    totalDays: computedTotalDays,
    completedDays,
    adherenceRate: toNumberOrNull(row.adherence_rate),
    notes: row.notes || null,
    isTemplate: Boolean(row.is_template),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    latestLog: latestLog
      ? {
          id: latestLog.id,
          logDate: toDateInputString(latestLog.log_date),
          weightKg: toNumberOrNull(latestLog.weight_kg),
          caloriesConsumed: toNumberOrNull(latestLog.calories_consumed),
          caloriesBurned: toNumberOrNull(latestLog.calories_burned),
          protein: toNumberOrNull(latestLog.protein_g),
          carbs: toNumberOrNull(latestLog.carbs_g),
          fat: toNumberOrNull(latestLog.fat_g),
          waterMl: toNumberOrNull(latestLog.water_ml),
          workoutDurationMinutes: toNumberOrNull(latestLog.workout_duration_minutes),
          sleepHours: toNumberOrNull(latestLog.sleep_hours),
          energyLevel: toNumberOrNull(latestLog.energy_level),
          mood: latestLog.mood || null,
          notes: latestLog.notes || null
        }
      : null
  }
}

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

const loadPlansForUser = async (userId, specificPlanIds = []) => {
  try {
    const params = [userId]
    let planQuery = `SELECT *
                       FROM diet_plans
                      WHERE user_id = ?`

    if (specificPlanIds.length) {
      const placeholders = specificPlanIds.map(() => '?').join(', ')
      planQuery += ` AND id IN (${placeholders})`
      params.push(...specificPlanIds)
    }

    planQuery += ' ORDER BY created_at DESC'

    const planRows = await query(planQuery, params)
    if (!planRows.length) {
      return []
    }

    const planIds = planRows.map((plan) => plan.id)
    let logsByPlan = {}

    if (planIds.length) {
      const logPlaceholders = planIds.map(() => '?').join(', ')
      const logRows = await query(
        `SELECT *
           FROM diet_plan_logs
          WHERE diet_plan_id IN (${logPlaceholders})
          ORDER BY log_date DESC`
      , planIds)

      logsByPlan = logRows.reduce((acc, log) => {
        if (!acc[log.diet_plan_id]) {
          acc[log.diet_plan_id] = log
        }
        return acc
      }, {})
    }

    return planRows.map((row) => mapPlanRow(row, logsByPlan[row.id]))
  } catch (error) {
    const code = error?.code
    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_TABLE_ERROR') {
      console.warn('Diet plan tables are not present yet, returning empty list.')
      return []
    }

    if (code === 'ER_BAD_FIELD_ERROR') {
      console.warn('Diet plan schema mismatch detected, returning empty list.')
      return []
    }

    throw error
  }
}

export async function GET() {
  try {
    const session = await auth()
    const userId = await resolveUserId(session)

    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const plans = await loadPlansForUser(userId)
    return NextResponse.json({ plans })
  } catch (error) {
    console.error('Failed to load diet plans:', error)
    return NextResponse.json({ error: 'Failed to load diet plans' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const session = await auth()
    const userId = await resolveUserId(session)

    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 })
    }

    const name = body.name?.trim()
    const description = body.description?.trim() || null
    const goal = body.goal?.trim()
    const planType = body.planType?.trim() || 'standard'
    const startDate = body.startDate?.trim()
    const endDate = body.endDate?.trim() || null
    const dailyCalories = Number.parseInt(body.dailyCalories, 10)
    const targetWeightKg = toNumberOrNull(body.targetWeightKg)
    const notes = body.notes?.trim() || null

    if (!name) {
      return NextResponse.json({ error: 'Plan name is required' }, { status: 400 })
    }

    if (!goal || !GOAL_OPTIONS.has(goal)) {
      return NextResponse.json({ error: 'Invalid goal selection' }, { status: 400 })
    }

    if (!planType || !PLAN_TYPES.has(planType)) {
      return NextResponse.json({ error: 'Invalid plan type selection' }, { status: 400 })
    }

    if (!startDate) {
      return NextResponse.json({ error: 'Start date is required' }, { status: 400 })
    }

    const start = new Date(startDate)
    if (Number.isNaN(start.getTime())) {
      return NextResponse.json({ error: 'Start date is invalid' }, { status: 400 })
    }

    let normalizedEndDate = null
    if (endDate) {
      const end = new Date(endDate)
      if (Number.isNaN(end.getTime())) {
        return NextResponse.json({ error: 'End date is invalid' }, { status: 400 })
      }
      if (end < start) {
        return NextResponse.json({ error: 'End date cannot be before start date' }, { status: 400 })
      }
      normalizedEndDate = endDate
    }

    if (!Number.isFinite(dailyCalories) || dailyCalories <= 0) {
      return NextResponse.json({ error: 'Daily calories must be a positive number' }, { status: 400 })
    }

    const macros = body.macros || {}
    const protein = toNumberOrNull(macros.protein)
    const carbs = toNumberOrNull(macros.carbs)
    const fat = toNumberOrNull(macros.fat)

    const totalDays = normalizedEndDate ? differenceInDaysInclusive(startDate, normalizedEndDate) : 0
    const planId = randomUUID()

    await query(
      `INSERT INTO diet_plans (
         id,
         user_id,
         name,
         description,
         goal,
         plan_type,
         start_date,
         end_date,
         daily_calories,
         protein_g,
         carbs_g,
         fat_g,
         target_weight_kg,
         notes,
         total_days
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        planId,
        userId,
        name,
        description,
        goal,
        planType,
        startDate,
        normalizedEndDate,
        dailyCalories,
        protein,
        carbs,
        fat,
        targetWeightKg,
        notes,
        totalDays
      ]
    )

    const [plan] = await loadPlansForUser(userId, [planId])

    return NextResponse.json({ plan }, { status: 201 })
  } catch (error) {
    console.error('Failed to create diet plan:', error)
    return NextResponse.json({ error: 'Failed to create diet plan' }, { status: 500 })
  }
}
