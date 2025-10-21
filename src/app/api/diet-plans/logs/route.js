import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

import { auth } from '@/auth'
import { query, queryOne } from '@/lib/db'
import { isAuthDisabled } from '@/lib/auth-utils'

const PLAN_TABLE = 'diet_plans'
const LOG_TABLE = 'diet_plan_logs'

const differenceInDaysInclusive = (startDate, endDate) => {
  if (!startDate || !endDate) {
    return 0
  }

  const start = startDate instanceof Date ? startDate : new Date(startDate)
  const end = endDate instanceof Date ? endDate : new Date(endDate)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  const diff = Math.round((endUtc - startUtc) / MS_PER_DAY)
  return diff >= 0 ? diff + 1 : 0
}

const clampPercentage = (value) => {
  if (!Number.isFinite(value)) {
    return 0
  }

  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

const resolveUserId = async (session) => {
  const rawId = session?.user?.id
  if (rawId) {
    const trimmed = rawId.toString().trim()
    if (trimmed.length) {
      return trimmed
    }
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
         id,
         name,
         email,
         role,
         email_verified,
         subscription_status,
         created_at,
         updated_at,
         is_verified
       ) VALUES (?, ?, ?, 'USER', 0, 'none', ?, ?, 0)`,
      [randomUUID(), fallbackName, email, now, now]
    )
  } catch (error) {
    if (error?.code !== 'ER_DUP_ENTRY') {
      console.warn('Failed to auto-create mock user:', error?.message || error)
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

const formatDateColumn = (value) => {
  if (!value) return null
  if (value instanceof Date) {
    return value.toISOString().split('T')[0]
  }

  try {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0]
    }
  } catch (error) {
    // Ignore parsing issues, fall through to null
  }

  return null
}

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const mapLogRow = (row) => {
  if (!row) return null
  return {
    id: row.id,
    planId: row.diet_plan_id,
    userId: row.user_id,
    logDate: formatDateColumn(row.log_date),
    weightKg: row.weight_kg !== null ? Number(row.weight_kg) : null,
    caloriesConsumed: row.calories_consumed !== null ? Number(row.calories_consumed) : null,
    caloriesBurned: row.calories_burned !== null ? Number(row.calories_burned) : null,
    protein: row.protein_g !== null ? Number(row.protein_g) : null,
    carbs: row.carbs_g !== null ? Number(row.carbs_g) : null,
    fat: row.fat_g !== null ? Number(row.fat_g) : null,
    waterMl: row.water_ml !== null ? Number(row.water_ml) : null,
    workoutDurationMinutes: row.workout_duration_minutes !== null ? Number(row.workout_duration_minutes) : null,
    notes: row.notes ?? null,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null
  }
}

const ensurePlanExists = async (planId, userId) => {
  if (!planId || !userId) {
    return null
  }

  const plan = await queryOne(
    `SELECT id, user_id, start_date, end_date, total_days
       FROM ${PLAN_TABLE}
      WHERE id = ?
        AND user_id = ?
      LIMIT 1`,
    [planId, userId]
  )

  return plan ?? null
}

const loadLogById = async (logId) => {
  if (!logId) {
    return null
  }

  return await queryOne(
    `SELECT *
       FROM ${LOG_TABLE}
      WHERE id = ?
      LIMIT 1`,
    [logId]
  )
}

const countCompletedDays = async (planId, userId) => {
  const result = await queryOne(
    `SELECT COUNT(*) AS completed_days
       FROM (
              SELECT log_date
                FROM ${LOG_TABLE}
               WHERE diet_plan_id = ?
                 AND user_id = ?
               GROUP BY log_date
            ) AS distinct_days`,
    [planId, userId]
  )

  const completedDays = Number(result?.completed_days ?? 0)
  return Number.isFinite(completedDays) ? completedDays : 0
}

const computeProgressPercentage = ({ completedDays, totalDays, startDate, endDate }) => {
  let denominator = Number(totalDays)

  if (!Number.isFinite(denominator) || denominator <= 0) {
    const inclusiveDiff = differenceInDaysInclusive(startDate, endDate)
    denominator = inclusiveDiff > 0 ? inclusiveDiff : 0
  }

  if (!Number.isFinite(denominator) || denominator <= 0) {
    return clampPercentage(0)
  }

  const percentage = (completedDays / denominator) * 100
  return clampPercentage(percentage)
}

const refreshPlanProgress = async (plan) => {
  if (!plan?.id || !plan?.user_id) {
    return null
  }

  const completedDays = await countCompletedDays(plan.id, plan.user_id)
  const progressPercentage = computeProgressPercentage({
    completedDays,
    totalDays: Number(plan.total_days),
    startDate: plan.start_date,
    endDate: plan.end_date ?? new Date()
  })

  await query(
    `UPDATE ${PLAN_TABLE}
        SET completed_days = ?,
            progress_percentage = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND user_id = ?
      LIMIT 1`,
    [completedDays, progressPercentage, plan.id, plan.user_id]
  )

  return { completedDays, progressPercentage }
}

export async function GET(request) {
  try {
    const session = await auth()
    const userId = await resolveUserId(session)

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const rawPlanId = searchParams.get('planId')?.trim()
    const planId = rawPlanId && rawPlanId.length ? rawPlanId : null
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const limitParam = Number.parseInt(searchParams.get('limit'), 10)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 60) : 60

    const plan = planId ? await ensurePlanExists(planId, userId) : null

    let sql = `SELECT *
                 FROM ${LOG_TABLE}
                WHERE user_id = ?`
    const params = [userId]

    if (plan?.id) {
      sql += ' AND diet_plan_id = ?'
      params.push(plan.id)
    }

    if (startDate && endDate) {
      sql += ' AND log_date BETWEEN ? AND ?'
      params.push(startDate, endDate)
    } else if (startDate) {
      sql += ' AND log_date >= ?'
      params.push(startDate)
    } else if (endDate) {
      sql += ' AND log_date <= ?'
      params.push(endDate)
    }

    sql += ' ORDER BY log_date DESC LIMIT ?'

    let rows = []
    try {
      rows = await query(sql, [...params, limit])
    } catch (selectError) {
      if (selectError?.code === 'ER_NO_SUCH_TABLE') {
        console.warn('diet_plan_logs table missing during GET; returning empty logs')
        return NextResponse.json({ logs: [] })
      }
      throw selectError
    }

    const logs = Array.isArray(rows) ? rows.map(mapLogRow) : []

    return NextResponse.json({ logs })
  } catch (error) {
    console.error('Failed to load diet plan logs:', error)
    return NextResponse.json({ error: 'Failed to load diet plan logs' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const session = await auth()
    const userId = await resolveUserId(session)

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 })
    }

    const planId = body.planId?.toString().trim()
    const logDateInput = body.logDate?.toString().trim()

    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 })
    }

    if (!logDateInput) {
      return NextResponse.json({ error: 'logDate is required' }, { status: 400 })
    }

    const logDate = new Date(logDateInput)
    if (Number.isNaN(logDate.getTime())) {
      return NextResponse.json({ error: 'logDate is invalid' }, { status: 400 })
    }

    const normalizedDate = logDate.toISOString().split('T')[0]

    const plan = await ensurePlanExists(planId, userId)

    if (!plan) {
      return NextResponse.json({ error: 'Diet plan not found' }, { status: 404 })
    }

    const payload = {
      weightKg: toNumberOrNull(body.weightKg),
      caloriesConsumed: toNumberOrNull(body.caloriesConsumed),
      caloriesBurned: toNumberOrNull(body.caloriesBurned),
      protein: toNumberOrNull(body.protein),
      carbs: toNumberOrNull(body.carbs),
      fat: toNumberOrNull(body.fat),
      waterMl: toNumberOrNull(body.waterMl),
      workoutDurationMinutes: toNumberOrNull(body.workoutDurationMinutes),
      notes: body.notes?.toString().trim() || null
    }

    let existingLog = null
    try {
      existingLog = await queryOne(
        `SELECT id
           FROM ${LOG_TABLE}
          WHERE diet_plan_id = ?
            AND user_id = ?
            AND log_date = ?
          LIMIT 1`,
        [plan.id, plan.user_id, normalizedDate]
      )
    } catch (lookupError) {
      if (lookupError?.code === 'ER_NO_SUCH_TABLE') {
        console.warn('diet_plan_logs table missing during lookup; returning empty result')
        existingLog = null
      } else {
        throw lookupError
      }
    }

    const now = new Date()

    if (existingLog?.id) {
      await query(
        `UPDATE ${LOG_TABLE}
            SET weight_kg = ?,
                calories_consumed = ?,
                calories_burned = ?,
                protein_g = ?,
                carbs_g = ?,
                fat_g = ?,
                water_ml = ?,
                workout_duration_minutes = ?,
                notes = ?,
                updated_at = ?
          WHERE id = ?`,
        [
          payload.weightKg,
          payload.caloriesConsumed,
          payload.caloriesBurned,
          payload.protein,
          payload.carbs,
          payload.fat,
          payload.waterMl,
          payload.workoutDurationMinutes,
          payload.notes,
          now,
          existingLog.id
        ]
      )

      const updatedRow = await loadLogById(existingLog.id)
      const progress = await refreshPlanProgress(plan)
      return NextResponse.json({ log: mapLogRow(updatedRow), created: false, progress })
    }

    try {
      await query(
      `INSERT INTO ${LOG_TABLE} (
         diet_plan_id,
         user_id,
         log_date,
         weight_kg,
         calories_consumed,
         calories_burned,
         protein_g,
         carbs_g,
         fat_g,
         water_ml,
         workout_duration_minutes,
         notes,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          plan.id,
          plan.user_id,
          normalizedDate,
          payload.weightKg,
          payload.caloriesConsumed,
          payload.caloriesBurned,
          payload.protein,
          payload.carbs,
          payload.fat,
          payload.waterMl,
          payload.workoutDurationMinutes,
          payload.notes,
          now,
          now
        ]
      )
    } catch (insertError) {
      if (insertError?.code === 'ER_NO_SUCH_TABLE') {
        console.warn('diet_plan_logs table missing during INSERT; returning storage unavailable')
        return NextResponse.json({ error: 'Diet plan logs storage unavailable' }, { status: 503 })
      }
      throw insertError
    }

    const insertedRow = await loadLogById((await queryOne('SELECT LAST_INSERT_ID() AS id'))?.id)
    const progress = await refreshPlanProgress(plan)
    return NextResponse.json({ log: mapLogRow(insertedRow), created: true, progress }, { status: 201 })
  } catch (error) {
    console.error('Failed to save diet plan log:', error)
    const responseError =
      typeof error?.message === 'string' && error.message.trim()
        ? `${error.message}`
        : 'Failed to save diet plan log'
    return NextResponse.json({ error: responseError }, { status: 500 })
  }
}

