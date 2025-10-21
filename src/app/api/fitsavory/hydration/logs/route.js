import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

import { auth } from '@/auth'
import { query, queryOne } from '@/lib/db'
import { isAuthDisabled } from '@/lib/auth-utils'

let ensureTablePromise = null

const PHILIPPINES_TIME_ZONE = 'Asia/Manila'

const toDateInstance = (value) => {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatToManilaDate = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed
    }
  }

  const instance = toDateInstance(value)
  if (!instance) return null

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PHILIPPINES_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(instance)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) return null
  return `${year}-${month}-${day}`
}

const ensureHydrationLogsTable = async () => {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS hydration_logs (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            log_date DATE NOT NULL,
            water_ml INT NOT NULL,
            goal_ml INT,
            notes TEXT,
            log_time DATETIME,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_user_id (user_id),
            INDEX idx_user_date (user_id, log_date)
          )
        `)
        try {
          await query('ALTER TABLE hydration_logs ADD COLUMN log_time DATETIME NULL')
        } catch (alterError) {
          if (!['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_CANT_ADD_AUTO_FIELD'].includes(alterError?.code)) {
            if (!alterError?.message?.includes('Duplicate column name')) {
              console.warn('Unable to ensure hydration_logs.log_time column:', alterError?.message || alterError)
            }
          }
        }
      } catch (error) {
        console.warn('Failed to ensure hydration_logs table exists:', error?.message || error)
      }
    })()
  }

  return ensureTablePromise
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
  const fallbackName = session?.user?.name?.trim() || email.split('@')[0] || 'FitSavory User'

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
      console.warn('Failed to auto-create user during hydration resolve:', error?.message || error)
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

const toIsoDate = (value) => {
  if (!value) return null

  if (value instanceof Date) {
    return value.toISOString().split('T')[0]
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed.length) return null

    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0]
    }
  }

  return null
}

const toIntOrNull = (value, { min = null, max = null } = {}) => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return null
  if (min !== null && parsed < min) return null
  if (max !== null && parsed > max) return max
  return parsed
}

const mapHydrationRow = (row) => {
  if (!row) return null

  const isoDate = formatToManilaDate(row.log_date ?? row.date ?? row.logDate)
  const fallbackDate =
    typeof row.log_date === 'string'
      ? row.log_date
      : row.log_date?.toISOString?.().split('T')[0] ?? row.date ?? null

  return {
    id: row.id,
    userId: row.user_id,
    date: isoDate ?? fallbackDate,
    waterMl: row.water_ml !== null ? Number(row.water_ml) : null,
    goalMl: row.goal_ml !== null ? Number(row.goal_ml) : null,
    notes: row.notes ?? null,
    loggedAt:
      row.log_time instanceof Date
        ? row.log_time.toISOString()
        : typeof row.log_time === 'string'
          ? row.log_time
          : null,
    createdAt: row.created_at ? row.created_at.toISOString?.() || row.created_at : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString?.() || row.updated_at : null
  }
}

const toDateTimeOrNull = (value) => {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed.length) return null
    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }
  return null
}

export async function GET(request) {
  try {
    await ensureHydrationLogsTable()

    const session = await auth()
    const userId = await resolveUserId(session)

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = toIsoDate(searchParams.get('startDate'))
    const endDate = toIsoDate(searchParams.get('endDate'))
    const limit = Math.min(Number.parseInt(searchParams.get('limit'), 10) || 120, 365)

    const filters = ['user_id = ?']
    const params = [userId]

    if (startDate) {
      filters.push('log_date >= ?')
      params.push(startDate)
    }

    if (endDate) {
      filters.push('log_date <= ?')
      params.push(endDate)
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const queryText = `
      SELECT id, user_id, log_date, water_ml, goal_ml, notes, log_time, created_at, updated_at
        FROM hydration_logs
        ${whereClause}
        ORDER BY log_date DESC, created_at DESC
        LIMIT ?
    `

    params.push(limit)

    const rows = await query(queryText, params)
    const logs = Array.isArray(rows) ? rows.map(mapHydrationRow).filter(Boolean) : []

    return NextResponse.json({ logs })
  } catch (error) {
    console.error('Failed to load hydration logs:', error)
    return NextResponse.json({ error: 'Unable to load hydration history' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    await ensureHydrationLogsTable()

    const session = await auth()
    const userId = await resolveUserId(session)

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const dateIso = toIsoDate(body.date)
    if (!dateIso) {
      return NextResponse.json({ error: 'date is required (YYYY-MM-DD)' }, { status: 400 })
    }

    const waterMl = toIntOrNull(body.waterMl, { min: 0, max: 100000 })
    if (waterMl === null) {
      return NextResponse.json({ error: 'waterMl must be a non-negative integer' }, { status: 400 })
    }

    const goalMl = toIntOrNull(body.goalMl, { min: 0, max: 100000 })
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : null
    const loggedAtDate = toDateTimeOrNull(body.loggedAt) || new Date()

    const id = randomUUID()

    await query(
      `INSERT INTO hydration_logs (id, user_id, log_date, water_ml, goal_ml, notes, log_time)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, dateIso, waterMl, goalMl, notes, loggedAtDate]
    )

    const inserted = await queryOne(
      `SELECT id, user_id, log_date, water_ml, goal_ml, notes, log_time, created_at, updated_at
         FROM hydration_logs
        WHERE id = ?
        LIMIT 1`,
      [id]
    )

    const log = mapHydrationRow(inserted)
    if (log && loggedAtDate instanceof Date) {
      log.loggedAt = loggedAtDate.toISOString()
    }
    return NextResponse.json(log, { status: 201 })
  } catch (error) {
    console.error('Failed to save hydration log:', error)
    return NextResponse.json({ error: 'Failed to save hydration log' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    await ensureHydrationLogsTable()

    const session = await auth()
    const userId = await resolveUserId(session)

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const dateIso = toIsoDate(body?.date)

    if (!dateIso) {
      return NextResponse.json({ error: 'date is required (YYYY-MM-DD)' }, { status: 400 })
    }

    await query('DELETE FROM hydration_logs WHERE user_id = ? AND log_date = ?', [userId, dateIso])

    return NextResponse.json({ deleted: true })
  } catch (error) {
    console.error('Failed to delete hydration logs:', error)
    return NextResponse.json({ error: 'Failed to reset hydration intake' }, { status: 500 })
  }
}
