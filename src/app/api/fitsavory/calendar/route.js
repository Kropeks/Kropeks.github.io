import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

import { auth } from '@/auth'
import { query, queryOne } from '@/lib/db'
import { isAuthDisabled } from '@/lib/auth-utils'

const EVENT_TYPES = new Set(['meal', 'workout', 'appointment', 'reminder', 'goal', 'other'])

const toDateString = (value) => {
  if (!value) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed
    }
    return trimmed.split('T')[0]
  }
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(value)
    return parts
  } catch (error) {
    return null
  }
}

const toTimeString = (value) => {
  if (!value) return null
  if (typeof value === 'string') {
    return value.trim() || null
  }
  if (value instanceof Date) {
    return value.toISOString().split('T')[1]?.slice(0, 8) ?? null
  }
  return null
}

const toBoolean = (value) => {
  if (value === true || value === false) return value
  if (typeof value === 'string') {
    const lower = value.toLowerCase()
    if (lower === 'true') return true
    if (lower === 'false') return false
    if (lower === '1') return true
    if (lower === '0') return false
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  return false
}

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const parseJson = (value) => {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch (error) {
    return null
  }
}

const stringifyJson = (value) => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch (error) {
      return null
    }
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  return null
}

const baseSelectColumns = `
  id,
  user_id,
  title,
  description,
  event_type,
  DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date,
  start_time,
  end_time,
  is_all_day,
  is_recurring,
  recurrence_pattern,
  location,
  reminder_minutes_before,
  is_completed,
  completion_notes,
  calories_burned,
  calories_consumed,
  nutrition_data,
  created_at,
  updated_at
`

const mapEventRow = (row) => {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    eventType: row.event_type,
    eventDate: toDateString(row.event_date),
    startTime: toTimeString(row.start_time),
    endTime: toTimeString(row.end_time),
    isAllDay: Boolean(row.is_all_day),
    isRecurring: Boolean(row.is_recurring),
    recurrencePattern: parseJson(row.recurrence_pattern),
    location: row.location ?? null,
    reminderMinutesBefore: toNumber(row.reminder_minutes_before),
    isCompleted: Boolean(row.is_completed),
    completionNotes: row.completion_notes ?? null,
    caloriesBurned: toNumber(row.calories_burned),
    caloriesConsumed: toNumber(row.calories_consumed),
    nutritionData: parseJson(row.nutrition_data),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
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
      if (!isAuthDisabled) {
        throw error
      }
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
          throw error
        }
      }

      const user = await queryOne('SELECT id FROM users WHERE email = ? LIMIT 1', [session.user.email])
      const emailId = Number.parseInt(user?.id ?? user?.ID, 10)
      if (Number.isInteger(emailId)) {
        return emailId
      }
    }
  }

  return null
}

const createTableSql = `
  CREATE TABLE IF NOT EXISTS calendar_events (
    id VARCHAR(36) PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_type ENUM('meal','workout','appointment','reminder','goal','other') NOT NULL,
    event_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    is_all_day TINYINT(1) DEFAULT 0,
    is_recurring TINYINT(1) DEFAULT 0,
    recurrence_pattern JSON,
    location VARCHAR(255),
    reminder_minutes_before INT DEFAULT 0,
    is_completed TINYINT(1) DEFAULT 0,
    completion_notes TEXT,
    calories_burned INT,
    calories_consumed INT,
    nutrition_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_event_date (event_date),
    INDEX idx_event_type (event_type),
    INDEX idx_is_completed (is_completed),
    INDEX idx_event_datetime (event_date, start_time),
    INDEX idx_user_datetime (user_id, event_date, start_time)
  )
`

const ensureTable = async () => {
  try {
    await query('SELECT 1 FROM calendar_events LIMIT 1')
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_TABLE_ERROR') {
      await query(createTableSql)
      return true
    }
    throw error
  }
  return true
}

const formatDateForQuery = (value) => {
  if (!value) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed
    }
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

export async function GET(request) {
  try {
    const session = await auth()
    const userId = await resolveUserId(session)

    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tableExists = await ensureTable()
    if (!tableExists) {
      return NextResponse.json({ events: [] })
    }

    const { searchParams } = new URL(request.url)
    const startParam = formatDateForQuery(searchParams.get('startDate'))
    const endParam = formatDateForQuery(searchParams.get('endDate'))

    let startDate = startParam
    let endDate = endParam

    if (!startDate || !endDate) {
      const today = new Date()
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      startDate = toDateString(monthStart)
      endDate = toDateString(monthEnd)
    }

    const rows = await query(
      `SELECT *
         FROM calendar_events
        WHERE user_id = ?
          AND event_date BETWEEN ? AND ?
        ORDER BY event_date ASC, start_time IS NULL, start_time ASC`,
      [userId, startDate, endDate]
    )

    const events = Array.isArray(rows) ? rows.map(mapEventRow) : []
    return NextResponse.json({ events })
  } catch (error) {
    console.error('Failed to load calendar events:', error)
    return NextResponse.json({ error: 'Failed to load calendar events' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const session = await auth()
    const userId = await resolveUserId(session)

    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tableExists = await ensureTable()
    if (!tableExists) {
      return NextResponse.json({ error: 'Calendar events table not found' }, { status: 500 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 })
    }

    const title = (body.title ?? '').toString().trim()
    const eventType = (body.eventType ?? body.event_type ?? '').toString().trim()
    const eventDate = formatDateForQuery(body.eventDate ?? body.event_date)

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    if (!EVENT_TYPES.has(eventType)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
    }

    if (!eventDate) {
      return NextResponse.json({ error: 'Valid event date is required' }, { status: 400 })
    }

    const startTime = toTimeString(body.startTime ?? body.start_time)
    const endTime = toTimeString(body.endTime ?? body.end_time)
    const isAllDay = toBoolean(body.isAllDay ?? body.is_all_day)
    const isRecurring = toBoolean(body.isRecurring ?? body.is_recurring)
    const recurrencePattern = stringifyJson(body.recurrencePattern ?? body.recurrence_pattern)
    const location = body.location ? body.location.toString().trim() : null
    const reminderMinutesBefore = toNumber(body.reminderMinutesBefore ?? body.reminder_minutes_before) ?? 0
    const isCompleted = toBoolean(body.isCompleted ?? body.is_completed)
    const completionNotes = body.completionNotes ? body.completionNotes.toString().trim() : null
    const caloriesBurned = toNumber(body.caloriesBurned ?? body.calories_burned)
    const caloriesConsumed = toNumber(body.caloriesConsumed ?? body.calories_consumed)
    const nutritionData = stringifyJson(body.nutritionData ?? body.nutrition_data)
    const description = body.description ? body.description.toString().trim() : null

    const eventId = randomUUID()

    await query(
      `INSERT INTO calendar_events (
         id,
         user_id,
         title,
         description,
         event_type,
         event_date,
         start_time,
         end_time,
         is_all_day,
         is_recurring,
         recurrence_pattern,
         location,
         reminder_minutes_before,
         is_completed,
         completion_notes,
         calories_burned,
         calories_consumed,
         nutrition_data
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        userId,
        title,
        description,
        eventType,
        eventDate,
        isAllDay ? null : startTime,
        isAllDay ? null : endTime,
        isAllDay ? 1 : 0,
        isRecurring ? 1 : 0,
        recurrencePattern,
        location,
        reminderMinutesBefore ?? 0,
        isCompleted ? 1 : 0,
        completionNotes,
        caloriesBurned,
        caloriesConsumed,
        nutritionData
      ]
    )

    const row = await queryOne(
      `SELECT *
         FROM calendar_events
        WHERE id = ?
          AND user_id = ?
        LIMIT 1`,
      [eventId, userId]
    )

    return NextResponse.json({ event: mapEventRow(row) })
  } catch (error) {
    console.error('Failed to create calendar event:', error)
    return NextResponse.json({ error: 'Failed to create calendar event' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const session = await auth()
    const userId = await resolveUserId(session)

    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tableExists = await ensureTable()
    if (!tableExists) {
      return NextResponse.json({ error: 'Calendar events table not found' }, { status: 500 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 })
    }

    const eventId = (body.eventId ?? body.id)?.toString().trim()
    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 })
    }

    const updates = []
    const params = []

    if (body.title !== undefined) {
      const value = body.title?.toString().trim() || null
      if (value) {
        updates.push('title = ?')
        params.push(value)
      }
    }

    if (body.description !== undefined) {
      const value = body.description?.toString().trim() || null
      updates.push('description = ?')
      params.push(value)
    }

    if (body.eventType !== undefined || body.event_type !== undefined) {
      const value = (body.eventType ?? body.event_type)?.toString().trim()
      if (!EVENT_TYPES.has(value)) {
        return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
      }
      updates.push('event_type = ?')
      params.push(value)
    }

    if (body.eventDate !== undefined || body.event_date !== undefined) {
      const value = formatDateForQuery(body.eventDate ?? body.event_date)
      if (!value) {
        return NextResponse.json({ error: 'Invalid event date' }, { status: 400 })
      }
      updates.push('event_date = ?')
      params.push(value)
    }

    if (body.startTime !== undefined || body.start_time !== undefined) {
      const value = toTimeString(body.startTime ?? body.start_time)
      updates.push('start_time = ?')
      params.push(value)
    }

    if (body.endTime !== undefined || body.end_time !== undefined) {
      const value = toTimeString(body.endTime ?? body.end_time)
      updates.push('end_time = ?')
      params.push(value)
    }

    if (body.isAllDay !== undefined || body.is_all_day !== undefined) {
      updates.push('is_all_day = ?')
      params.push(toBoolean(body.isAllDay ?? body.is_all_day) ? 1 : 0)
      if (toBoolean(body.isAllDay ?? body.is_all_day)) {
        updates.push('start_time = NULL')
        updates.push('end_time = NULL')
      }
    }

    if (body.isRecurring !== undefined || body.is_recurring !== undefined) {
      updates.push('is_recurring = ?')
      params.push(toBoolean(body.isRecurring ?? body.is_recurring) ? 1 : 0)
    }

    if (body.recurrencePattern !== undefined || body.recurrence_pattern !== undefined) {
      updates.push('recurrence_pattern = ?')
      params.push(stringifyJson(body.recurrencePattern ?? body.recurrence_pattern))
    }

    if (body.location !== undefined) {
      const value = body.location?.toString().trim() || null
      updates.push('location = ?')
      params.push(value)
    }

    if (body.reminderMinutesBefore !== undefined || body.reminder_minutes_before !== undefined) {
      const value = toNumber(body.reminderMinutesBefore ?? body.reminder_minutes_before)
      updates.push('reminder_minutes_before = ?')
      params.push(value ?? 0)
    }

    if (body.isCompleted !== undefined || body.is_completed !== undefined) {
      updates.push('is_completed = ?')
      params.push(toBoolean(body.isCompleted ?? body.is_completed) ? 1 : 0)
    }

    if (body.completionNotes !== undefined) {
      const value = body.completionNotes?.toString().trim() || null
      updates.push('completion_notes = ?')
      params.push(value)
    }

    if (body.caloriesBurned !== undefined || body.calories_burned !== undefined) {
      updates.push('calories_burned = ?')
      params.push(toNumber(body.caloriesBurned ?? body.calories_burned))
    }

    if (body.caloriesConsumed !== undefined || body.calories_consumed !== undefined) {
      updates.push('calories_consumed = ?')
      params.push(toNumber(body.caloriesConsumed ?? body.calories_consumed))
    }

    if (body.nutritionData !== undefined || body.nutrition_data !== undefined) {
      updates.push('nutrition_data = ?')
      params.push(stringifyJson(body.nutritionData ?? body.nutrition_data))
    }

    if (!updates.length) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')

    const result = await query(
      `UPDATE calendar_events
          SET ${updates.join(', ')}
        WHERE id = ?
          AND user_id = ?
        LIMIT 1`,
      [...params, eventId, userId]
    )

    if (!result?.affectedRows) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const row = await queryOne(
      `SELECT *
         FROM calendar_events
        WHERE id = ?
          AND user_id = ?
        LIMIT 1`,
      [eventId, userId]
    )

    return NextResponse.json({ event: mapEventRow(row) })
  } catch (error) {
    console.error('Failed to update calendar event:', error)
    return NextResponse.json({ error: 'Failed to update calendar event' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const session = await auth()
    const userId = await resolveUserId(session)

    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tableExists = await ensureTable()
    if (!tableExists) {
      return NextResponse.json({ error: 'Calendar events table not found' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')?.toString().trim()

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 })
    }

    const result = await query(
      `DELETE FROM calendar_events
        WHERE id = ?
          AND user_id = ?
        LIMIT 1`,
      [eventId, userId]
    )

    if (!result?.affectedRows) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete calendar event:', error)
    return NextResponse.json({ error: 'Failed to delete calendar event' }, { status: 500 })
  }
}
