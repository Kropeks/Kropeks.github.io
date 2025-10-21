'use client'

const PHILIPPINES_TIME_ZONE = 'Asia/Manila'

const toDateInstance = (value) => {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export const formatToManilaDate = (value) => {
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

export const getManilaTodayIso = () => formatToManilaDate(new Date())

export const formatManilaDateLabel = (value, options = {}) => {
  const iso = formatToManilaDate(value)
  if (!iso) return null
  const date = new Date(`${iso}T00:00:00+08:00`)
  return date.toLocaleDateString(undefined, {
    timeZone: PHILIPPINES_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options
  })
}

export const formatManilaTimeLabel = (value, options = {}) => {
  const date = toDateInstance(value)
  if (!date) return null
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PHILIPPINES_TIME_ZONE,
    ...options
  })
}

export const getMsUntilNextManilaMidnight = (value = new Date()) => {
  const instance = toDateInstance(value)
  if (!instance) return 0
  const manilaMidnight = new Date(formatToManilaDate(instance) + 'T00:00:00+08:00')
  const nextMidnight = new Date(manilaMidnight.getTime() + 24 * 60 * 60 * 1000)
  const diff = nextMidnight.getTime() - instance.getTime()
  return diff > 0 ? diff : 0
}

export { PHILIPPINES_TIME_ZONE }
