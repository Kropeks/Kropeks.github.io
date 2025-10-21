'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Utensils,
  Target,
  Activity,
  Clock,
  Check,
  Trash2,
  ArrowRight,
  ArrowLeft
} from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog'

import {
  formatToManilaDate,
  getManilaTodayIso,
  formatManilaDateLabel,
  formatManilaTimeLabel
} from '@/lib/manilaTime'

const EVENT_TYPE_META = {
  meal: { icon: Utensils, color: 'bg-emerald-500/20', textColor: 'text-emerald-200', label: 'Meal' },
  workout: { icon: Activity, color: 'bg-sky-500/20', textColor: 'text-sky-200', label: 'Workout' },
  goal: { icon: Target, color: 'bg-purple-500/20', textColor: 'text-purple-200', label: 'Goal' },
  appointment: { icon: CalendarIcon, color: 'bg-amber-500/20', textColor: 'text-amber-200', label: 'Appointment' },
  reminder: { icon: Clock, color: 'bg-rose-500/20', textColor: 'text-rose-200', label: 'Reminder' },
  other: { icon: CalendarIcon, color: 'bg-slate-500/20', textColor: 'text-slate-200', label: 'Other' }
}

const EVENT_TYPE_OPTIONS = Object.entries(EVENT_TYPE_META).map(([value, meta]) => ({ value, label: meta.label }))

export default function Calendar() {
  const [events, setEvents] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [currentMonth, setCurrentMonth] = useState(() => getManilaTodayIso().slice(0, 7))
  const [selectedDate, setSelectedDate] = useState(() => getManilaTodayIso())
  const [view, setView] = useState('month') // month, week, day
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [activeEventId, setActiveEventId] = useState(null)
  const [isModifying, setIsModifying] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    eventType: 'meal',
    eventDate: selectedDate,
    startTime: '',
    endTime: '',
    isAllDay: false,
    isRecurring: false,
    recurrencePattern: '',
    location: '',
    reminderMinutesBefore: '0',
    isCompleted: false,
    completionNotes: '',
    caloriesBurned: '',
    caloriesConsumed: '',
    nutritionData: ''
  })

  const resetForm = useCallback(
    (date = selectedDate) => {
      setFormData({
        title: '',
        description: '',
        eventType: 'meal',
        eventDate: date,
        startTime: '',
        endTime: '',
        isAllDay: false,
        isRecurring: false,
        recurrencePattern: '',
        location: '',
        reminderMinutesBefore: '0',
        isCompleted: false,
        completionNotes: '',
        caloriesBurned: '',
        caloriesConsumed: '',
        nutritionData: ''
      })
      setFormError(null)
    },
    [selectedDate]
  )

  useEffect(() => {
    if (!isDialogOpen) {
      resetForm(selectedDate)
    }
  }, [isDialogOpen, selectedDate, resetForm])

  const toUtcDate = useCallback((iso) => {
    if (!iso || typeof iso !== 'string') return null
    const parts = iso.split('-').map((part) => Number.parseInt(part, 10))
    if (parts.some((part) => Number.isNaN(part))) return null
    const [year, month, day] = parts
    return new Date(Date.UTC(year, month - 1, day))
  }, [])

  const pad = (value) => String(value).padStart(2, '0')

  const getMonthRange = useCallback((monthIso) => {
    if (!monthIso) return { start: null, end: null }
    const [year, month] = monthIso.split('-').map((segment) => Number.parseInt(segment, 10))
    if (Number.isNaN(year) || Number.isNaN(month)) {
      return { start: null, end: null }
    }
    const start = `${monthIso}-01`
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const end = `${monthIso}-${pad(lastDay)}`
    return { start, end }
  }, [])

  const getWeekRange = useCallback(
    (dateIso) => {
      const utcDate = toUtcDate(dateIso)
      if (!utcDate) return { start: null, end: null }
      const startUtc = new Date(utcDate)
      startUtc.setUTCDate(utcDate.getUTCDate() - utcDate.getUTCDay())
      const endUtc = new Date(startUtc)
      endUtc.setUTCDate(startUtc.getUTCDate() + 6)
      return {
        start: startUtc.toISOString().split('T')[0],
        end: endUtc.toISOString().split('T')[0]
      }
    },
    [toUtcDate]
  )

  const viewRange = useMemo(() => {
    if (view === 'week') {
      return getWeekRange(selectedDate)
    }
    if (view === 'day') {
      return { start: selectedDate, end: selectedDate }
    }
    return getMonthRange(currentMonth)
  }, [view, selectedDate, currentMonth, getWeekRange, getMonthRange])

  const normalizeDateString = (value) => formatToManilaDate(value)

  const fetchEvents = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const startDate = normalizeDateString(viewRange.start)
      const endDate = normalizeDateString(viewRange.end)

      const params = new URLSearchParams()
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)

      const response = await fetch(`/api/fitsavory/calendar?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body?.error || 'Failed to load calendar events')
      }

      const data = await response.json()
      const mapped = Array.isArray(data?.events) ? data.events : []
      setEvents(mapped)
    } catch (fetchError) {
      console.error('Calendar events fetch error:', fetchError)
      setError(fetchError.message || 'Unable to load events')
      setEvents([])
    } finally {
      setIsLoading(false)
    }
  }, [viewRange])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const formatDate = (iso) => {
    return formatManilaDateLabel(iso, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getEventsForDate = useCallback(
    (dateString) => {
      return events.filter((event) => normalizeDateString(event.eventDate) === dateString)
    },
    [events]
  )

  const isToday = (dateString) => {
    const today = getManilaTodayIso()
    return dateString === today
  }

  const isSelected = (dateString) => {
    return dateString === selectedDate
  }

  const calendarDays = useMemo(() => {
    const [year, month] = currentMonth.split('-').map((segment) => Number.parseInt(segment, 10))
    if (Number.isNaN(year) || Number.isNaN(month)) return []
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()

    const days = []

    for (let i = 0; i < firstDay; i++) {
      days.push(null)
    }

    for (let day = 1; day <= daysInMonth; day++) {
      days.push(`${currentMonth}-${pad(day)}`)
    }

    return days
  }, [currentMonth])

  const weekDays = useMemo(() => {
    const range = getWeekRange(selectedDate)
    if (!range.start || !range.end) return []
    const start = toUtcDate(range.start)
    const days = []
    for (let i = 0; i < 7; i++) {
      const day = new Date(start)
      day.setUTCDate(start.getUTCDate() + i)
      days.push(day.toISOString().split('T')[0])
    }
    return days
  }, [getWeekRange, selectedDate, toUtcDate])

  const dayHours = useMemo(() => {
    return Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, '0')}:00`)
  }, [])

  const parseTimeToMinutes = useCallback((time) => {
    if (!time) return null
    const [hours = '0', minutes = '0'] = time.split(':')
    const hourNumber = Number.parseInt(hours, 10)
    const minuteNumber = Number.parseInt(minutes, 10)
    if (Number.isNaN(hourNumber) || Number.isNaN(minuteNumber)) return null
    return hourNumber * 60 + minuteNumber
  }, [])

  const navigateMonth = (direction) => {
    const [year, month] = currentMonth.split('-').map((segment) => Number.parseInt(segment, 10))
    if (Number.isNaN(year) || Number.isNaN(month)) return
    const next = new Date(Date.UTC(year, month - 1 + direction, 1))
    setCurrentMonth(next.toISOString().slice(0, 7))
  }

  const selectedDateEvents = useMemo(() => getEventsForDate(selectedDate), [getEventsForDate, selectedDate])
  const toManilaDate = useCallback((iso) => {
    const normalized = formatToManilaDate(iso)
    if (!normalized) return null
    const date = toUtcDate(normalized)
    return date
  }, [toUtcDate])

  const allDayEvents = useMemo(
    () => selectedDateEvents.filter((event) => event.isAllDay || !event.startTime),
    [selectedDateEvents]
  )

  const timedEvents = useMemo(() => {
    return selectedDateEvents
      .filter((event) => !event.isAllDay && event.startTime)
      .map((event) => {
        const startMinutes = parseTimeToMinutes(event.startTime)
        const endMinutesRaw = event.endTime ? parseTimeToMinutes(event.endTime) : null
        const endMinutes = endMinutesRaw !== null ? Math.max(startMinutes ?? 0, endMinutesRaw) : (startMinutes ?? 0) + 59
        return {
          event,
          startMinutes: startMinutes ?? 0,
          endMinutes
        }
      })
      .sort((a, b) => a.startMinutes - b.startMinutes)
  }, [parseTimeToMinutes, selectedDateEvents])

  const upcomingEvents = useMemo(() => {
    const reference = toManilaDate(selectedDate)
    if (!reference) return []
    return events
      .map((event) => ({ event, date: toManilaDate(event.eventDate) }))
      .filter((item) => item.date && item.date >= reference)
      .sort((a, b) => a.date - b.date)
      .slice(0, 3)
      .map((item) => item.event)
  }, [events, selectedDate, toManilaDate])

  const handleViewChange = (nextView) => {
    setView(nextView)
    if (nextView === 'day' || nextView === 'week') {
      setCurrentMonth(selectedDate.slice(0, 7))
    }
  }

  const handleFormChange = (field) => (event) => {
    const { value, type, checked } = event.target
    setFormData((previous) => ({
      ...previous,
      [field]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    setFormError(null)

    try {
      const payload = {
        title: formData.title,
        description: formData.description,
        eventType: formData.eventType,
        eventDate: formData.eventDate,
        startTime: formData.isAllDay ? null : formData.startTime || null,
        endTime: formData.isAllDay ? null : formData.endTime || null,
        isAllDay: formData.isAllDay,
        isRecurring: formData.isRecurring,
        recurrencePattern: formData.recurrencePattern || null,
        location: formData.location || null,
        reminderMinutesBefore: formData.reminderMinutesBefore ? Number(formData.reminderMinutesBefore) : 0,
        isCompleted: formData.isCompleted,
        completionNotes: formData.completionNotes || null,
        caloriesBurned: formData.caloriesBurned ? Number(formData.caloriesBurned) : null,
        caloriesConsumed: formData.caloriesConsumed ? Number(formData.caloriesConsumed) : null,
        nutritionData: formData.nutritionData ? formData.nutritionData : null
      }

      const response = await fetch('/api/fitsavory/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body?.error || 'Failed to create event')
      }

      await fetchEvents()
      setIsDialogOpen(false)
    } catch (submitError) {
      console.error('Event creation error:', submitError)
      setFormError(submitError.message || 'Unable to create event')
    } finally {
      setIsSubmitting(false)
    }
  }

  const withEventAction = useCallback(
    async ({ id, action }) => {
      if (!id) return
      setActiveEventId(id)
      setIsModifying(true)
      try {
        await action()
        await fetchEvents()
      } catch (modError) {
        console.error('Calendar event update failed:', modError)
        setError(modError.message || 'Unable to update event')
      } finally {
        setIsModifying(false)
        setActiveEventId(null)
      }
    },
    [fetchEvents]
  )

  const toggleComplete = (eventId, nextComplete) => {
    return withEventAction({
      id: eventId,
      action: async () => {
        const response = await fetch('/api/fitsavory/calendar', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, isCompleted: nextComplete })
        })
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body?.error || 'Failed to update event')
        }
      }
    })
  }

  const deleteEvent = (eventId) => {
    return withEventAction({
      id: eventId,
      action: async () => {
        const params = new URLSearchParams({ eventId })
        const response = await fetch(`/api/fitsavory/calendar?${params.toString()}`, {
          method: 'DELETE'
        })
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body?.error || 'Failed to delete event')
        }
      }
    })
  }

  const formatEventTime = (event) => {
    if (event.isAllDay) {
      return 'All day'
    }
    const eventDateIso = normalizeDateString(event.eventDate)
    const toLabel = (time) => {
      if (!time || !eventDateIso) return null
      const label = formatManilaTimeLabel(`${eventDateIso}T${time}+08:00`, { hour: 'numeric', minute: 'numeric' })
      return label || time
    }
    const startLabel = toLabel(event.startTime)
    const endLabel = toLabel(event.endTime)
    if (startLabel && endLabel) {
      return `${startLabel} – ${endLabel}`
    }
    if (startLabel) {
      return startLabel
    }
    return 'No time set'
  }

  const currentMonthLabel = formatManilaDateLabel(`${currentMonth}-01`, { year: 'numeric', month: 'long' })

  return (
    <div className="space-y-6 rounded-3xl bg-slate-950/80 p-4 text-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.35)] sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/80 px-6 py-5 shadow-inner">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Calendar</h1>
          <p className="mt-1 text-sm text-slate-400">Plan your meals, workouts, and health goals</p>
        </div>
        <button
          onClick={() => {
            resetForm(selectedDate)
            setIsDialogOpen(true)
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-olive-500 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-olive-600"
        >
          <Plus className="h-4 w-4" />
          <span>Add Event</span>
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl backdrop-blur">
            {/* Calendar Header */}
            <div className="border-b border-slate-800 px-6 pb-6 pt-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigateMonth(-1)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 transition hover:border-slate-700 hover:text-white"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div className="text-left">
                    <p className="text-lg font-semibold text-slate-100">{currentMonthLabel}</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Your daily planning hub</p>
                  </div>
                  <button
                    onClick={() => navigateMonth(1)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 transition hover:border-slate-700 hover:text-white"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                  <button
                    onClick={() => {
                      const todayIso = getManilaTodayIso()
                      setSelectedDate(todayIso)
                      setCurrentDate(new Date(`${todayIso}T00:00:00+08:00`))
                    }}
                    className="rounded-xl border border-olive-400/60 bg-olive-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-olive-600"
                  >
                    Today
                  </button>
                  <div className="flex overflow-hidden rounded-full border border-slate-800 bg-slate-900 p-1 text-xs font-semibold uppercase tracking-wide text-slate-400 shadow-inner">
                    {['month', 'week', 'day'].map((viewOption) => (
                      <button
                        key={viewOption}
                        onClick={() => handleViewChange(viewOption)}
                        className={`rounded-full px-4 py-2 capitalize transition ${
                          view === viewOption
                            ? 'bg-olive-500 text-white shadow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {viewOption}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 pt-6">
              {view === 'month' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                      <div key={day} className="rounded-lg py-2">
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-2">
                    {calendarDays.map((dateString, index) => {
                      if (!dateString) {
                        return <div key={index} className="rounded-2xl border border-transparent p-4" />
                      }

                      const dayEvents = getEventsForDate(dateString)
                      const today = isToday(dateString)
                      const selected = isSelected(dateString)

                      return (
                        <button
                          key={dateString}
                          onClick={() => setSelectedDate(dateString)}
                          className={`group flex min-h-[100px] flex-col rounded-2xl border px-3 py-3 text-left transition duration-150 ${
                            today
                              ? 'border-olive-500/80 bg-olive-500/10 text-white'
                              : selected
                                ? 'border-olive-400 bg-olive-500/20 text-white'
                                : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700 hover:bg-slate-900/70'
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                            <span>{Number.parseInt(dateString.split('-')[2], 10)}</span>
                            {today ? <span className="rounded-full bg-olive-500/80 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-white">Today</span> : null}
                          </div>
                          <div className="space-y-1 text-xs font-medium">
                            {dayEvents.length ? (
                              <>
                                {dayEvents.slice(0, 2).map((event) => {
                                  const meta = EVENT_TYPE_META[event.eventType] ?? EVENT_TYPE_META.other
                                  const EventIcon = meta.icon
                                  return (
                                    <div
                                      key={event.id}
                                      className={`flex items-center gap-1 rounded-md px-2 py-1 ${
                                        event.isCompleted
                                          ? 'bg-emerald-500/15 text-emerald-200'
                                          : meta.textColor
                                      }`}
                                    >
                                      {EventIcon ? <EventIcon className="h-3 w-3" /> : null}
                                      <span className="truncate">{event.title}</span>
                                    </div>
                                  )})}
                                {dayEvents.length > 2 && (
                                  <div className="px-2 text-[0.7rem] text-slate-400">+{dayEvents.length - 2} more</div>
                                )}
                              </>
                            ) : (
                              <div className="rounded-md bg-slate-900/50 px-2 py-1 text-[0.7rem] text-slate-500">No events</div>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {view === 'week' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <span>Week of</span>
                      <strong className="text-slate-100">{formatDate(weekDays[0])}</strong>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const previous = toUtcDate(selectedDate)
                          if (!previous) return
                          previous.setUTCDate(previous.getUTCDate() - 7)
                          const iso = previous.toISOString().split('T')[0]
                          setSelectedDate(iso)
                          setCurrentMonth(iso.slice(0, 7))
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 transition hover:border-slate-700 hover:text-white"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          const next = toUtcDate(selectedDate)
                          if (!next) return
                          next.setUTCDate(next.getUTCDate() + 7)
                          const iso = next.toISOString().split('T')[0]
                          setSelectedDate(iso)
                          setCurrentMonth(iso.slice(0, 7))
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 transition hover:border-slate-700 hover:text-white"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <div className="grid min-w-[700px] grid-cols-7 gap-2">
                      {weekDays.map((dateString) => {
                        const dayEvents = getEventsForDate(dateString)
                        const today = isToday(dateString)
                        const selected = isSelected(dateString)
                        return (
                          <button
                            key={dateString}
                            onClick={() => setSelectedDate(dateString)}
                            className={`flex flex-col rounded-2xl border px-3 py-3 text-left transition ${
                              today
                                ? 'border-olive-500/80 bg-olive-500/10 text-white'
                                : selected
                                  ? 'border-olive-400 bg-olive-500/20 text-white'
                                  : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700 hover:bg-slate-900/70'
                            }`}
                          >
                            <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                              <span>{formatManilaDateLabel(dateString, { weekday: 'short', day: 'numeric' })}</span>
                              {today ? <span className="rounded-full bg-olive-500/80 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-white">Today</span> : null}
                            </div>
                            <div className="space-y-1 text-xs font-medium">
                              {dayEvents.length ? (
                                dayEvents.map((event) => {
                                  const meta = EVENT_TYPE_META[event.eventType] ?? EVENT_TYPE_META.other
                                  const EventIcon = meta.icon
                                  return (
                                    <div
                                      key={event.id}
                                      className={`flex items-center gap-2 rounded-md px-2 py-1 ${
                                        event.isCompleted
                                          ? 'bg-emerald-500/10 text-emerald-200'
                                          : meta.textColor
                                      }`}
                                    >
                                      {EventIcon ? <EventIcon className="h-3 w-3" /> : null}
                                      <div className="flex flex-col">
                                        <span className="text-[0.7rem] font-semibold uppercase tracking-wide">
                                          {formatEventTime(event)}
                                        </span>
                                        <span className="truncate text-[0.75rem]">{event.title}</span>
                                      </div>
                                    </div>
                                  )
                                })
                              ) : (
                                <div className="rounded-md bg-slate-900/50 px-2 py-8 text-center text-[0.75rem] text-slate-500">No events</div>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              {view === 'day' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold text-slate-100">{formatDate(selectedDate)}</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const previous = toUtcDate(selectedDate)
                          if (!previous) return
                          previous.setUTCDate(previous.getUTCDate() - 1)
                          const iso = previous.toISOString().split('T')[0]
                          setSelectedDate(iso)
                          setCurrentMonth(iso.slice(0, 7))
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 transition hover:border-slate-700 hover:text-white"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          const next = toUtcDate(selectedDate)
                          if (!next) return
                          next.setUTCDate(next.getUTCDate() + 1)
                          const iso = next.toISOString().split('T')[0]
                          setSelectedDate(iso)
                          setCurrentMonth(iso.slice(0, 7))
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 transition hover:border-slate-700 hover:text-white"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <div className="min-w-[600px] rounded-2xl border border-slate-800 bg-slate-900/60">
                      {allDayEvents.length ? (
                        <div className="border-b border-slate-800">
                          <div className="flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            <span>All day</span>
                            <span>{allDayEvents.length} event{allDayEvents.length > 1 ? 's' : ''}</span>
                          </div>
                          <div className="space-y-2 border-t border-slate-800 px-4 py-3">
                            {allDayEvents.map((event) => {
                              const meta = EVENT_TYPE_META[event.eventType] ?? EVENT_TYPE_META.other
                              const EventIcon = meta.icon
                              return (
                                <div
                                  key={event.id}
                                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
                                    event.isCompleted
                                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                                      : 'border-slate-700 bg-slate-900/80 text-slate-200'
                                  }`}
                                >
                                  {EventIcon ? <EventIcon className="h-4 w-4" /> : null}
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-white">{event.title}</span>
                                    <span className="text-xs text-slate-400">{formatEventTime(event)}</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}
                      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <span>Time</span>
                        <span>Events</span>
                      </div>
                      <div className="max-h-[480px] overflow-y-auto">
                        {dayHours.map((hour) => {
                          const hourIndex = Number.parseInt(hour.slice(0, 2), 10)
                          const slotStart = hourIndex * 60
                          const slotEnd = slotStart + 59
                          const hourEvents = timedEvents.filter(
                            ({ startMinutes, endMinutes }) => startMinutes <= slotEnd && endMinutes >= slotStart
                          )

                          return (
                            <div key={hour} className="flex border-b border-slate-800 last:border-none">
                              <div className="w-24 border-r border-slate-800 p-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {hour}
                              </div>
                              <div className="flex-1 p-3">
                                {hourEvents.length ? (
                                  <div className="space-y-2">
                                    {hourEvents.map(({ event }) => {
                                      const meta = EVENT_TYPE_META[event.eventType] ?? EVENT_TYPE_META.other
                                      const EventIcon = meta.icon
                                      return (
                                        <div
                                          key={event.id}
                                          className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
                                            event.isCompleted
                                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                                              : 'border-slate-700 bg-slate-900/80 text-slate-200'
                                          }`}
                                        >
                                          {EventIcon ? <EventIcon className="h-4 w-4" /> : null}
                                          <div className="flex flex-col">
                                            <span className="font-semibold text-white">{event.title}</span>
                                            <span className="text-xs text-slate-400">{formatEventTime(event)}</span>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                ) : (
                                  <div className="rounded-lg border border-dashed border-slate-700 px-3 py-5 text-center text-xs text-slate-600">
                                    No events
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Sidebar - Selected Date Details */}
        <div className="space-y-6">
          {/* Selected Date Info */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur">
            <h3 className="text-lg font-semibold text-slate-100">{formatDate(selectedDate)}</h3>

            <div className="mt-4 space-y-4">
              {selectedDateEvents.map((event) => {
                const meta = EVENT_TYPE_META[event.eventType] ?? EVENT_TYPE_META.other
                const EventIcon = meta.icon
                return (
                  <div key={event.id} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${meta.color}`}>
                        <EventIcon className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-white">{event.title}</h4>
                          {event.isCompleted ? (
                            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                              ✓ Done
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-slate-400">{event.description || 'No description provided.'}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatEventTime(event)}
                          </span>
                          {event.location ? <span>{event.location}</span> : null}
                          {Number.isFinite(event.caloriesConsumed) ? <span>{event.caloriesConsumed} cal planned</span> : null}
                          {Number.isFinite(event.caloriesBurned) ? <span>{event.caloriesBurned} cal burned</span> : null}
                        </div>
                        {event.completionNotes ? (
                          <p className="mt-2 text-xs text-slate-500">Notes: {event.completionNotes}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        disabled={isModifying && activeEventId === event.id}
                        onClick={() => toggleComplete(event.id, !event.isCompleted)}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/10 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {event.isCompleted ? 'Mark incomplete' : 'Mark complete'}
                      </button>
                      <button
                        disabled={isModifying && activeEventId === event.id}
                        onClick={() => deleteEvent(event.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}

              {selectedDateEvents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-10 text-center">
                  <CalendarIcon className="mx-auto mb-4 h-12 w-12 text-slate-600" />
                  <p className="text-sm text-slate-400">No events scheduled</p>
                  <button className="mt-3 text-xs font-semibold uppercase tracking-wide text-olive-400 hover:text-olive-300">
                    Add Event
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {/* Upcoming Events */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur">
            <h3 className="text-lg font-semibold text-slate-100">Upcoming</h3>
            <div className="mt-4 space-y-3 text-sm">
              {upcomingEvents.length ? (
                upcomingEvents.map((event) => {
                  const meta = EVENT_TYPE_META[event.eventType] ?? EVENT_TYPE_META.other
                  const EventIcon = meta.icon
                  return (
                    <div key={event.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-3 transition hover:border-slate-700 hover:bg-slate-900">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${meta.color}`}>
                        <EventIcon className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">{event.title}</p>
                        <p className="text-xs text-slate-400">
                          {normalizeDateString(event.eventDate)} · {formatEventTime(event)}
                        </p>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-4 py-8 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
                  No upcoming events scheduled
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-slate-900 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Add calendar event</DialogTitle>
            <DialogDescription className="text-slate-400">Log upcoming meals, workouts, or reminders.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">Title*</span>
                <input
                  required
                  value={formData.title}
                  onChange={handleFormChange('title')}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-olive-500 focus:outline-none"
                  placeholder="Morning workout"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">Date*</span>
                <input
                  required
                  type="date"
                  value={formData.eventDate}
                  onChange={handleFormChange('eventDate')}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-olive-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">Event type*</span>
                <select
                  value={formData.eventType}
                  onChange={handleFormChange('eventType')}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-olive-500 focus:outline-none"
                >
                  {EVENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} className="bg-slate-900 text-slate-100">
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">Location</span>
                <input
                  value={formData.location}
                  onChange={handleFormChange('location')}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-olive-500 focus:outline-none"
                  placeholder="Fitness studio"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">Start time</span>
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={handleFormChange('startTime')}
                  disabled={formData.isAllDay}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-olive-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-800/60"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">End time</span>
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={handleFormChange('endTime')}
                  disabled={formData.isAllDay}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-olive-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-800/60"
                />
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm">
              <span className="text-xs uppercase tracking-wide text-slate-400">Description</span>
              <textarea
                value={formData.description}
                onChange={handleFormChange('description')}
                rows={3}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-olive-500 focus:outline-none"
                placeholder="Add details or goals for this event"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <input type="checkbox" checked={formData.isAllDay} onChange={handleFormChange('isAllDay')} className="h-4 w-4 rounded border border-slate-600 bg-slate-900 text-olive-500" />
                All day event
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <input type="checkbox" checked={formData.isRecurring} onChange={handleFormChange('isRecurring')} className="h-4 w-4 rounded border border-slate-600 bg-slate-900 text-olive-500" />
                Recurring event
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <input type="checkbox" checked={formData.isCompleted} onChange={handleFormChange('isCompleted')} className="h-4 w-4 rounded border border-slate-600 bg-slate-900 text-olive-500" />
                Mark as complete
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">Reminder (minutes before)</span>
                <input
                  type="number"
                  min="0"
                  value={formData.reminderMinutesBefore}
                  onChange={handleFormChange('reminderMinutesBefore')}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-olive-500 focus:outline-none"
                />
              </label>
            </div>

            {formData.isRecurring ? (
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">Recurrence pattern (JSON)</span>
                <textarea
                  value={formData.recurrencePattern}
                  onChange={handleFormChange('recurrencePattern')}
                  rows={3}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-olive-500 focus:outline-none"
                  placeholder='e.g. {"frequency":"weekly","interval":1}'
                />
              </label>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">Calories planned</span>
                <input
                  type="number"
                  value={formData.caloriesConsumed}
                  onChange={handleFormChange('caloriesConsumed')}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-olive-500 focus:outline-none"
                  placeholder="500"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">Calories burned</span>
                <input
                  type="number"
                  value={formData.caloriesBurned}
                  onChange={handleFormChange('caloriesBurned')}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-olive-500 focus:outline-none"
                  placeholder="300"
                />
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm">
              <span className="text-xs uppercase tracking-wide text-slate-400">Nutrition data (JSON)</span>
              <textarea
                value={formData.nutritionData}
                onChange={handleFormChange('nutritionData')}
                rows={3}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-olive-500 focus:outline-none"
                placeholder='{"protein": 30, "carbs": 50, "fat": 15}'
              />
            </label>

            <label className="flex flex-col gap-2 text-sm">
              <span className="text-xs uppercase tracking-wide text-slate-400">Completion notes</span>
              <textarea
                value={formData.completionNotes}
                onChange={handleFormChange('completionNotes')}
                rows={2}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-olive-500 focus:outline-none"
                placeholder="Reflections or reminders"
              />
            </label>

            {formError ? <p className="text-sm text-rose-300">{formError}</p> : null}

            <DialogFooter>
              <DialogClose
                type="button"
                onClick={() => setIsDialogOpen(false)}
                className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
              >
                Cancel
              </DialogClose>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-lg bg-olive-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-olive-600 disabled:opacity-60"
              >
                {isSubmitting ? 'Saving…' : 'Save event'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-300">
          Loading events…
        </div>
      ) : null}
    </div>
  )
}
