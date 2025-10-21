'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Droplets,
  Plus,
  Loader2,
  ArrowLeft,
  Calendar,
  GlassWater,
  Target,
  TrendingUp,
  Award,
  ChefHat,
  HelpCircle,
  RotateCcw
} from 'lucide-react'
import {
  formatToManilaDate,
  getManilaTodayIso,
  getMsUntilNextManilaMidnight,
  formatManilaDateLabel
} from '@/lib/manilaTime'
import { recommendDailyWaterMl } from '@/lib/recommendations'
import { computeConsecutiveDayStreak } from '@/lib/streaks'

const DEFAULT_LOG_FORM = {
  date: getManilaTodayIso(),
  waterMl: '',
  goalMl: '',
  notes: ''
}

const HYDRATION_PRESETS = [
  { key: 'baseline', label: 'Baseline · 2,000 ml', goalMl: 2000 },
  { key: 'active', label: 'Active · 2,800 ml', goalMl: 2800 },
  { key: 'heavy', label: 'Heavy training · 3,500 ml', goalMl: 3500 }
]

const QUICK_WATER_AMOUNTS = [250, 500, 750, 1000]

const clampNumber = (value, min, max) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return min
  if (numeric < min) return min
  if (typeof max === 'number' && numeric > max) return max
  return numeric
}

const SkeletonBlock = ({ className = '' }) => (
  <div className={`animate-pulse bg-soft-200 dark:bg-gray-800 rounded-lg ${className}`}></div>
)

const parseWaterAmount = (value) => {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
  }
  if (typeof value === 'string') {
    const match = value.match(/-?\d+(?:\.\d+)?/)
    if (!match) return 0
    const numeric = Number(match[0])
    return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0
  }
  return 0
}

const normalizeHydrationLog = (log) => {
  if (!log) {
    return null
  }

  const iso = formatToManilaDate(log.date ?? log.logDate ?? log.log_date)
  const waterMl = parseWaterAmount(log.waterMl ?? log.water_ml)
  const goalParsed = parseWaterAmount(log.goalMl ?? log.goal_ml)

  return {
    ...log,
    date: iso ?? log.date ?? null,
    waterMl,
    goalMl: goalParsed > 0 ? goalParsed : null
  }
}

export default function HydrationLoggerPage() {
  const { status } = useSession()
  const router = useRouter()

  const [hydrationLogs, setHydrationLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [formState, setFormState] = useState(DEFAULT_LOG_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [submitSuccess, setSubmitSuccess] = useState(null)
  const [activePreset, setActivePreset] = useState('baseline')
  const midnightResetRef = useRef(null)
  const dashboardSummaryFetchRef = useRef(false)
  const [isResettingDay, setIsResettingDay] = useState(false)
  const [planInsights, setPlanInsights] = useState({ planId: null, dietPlanId: null, mealPlan: null, dietPlan: null, targets: null })
  const [isLoadingPlan, setIsLoadingPlan] = useState(false)
  const [dashboardPlanSummary, setDashboardPlanSummary] = useState(null)

  const fetchDashboardPlanSummary = useCallback(async () => {
    if (dashboardSummaryFetchRef.current) return

    dashboardSummaryFetchRef.current = true
    try {
      const response = await fetch('/api/fitsavory/dashboard', { cache: 'no-store' })
      if (!response.ok) {
        setDashboardPlanSummary(null)
        return
      }
      const data = await response.json().catch(() => null)
      setDashboardPlanSummary(data?.planSummary ?? null)
    } catch (snapshotError) {
      console.warn('Unable to load dashboard snapshot for hydration page:', snapshotError)
      setDashboardPlanSummary(null)
    } finally {
      dashboardSummaryFetchRef.current = false
    }
  }, [])

  const fetchHydrationLogs = useCallback(
    async ({ signal } = {}) => {
      setIsLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/fitsavory/hydration/logs', {
          cache: 'no-store',
          signal
        })

        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          const message = body?.error || 'Unable to load hydration history'
          console.warn('Hydration logs request returned non-OK status:', response.status, message)
          setError(message)
          setHydrationLogs([])
          return
        }

        const data = await response.json()
        const normalizedLogs = Array.isArray(data?.logs)
          ? data.logs.map(normalizeHydrationLog).filter(Boolean)
          : []
        setHydrationLogs(normalizedLogs)
      } catch (fetchError) {
        if (signal?.aborted) return
        console.error('Hydration log fetch failed:', fetchError)
        setError(fetchError.message || 'Unable to load hydration history right now')
        setHydrationLogs([])
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false)
        }
      }
    },
    []
  )

  const fetchPlanInsights = useCallback(
    async () => {
      if (isLoadingPlan) return
      setIsLoadingPlan(true)
      try {
        const response = await fetch('/api/meal-planner', { cache: 'no-store' })
        if (!response.ok) {
          return
        }
        const data = await response.json().catch(() => ({}))
        const resolvedDietPlanId = data?.dietPlan?.id ?? data?.metadata?.dietPlanId ?? null
        setPlanInsights({
          planId: data?.planId ?? null,
          dietPlanId: resolvedDietPlanId,
          mealPlan: data?.mealPlan ?? null,
          dietPlan: data?.dietPlan ?? null,
          targets: data?.targets ?? null
        })
      } catch (planError) {
        console.warn('Unable to load plan insights for hydration page:', planError)
      } finally {
        setIsLoadingPlan(false)
      }
    },
    [isLoadingPlan]
  )

  const fetchDailyLog = useCallback(async (dietPlanId, isoDate) => {
    try {
      if (!dietPlanId || !isoDate) {
        return null
      }

      const params = new URLSearchParams({ planId: dietPlanId, startDate: isoDate, endDate: isoDate, limit: '1' })
      const response = await fetch(`/api/diet-plans/logs?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) {
        return null
      }
      const data = await response.json()
      if (Array.isArray(data?.logs) && data.logs.length) {
        return data.logs[0] ?? null
      }
      return null
    } catch (logError) {
      console.warn('Failed to retrieve diet plan daily log for hydration page:', logError)
      return null
    }
  }, [])

  useEffect(() => {
    if (status === 'loading') return

    if (status !== 'authenticated') {
      setHydrationLogs([])
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    fetchHydrationLogs({ signal: controller.signal })

    return () => controller.abort()
  }, [status, fetchHydrationLogs])

  useEffect(() => {
    if (status !== 'authenticated') {
      setPlanInsights({ planId: null, dietPlanId: null, mealPlan: null, dietPlan: null, targets: null })
      return
    }
    fetchPlanInsights()
  }, [status, fetchPlanInsights])

  useEffect(() => {
    if (status !== 'authenticated') {
      setDashboardPlanSummary(null)
      return
    }
    fetchDashboardPlanSummary()
  }, [status, fetchDashboardPlanSummary])

  useEffect(() => {
    const scheduleMidnightRefresh = () => {
      const delay = getMsUntilNextManilaMidnight() || 24 * 60 * 60 * 1000
      if (midnightResetRef.current) {
        clearTimeout(midnightResetRef.current)
      }
      midnightResetRef.current = setTimeout(() => {
        setFormState((prev) => ({ ...prev, date: getManilaTodayIso() }))
        fetchHydrationLogs()
        scheduleMidnightRefresh()
      }, delay)
    }

    scheduleMidnightRefresh()

    return () => {
      if (midnightResetRef.current) {
        clearTimeout(midnightResetRef.current)
      }
    }
  }, [fetchHydrationLogs])

  useEffect(() => {
    const handleDashboardRefresh = () => {
      fetchDashboardPlanSummary()
    }

    window.addEventListener('refreshFitSavoryDashboard', handleDashboardRefresh)
    return () => window.removeEventListener('refreshFitSavoryDashboard', handleDashboardRefresh)
  }, [fetchDashboardPlanSummary])

  const selectedDateIso = useMemo(() => formatToManilaDate(formState.date) ?? getManilaTodayIso(), [formState.date])

  useEffect(() => {
    if (status !== 'authenticated') return undefined

    const handleRefresh = () => {
      fetchHydrationLogs()
      fetchDashboardPlanSummary()
      const dietPlanId = planInsights?.dietPlanId
      if (dietPlanId && selectedDateIso) {
        fetchDailyLog(dietPlanId, selectedDateIso).then((log) => {
          setDailyLog(log)
        })
      }
    }

    window.addEventListener('refreshFitSavoryHydration', handleRefresh)
    return () => window.removeEventListener('refreshFitSavoryHydration', handleRefresh)
  }, [status, fetchHydrationLogs, fetchDashboardPlanSummary, fetchDailyLog, planInsights?.dietPlanId, selectedDateIso])

    const recommendedGoal = useMemo(() => {
    const dietPlan = planInsights.dietPlan
    if (!dietPlan) {
      return null
    }

    const weightKg = Number(dietPlan.targetWeightKg ?? dietPlan.goalWeightKg ?? dietPlan.currentWeightKg)
    const calorieTarget = Number(
      dietPlan.dailyCalories ??
        dietPlan.targets?.calories ??
        planInsights.targets?.calories ??
        planInsights.mealPlan?.targets?.calories
    )
    const workoutsPerWeek = Number(dietPlan.workoutsPerWeek ?? planInsights.dietPlan?.workoutsPerWeek)

    const value = recommendDailyWaterMl({
      weightKg: Number.isFinite(weightKg) ? weightKg : undefined,
      calories: Number.isFinite(calorieTarget) ? calorieTarget : undefined,
      workoutsPerWeek: Number.isFinite(workoutsPerWeek) ? workoutsPerWeek : undefined,
      fallback: 2000
    })

    let rationale = 'Based on your plan data'
    if (Number.isFinite(weightKg) && weightKg > 0) {
      rationale = 'Calculated from your target weight'
    } else if (Number.isFinite(calorieTarget) && calorieTarget > 0) {
      rationale = 'Linked to your calorie target'
    } else if (Number.isFinite(workoutsPerWeek) && workoutsPerWeek > 0) {
      rationale = 'Adjusted for workout frequency'
    }

    return { value, rationale }
  }, [planInsights])

  const normalizeGoalValue = useCallback((value) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return null
    if (numeric <= 0) return 0
    return Math.max(0, Math.min(20000, Math.round(numeric)))
  }, [])

  const recommendedGoalMl = useMemo(() => normalizeGoalValue(recommendedGoal?.value), [recommendedGoal?.value, normalizeGoalValue])

  const [dailyLog, setDailyLog] = useState(null)

  const syncDietLogWater = useCallback(
    async (isoDate, waterAmount, { reset = false } = {}) => {
      const dietPlanId = planInsights?.dietPlanId
      if (!dietPlanId || !isoDate) return

      const normalizedWater = Number.isFinite(waterAmount) ? Math.max(0, Math.round(waterAmount)) : null

      const resolveNumeric = (value) => {
        const numeric = Number(value)
        return Number.isFinite(numeric) ? numeric : null
      }

      const resolveField = (log, ...keys) => {
        for (const key of keys) {
          if (log && Object.prototype.hasOwnProperty.call(log, key)) {
            const value = log[key]
            if (value !== undefined && value !== null) {
              return resolveNumeric(value)
            }
          }
        }
        return null
      }

      let baseLog = null
      if (dailyLog && formatToManilaDate(dailyLog.logDate) === isoDate) {
        baseLog = dailyLog
      } else {
        baseLog = await fetchDailyLog(dietPlanId, isoDate)
      }

      const payload = {
        planId: dietPlanId,
        logDate: isoDate,
        weightKg: resolveField(baseLog, 'weightKg', 'weight_kg'),
        caloriesConsumed: resolveField(baseLog, 'caloriesConsumed', 'calories_consumed'),
        caloriesBurned: resolveField(baseLog, 'caloriesBurned', 'calories_burned'),
        protein: resolveField(baseLog, 'protein', 'protein_g'),
        carbs: resolveField(baseLog, 'carbs', 'carbs_g'),
        fat: resolveField(baseLog, 'fat', 'fat_g'),
        waterMl: reset ? null : normalizedWater,
        workoutDurationMinutes: resolveField(baseLog, 'workoutDurationMinutes', 'workout_duration_minutes'),
        notes: baseLog?.notes ?? null
      }

      try {
        const response = await fetch('/api/diet-plans/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          console.warn('Failed to sync diet log water from hydration page:', body?.error || response.statusText)
          return
        }

        const data = await response.json().catch(() => null)
        const logEntry = data?.log ?? data ?? null
        if (logEntry) {
          setDailyLog(logEntry)
        }
      } catch (syncError) {
        console.warn('Unable to sync diet log water from hydration page:', syncError)
      }
    },
    [planInsights?.dietPlanId, dailyLog, fetchDailyLog]
  )

  useEffect(() => {
    if (status !== 'authenticated') {
      setDailyLog(null)
      return
    }

    let isMounted = true
    const load = async () => {
      const iso = selectedDateIso
      if (!iso) {
        setDailyLog(null)
        return
      }
      const dietPlanId = planInsights?.dietPlanId
      if (!dietPlanId) {
        setDailyLog(null)
        return
      }
      const log = await fetchDailyLog(dietPlanId, iso)
      if (isMounted) {
        setDailyLog(log)
      }
    }

    load()
    return () => {
      isMounted = false
    }
  }, [status, selectedDateIso, fetchDailyLog, planInsights?.dietPlanId])

  const hydrationEntriesMl = useMemo(() => {
    const entries = hydrationLogs.filter((log) => formatToManilaDate(log.date) === selectedDateIso)
    if (!entries.length) return []
    return entries.map((log) => parseWaterAmount(log.waterMl))
  }, [hydrationLogs, selectedDateIso])

  const snapshotGoalsByDate = useMemo(() => {
    if (!dashboardPlanSummary?.daySummaries?.length) {
      return {}
    }

    return dashboardPlanSummary.daySummaries.reduce((acc, day) => {
      const iso = formatToManilaDate(day?.date) ?? day?.date ?? null
      if (!iso) {
        return acc
      }

      const goalValue = parseWaterAmount(day?.waterGoalMl ?? day?.water_goal_ml ?? day?.waterGoal ?? null)
      if (goalValue > 0) {
        acc[iso] = goalValue
      }
      return acc
    }, {})
  }, [dashboardPlanSummary?.daySummaries])

  const snapshotPlanDefaultGoal = useMemo(() => {
    if (!dashboardPlanSummary?.targets) {
      return null
    }

    const targetGoal = parseWaterAmount(
      dashboardPlanSummary.targets?.waterMl ??
        dashboardPlanSummary.targets?.water_ml ??
        dashboardPlanSummary.targets?.waterGoal ??
        dashboardPlanSummary.targets?.water_goal ??
        null
    )

    return targetGoal > 0 ? targetGoal : null
  }, [dashboardPlanSummary?.targets])

  const dailyLogWaterMl = useMemo(() => parseWaterAmount(dailyLog?.waterMl ?? dailyLog?.water_ml), [dailyLog])

  const totalMlForSelectedDate = useMemo(() => {
    if (hydrationEntriesMl.length > 0) {
      return hydrationEntriesMl.reduce((acc, entry) => acc + entry, 0)
    }
    return dailyLogWaterMl
  }, [hydrationEntriesMl, dailyLogWaterMl])

  const hasLogsForSelectedDate = useMemo(
    () => totalMlForSelectedDate > 0,
    [totalMlForSelectedDate]
  )

  const goalMl = useMemo(() => {
    if (formState.goalMl !== '' && formState.goalMl !== null && formState.goalMl !== undefined) {
      const resolved = normalizeGoalValue(formState.goalMl)
      if (resolved !== null) {
        return resolved
      }
    }

    const snapshotGoal = selectedDateIso ? snapshotGoalsByDate[selectedDateIso] : null
    if (Number.isFinite(snapshotGoal) && snapshotGoal > 0) {
      return snapshotGoal
    }

    if (Number.isFinite(snapshotPlanDefaultGoal) && snapshotPlanDefaultGoal > 0) {
      return snapshotPlanDefaultGoal
    }

    if (Number.isFinite(recommendedGoalMl) && recommendedGoalMl > 0) {
      return recommendedGoalMl
    }

    const preset = HYDRATION_PRESETS.find((item) => item.key === activePreset)
    return normalizeGoalValue(preset?.goalMl) ?? 2000
  }, [
    formState.goalMl,
    activePreset,
    selectedDateIso,
    snapshotGoalsByDate,
    snapshotPlanDefaultGoal,
    recommendedGoalMl,
    normalizeGoalValue
  ])

  useEffect(() => {
    if (!formState.goalMl && Number.isFinite(goalMl) && goalMl > 0) {
      setFormState((prev) => ({ ...prev, goalMl: String(goalMl) }))
    }
  }, [goalMl, formState.goalMl])

  const dailyTotals = useMemo(() => {
    const totals = hydrationLogs.reduce((acc, log) => {
      if (!log?.date) return acc
      const key = formatToManilaDate(log.date)
      const amount = parseWaterAmount(log?.waterMl ?? log?.water_ml)
      if (key && amount > 0) {
        acc[key] = (acc[key] || 0) + amount
      }
      return acc
    }, {})

    if (selectedDateIso && !(selectedDateIso in totals)) {
      if (dailyLogWaterMl > 0) {
        totals[selectedDateIso] = dailyLogWaterMl
      }
    }

    return totals
  }, [hydrationLogs, selectedDateIso, dailyLogWaterMl])

  const dailyGoals = useMemo(() => {
    const goals = { ...snapshotGoalsByDate }

    hydrationLogs.forEach((log) => {
      if (!log?.date) return
      const key = formatToManilaDate(log.date)
      if (!key) return
      const goalValue = parseWaterAmount(log?.goalMl ?? log?.goal_ml)
      if (goalValue > 0) {
        goals[key] = goalValue
      }
    })

    if (selectedDateIso && Number.isFinite(goalMl) && goalMl > 0) {
      goals[selectedDateIso] = goalMl
    }

    return goals
  }, [hydrationLogs, selectedDateIso, goalMl, snapshotGoalsByDate])

  const bestDay = useMemo(() => {
    const totals = Object.values(dailyTotals)
    if (!totals.length) return null
    return Math.max(...totals)
  }, [dailyTotals])

  const hydrationStreak = useMemo(() => {
    const completedDates = Object.entries(dailyTotals)
      .filter(([, amount]) => amount > 0)
      .map(([iso]) => iso)

    return computeConsecutiveDayStreak({
      completedDates,
      todayIso: getManilaTodayIso(),
      dateFormatter: (value) => formatToManilaDate(value)
    })
  }, [dailyTotals])

  const goalCompletion = useMemo(() => {
    if (!goalMl) return 0
    if (!Number.isFinite(goalMl)) return 0
    const completion = Math.round((totalMlForSelectedDate / goalMl) * 100)
    return Math.max(0, Math.min(100, completion))
  }, [goalMl, totalMlForSelectedDate])

  const remainingMl = useMemo(() => {
    if (!goalMl) return 0
    const remaining = goalMl - totalMlForSelectedDate
    return remaining > 0 ? remaining : 0
  }, [goalMl, totalMlForSelectedDate])

  const hydrationStatusMessage = useMemo(() => {
    if (!totalMlForSelectedDate) {
      return 'Log your first glass to start the day strong.'
    }

    if (goalCompletion >= 100) {
      return 'Goal crushed! Keep hydrating steadily through the day.'
    }

    return `Only ${remainingMl.toLocaleString()} ml left to hit your goal.`
  }, [goalCompletion, remainingMl, totalMlForSelectedDate])

  const smartSuggestion = useMemo(() => {
    if (!goalMl) {
      return null
    }

    if (!totalMlForSelectedDate) {
      return 'Kickstart your day with a quick 250 ml glass.'
    }

    if (goalCompletion >= 110) {
      return 'You are well ahead—keep sipping water steadily throughout the day.'
    }

    if (goalCompletion >= 100) {
      return 'Maintain your momentum with small sips every hour.'
    }

    const remaining = remainingMl
    if (!remaining) {
      return null
    }

    const nextSip = Math.min(remaining, 500)
    const glasses = Math.max(1, Math.ceil(nextSip / 250))
    return `Add ${nextSip.toLocaleString()} ml (${glasses} glass${glasses === 1 ? '' : 'es'}) to close the gap quickly.`
  }, [goalMl, goalCompletion, totalMlForSelectedDate, remainingMl])

  const baselineWeeklyGoal = useMemo(() => {
    if (Number.isFinite(goalMl) && goalMl > 0) {
      return goalMl
    }
    if (Number.isFinite(snapshotPlanDefaultGoal) && snapshotPlanDefaultGoal > 0) {
      return snapshotPlanDefaultGoal
    }
    if (Number.isFinite(recommendedGoalMl) && recommendedGoalMl > 0) {
      return recommendedGoalMl
    }
    return null
  }, [goalMl, snapshotPlanDefaultGoal, recommendedGoalMl])

  const weeklySeries = useMemo(() => {
    const todayIso = getManilaTodayIso()
    if (!todayIso) {
      return []
    }

    const baseDate = new Date(`${todayIso}T00:00:00+08:00`)
    const result = []

    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = new Date(baseDate)
      day.setDate(baseDate.getDate() - offset)
      const iso = formatToManilaDate(day)
      const label = formatManilaDateLabel(iso) ?? iso ?? '—'
      const amount = iso ? dailyTotals[iso] || 0 : 0
      const goal = iso ? dailyGoals[iso] ?? baselineWeeklyGoal ?? null : null
      result.push({ iso, label, amount, goal })
    }

    return result
  }, [dailyTotals, dailyGoals, baselineWeeklyGoal])

  const weeklyMax = useMemo(() => {
    const baseline = baselineWeeklyGoal ?? 0
    return weeklySeries.reduce((max, entry) => (entry.amount > max ? entry.amount : max), baseline)
  }, [weeklySeries, baselineWeeklyGoal])

  const handlePresetSelect = (presetKey) => {
    const preset = HYDRATION_PRESETS.find((item) => item.key === presetKey)
    if (!preset) return
    setActivePreset(presetKey)
    setFormState((prev) => ({ ...prev, goalMl: String(normalizeGoalValue(preset.goalMl) ?? preset.goalMl ?? '') }))
  }

  const handleChange = (field) => (event) => {
    const { value } = event.target
    setFormState((prev) => ({ ...prev, [field]: value }))
  }

  const handleQuickAdd = (amount) => {
    setFormState((prev) => {
      const currentNumeric = Number(prev.waterMl)
      const current = Number.isFinite(currentNumeric) ? currentNumeric : 0
      const next = clampNumber(current + amount, 0, 20000)
      return { ...prev, waterMl: next ? String(next) : '' }
    })
  }

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault()
      if (status !== 'authenticated') {
        router.push('/auth/login?callbackUrl=/fitsavory/hydration')
        return
      }

      setIsSubmitting(true)
      setSubmitError(null)
      setSubmitSuccess(null)

      try {
        const intakeAmount = clampNumber(formState.waterMl, 0, 20000)
        const payload = {
          date: formState.date,
          waterMl: intakeAmount,
          goalMl: Number.isFinite(goalMl) ? goalMl : null,
          notes: formState.notes?.trim() || null
        }

        const response = await fetch('/api/fitsavory/hydration/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body?.error || 'Failed to save hydration log')
        }

        const newEntry = await response.json()
        if (!newEntry?.loggedAt) {
          newEntry.loggedAt = new Date().toISOString()
        }
        const normalizedEntry = normalizeHydrationLog(newEntry)
        if (normalizedEntry) {
          setHydrationLogs((prev) => {
            if (!normalizedEntry.id) {
              return [normalizedEntry, ...prev]
            }
            const deduped = prev.filter((log) => log?.id !== normalizedEntry.id)
            return [normalizedEntry, ...deduped]
          })
        }

        const isoDate = selectedDateIso
        if (isoDate) {
          const dietLogMatchesSelected = formatToManilaDate(dailyLog?.logDate) === isoDate
          const dietLogBaseline = dietLogMatchesSelected ? dailyLogWaterMl : 0
          const baselineTotal = hydrationEntriesMl > 0 ? hydrationEntriesMl : dietLogBaseline
          const updatedTotal = baselineTotal + intakeAmount
          await syncDietLogWater(isoDate, updatedTotal)
        }

        setSubmitSuccess('Hydration entry saved!')
        setFormState((prev) => ({ ...prev, waterMl: '', notes: '' }))
        window.dispatchEvent(new Event('refreshFitSavoryDashboard'))
        window.dispatchEvent(new Event('refreshFitSavoryHydration'))
        await fetchHydrationLogs()
      } catch (submitErr) {
        console.error('Hydration log submission failed:', submitErr)
        setSubmitError(submitErr.message || 'Unable to save hydration log right now')
      } finally {
        setIsSubmitting(false)
      }
    },
    [formState, goalMl, router, status, fetchHydrationLogs, selectedDateIso, syncDietLogWater, dailyLogWaterMl, hydrationEntriesMl]
  )

  const handleResetSelectedDay = useCallback(async () => {
    if (status !== 'authenticated') {
      router.push('/auth/login?callbackUrl=/fitsavory/hydration')
      return
    }

    if (!selectedDateIso) {
      setSubmitError('Select a valid date before resetting intake.')
      return
    }

    setIsResettingDay(true)
    setSubmitError(null)
    setSubmitSuccess(null)

    try {
      const response = await fetch('/api/fitsavory/hydration/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDateIso })
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body?.error || 'Failed to reset hydration intake')
      }

      setHydrationLogs((prev) => prev.filter((log) => formatToManilaDate(log.date) !== selectedDateIso))
      await fetchHydrationLogs()

      await syncDietLogWater(selectedDateIso, null, { reset: true })
      setSubmitSuccess('Hydration intake cleared for this day.')
      setFormState((prev) => ({ ...prev, waterMl: '', notes: '' }))
      window.dispatchEvent(new Event('refreshFitSavoryDashboard'))
      window.dispatchEvent(new Event('refreshFitSavoryHydration'))
    } catch (resetErr) {
      console.error('Hydration reset failed:', resetErr)
      setSubmitError(resetErr.message || 'Unable to reset hydration intake right now')
    } finally {
      setIsResettingDay(false)
    }
  }, [status, router, selectedDateIso, fetchHydrationLogs, syncDietLogWater])

  return (
    <div className="min-h-screen bg-soft-50 dark:bg-gray-950">
      <div className="h-10 sm:h-14 md:h-16"></div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-0 pb-10 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-sm font-fredoka text-gray-500 dark:text-gray-300">
            <Calendar className="h-4 w-4" />
            {formatManilaDateLabel(formState.date) ?? 'Select a date'}
          </div>
          <div className="flex items-center gap-2 text-xs font-fredoka text-gray-500 dark:text-gray-300">
            <Droplets className="h-4 w-4 text-olive-500" />
            {goalCompletion >= 100 ? 'Hydration goal met for today' : `${goalCompletion}% of today’s goal completed`}
          </div>
        </div>
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-fredoka text-rose-600 dark:border-rose-300/30 dark:bg-rose-900/20 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[2fr_1fr] lg:items-start">
          <aside className="order-1 lg:order-2 space-y-6 lg:sticky lg:top-28">
            <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-soft-100 dark:border-gray-800">
              <h2 className="text-lg font-fredoka font-semibold text-gray-900 dark:text-gray-100 mb-4">Today at a glance</h2>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-fredoka text-gray-500 dark:text-gray-300">Goal completion</span>
                  <span className="text-base font-fredoka font-semibold text-gray-900 dark:text-gray-100">{goalCompletion}%</span>
                </div>
                <div className="w-full bg-soft-200 dark:bg-gray-800 rounded-full h-2">
                  <div
                    className="bg-olive-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${goalCompletion}%` }}
                  ></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-soft-200 dark:border-gray-800 p-3">
                    <div className="flex items-center gap-2 text-sm font-fredoka text-gray-500 dark:text-gray-300">
                      <Target className="h-4 w-4 text-olive-500" />
                      Daily goal
                    </div>
                    <p className="text-lg font-fredoka font-semibold text-gray-900 dark:text-gray-100">
                      {goalMl.toLocaleString()} ml
                    </p>
                    {recommendedGoal ? (
                      <p className="mt-1 text-xs font-fredoka text-gray-500 dark:text-gray-400">
                        Suggested: {recommendedGoal.value.toLocaleString()} ml · {recommendedGoal.rationale}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-soft-200 dark:border-gray-800 p-3">
                    <div className="flex items-center gap-2 text-sm font-fredoka text-gray-500 dark:text-gray-300">
                      <TrendingUp className="h-4 w-4 text-olive-500" />
                      Avg intake
                    </div>
                    <p className="text-lg font-fredoka font-semibold text-gray-900 dark:text-gray-100">
                      {(() => {
                        const totals = Object.values(dailyTotals)
                        if (!totals.length) return '—'
                        const average = Math.round(totals.reduce((acc, value) => acc + value, 0) / totals.length)
                        return `${average.toLocaleString()} ml`
                      })()}
                    </p>
                  </div>
                  <div className="rounded-lg border border-soft-200 dark:border-gray-800 p-3">
                    <div className="flex items-center gap-2 text-sm font-fredoka text-gray-500 dark:text-gray-300">
                      <Award className="h-4 w-4 text-olive-500" />
                      Current streak
                    </div>
                    <p className="text-lg font-fredoka font-semibold text-gray-900 dark:text-gray-100">
                      {hydrationStreak} day{hydrationStreak === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-soft-200 dark:border-gray-800 p-3">
                    <div className="flex items-center gap-2 text-sm font-fredoka text-gray-500 dark:text-gray-300">
                      <GlassWater className="h-4 w-4 text-olive-500" />
                      Best day
                    </div>
                    <p className="text-lg font-fredoka font-semibold text-gray-900 dark:text-gray-100">
                      {bestDay ? `${bestDay.toLocaleString()} ml` : '—'}
                    </p>
                  </div>
                </div>
                {hydrationLogs.length ? (
                  <p className="text-xs font-fredoka text-gray-500 dark:text-gray-400">
                    Last entry recorded {hydrationLogs[0]?.date ? new Date(hydrationLogs[0].date).toLocaleString() : 'recently'}
                  </p>
                ) : null}
                {smartSuggestion ? (
                  <div className="mt-4 rounded-lg border border-soft-200 bg-soft-100 p-3 text-sm font-fredoka text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Hydration boost</p>
                    <p>{smartSuggestion}</p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-soft-100 dark:border-gray-800">
              <h2 className="text-lg font-fredoka font-semibold text-gray-900 dark:text-gray-100 mb-4">Hydration tips</h2>
              <ul className="space-y-3 text-sm font-fredoka text-gray-600 dark:text-gray-300">
                <li className="rounded-lg border border-soft-200 dark:border-gray-800 p-3">
                  Break your goal into glasses. Aim for {(goalMl / 8 || 250).toFixed(0)} ml every 2 hours.
                </li>
                <li className="rounded-lg border border-soft-200 dark:border-gray-800 p-3">
                  Log after every bottle to keep your streak going and spot low-intake days quickly.
                </li>
                <li className="rounded-lg border border-soft-200 dark:border-gray-800 p-3">
                  Add a quick note when training or in hot weather so your future goals can adapt.
                </li>
              </ul>
            </div>
          </aside>

          <div className="order-2 lg:order-1 space-y-6">
            <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-soft-100 dark:border-gray-800">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-fredoka font-semibold text-gray-900 dark:text-gray-100">Hydration Tracker</h1>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Log your water intake and stay on track with your daily hydration goal.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleResetSelectedDay}
                      disabled={isResettingDay || !hasLogsForSelectedDate}
                      className="inline-flex items-center gap-2 rounded-lg border border-soft-200 px-3 py-1.5 text-xs font-fredoka text-gray-700 transition-colors hover:border-rose-400 hover:text-rose-600 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:border-rose-400 dark:hover:text-rose-200"
                    >
                      {isResettingDay ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      Reset selected day
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push('/fitsavory/meals')}
                      className="inline-flex items-center gap-2 rounded-lg border border-soft-200 px-3 py-1.5 text-xs font-fredoka text-gray-700 hover:border-olive-400 hover:text-olive-600 dark:border-gray-700 dark:text-gray-200"
                    >
                      <ChefHat className="h-3.5 w-3.5" />
                      Open meal tracking
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push('/fitsavory')}
                      className="inline-flex items-center gap-2 rounded-lg border border-soft-200 px-3 py-1.5 text-xs font-fredoka text-gray-700 hover:border-olive-400 hover:text-olive-600 dark:border-gray-700 dark:text-gray-200"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                      View dashboard
                    </button>
                  </div>
                </div>
                <Droplets className="h-10 w-10 text-olive-500 sm:self-start" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">Daily intake</p>
                    {isLoading ? (
                      <SkeletonBlock className="h-10 mt-2" />
                    ) : (
                      <p className="text-3xl font-fredoka font-bold text-gray-900 dark:text-gray-100">
                        {totalMlForSelectedDate.toLocaleString()} ml
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">Goal</p>
                    <p className="text-xl font-fredoka font-semibold text-gray-900 dark:text-gray-100">
                      {goalMl.toLocaleString()} ml
                    </p>
                  </div>
                  <div
                    className={`rounded-lg border px-3 py-3 font-fredoka text-sm transition-colors ${
                      goalCompletion >= 100
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/30 dark:bg-emerald-900/20 dark:text-emerald-200'
                        : 'border-soft-200 bg-soft-100 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Droplets className={`h-4 w-4 mt-0.5 ${goalCompletion >= 100 ? 'text-emerald-500' : 'text-olive-500'}`} />
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</p>
                        <p className="text-sm font-medium">{hydrationStatusMessage}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">Presets</p>
                    <div className="flex flex-wrap gap-2">
                      {HYDRATION_PRESETS.map((preset) => (
                        <button
                          key={preset.key}
                          onClick={() => handlePresetSelect(preset.key)}
                          className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors font-fredoka ${
                            activePreset === preset.key
                              ? 'bg-olive-600 text-white border-olive-600'
                              : 'border-soft-300 text-gray-600 hover:border-olive-400 hover:text-olive-600 dark:border-gray-700 dark:text-gray-300 dark:hover:border-olive-400 dark:hover:text-olive-200'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-fredoka text-gray-600 dark:text-gray-300 mb-1">Date</label>
                    <input
                      type="date"
                      value={formState.date}
                      onChange={handleChange('date')}
                      className="w-full rounded-lg border border-soft-300 px-3 py-2 font-fredoka focus:outline-none focus:ring-2 focus:ring-olive-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                      max={getManilaTodayIso()}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-fredoka text-gray-600 dark:text-gray-300 mb-1">Water Intake (ml)</label>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      step={50}
                      value={formState.waterMl}
                      onChange={handleChange('waterMl')}
                      className="w-full rounded-lg border border-soft-300 px-3 py-2 font-fredoka focus:outline-none focus:ring-2 focus:ring-olive-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                      placeholder="E.g. 500"
                      required
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {QUICK_WATER_AMOUNTS.map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => handleQuickAdd(amount)}
                          className="inline-flex items-center gap-1 rounded-full border border-soft-300 px-3 py-1 text-xs font-fredoka text-gray-600 transition-colors hover:border-olive-400 hover:text-olive-600 dark:border-gray-700 dark:text-gray-300 dark:hover:border-olive-400 dark:hover:text-olive-200"
                        >
                          <Plus className="h-3 w-3" />
                          {amount} ml
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-fredoka text-gray-600 dark:text-gray-300 mb-1">Goal (ml)</label>
                    <input
                      type="number"
                      value={formState.goalMl}
                      onChange={handleChange('goalMl')}
                      className="w-full rounded-lg border border-soft-300 px-3 py-2 font-fredoka focus:outline-none focus:ring-2 focus:ring-olive-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                      placeholder="E.g. 850"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-fredoka text-gray-600 dark:text-gray-300 mb-1">Notes</label>
                    <textarea
                      value={formState.notes}
                      onChange={handleChange('notes')}
                      rows={3}
                      className="w-full rounded-lg border border-soft-300 px-3 py-2 font-fredoka focus:outline-none focus:ring-2 focus:ring-olive-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                      placeholder="Optional note (e.g. post-workout hydration)"
                    ></textarea>
                  </div>

                  {submitError ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-fredoka text-rose-600 dark:border-rose-300/30 dark:bg-rose-900/20 dark:text-rose-200">
                      {submitError}
                    </div>
                  ) : null}

                  {submitSuccess ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-fredoka text-emerald-700 dark:border-emerald-300/30 dark:bg-emerald-900/20 dark:text-emerald-200">
                      {submitSuccess}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isSubmitting || isResettingDay}
                    className="w-full bg-olive-600 text-white py-3 px-4 rounded-lg hover:bg-olive-700 transition-colors flex items-center justify-center space-x-2 font-fredoka font-medium disabled:opacity-60"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    <span>{isSubmitting ? 'Saving...' : 'Log intake'}</span>
                  </button>
                </form>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-soft-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-fredoka font-semibold text-gray-900 dark:text-gray-100">Recent hydration activity</h2>
                  <GlassWater className="h-5 w-5 text-olive-500" />
                </div>
                {isLoading ? (
                  <div className="space-y-3">
                    {[0, 1, 2, 3].map((item) => (
                      <SkeletonBlock key={item} className="h-12" />
                    ))}
                  </div>
                ) : hydrationLogs.length ? (
                  <div className="max-h-[420px] lg:max-h-[460px] overflow-y-auto pr-1">
                    <ul className="divide-y divide-soft-100 dark:divide-gray-800">
                      {hydrationLogs.slice(0, 10).map((log) => {
                        const fallbackKey = `${log.date || 'log'}-${log.waterMl || 0}`
                        return (
                          <li key={log.id || fallbackKey} className="py-3 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-fredoka font-medium text-gray-900 dark:text-gray-100">
                                {log.waterMl?.toLocaleString?.() || log.waterMl} ml
                              </p>
                              <p className="text-xs font-fredoka text-gray-500 dark:text-gray-400">
                                {log.date ? new Date(log.date).toLocaleDateString() : 'No date'}
                              </p>
                            </div>
                            <div className="text-right text-xs font-fredoka text-gray-600 dark:text-gray-300">
                              <p>Goal {log.goalMl?.toLocaleString?.() || log.goalMl} ml</p>
                              {log.notes ? <p className="text-gray-400 dark:text-gray-500">{log.notes}</p> : null}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-300 font-fredoka">
                    No hydration entries yet. Log your first intake above to track your progress.
                  </p>
                )}
              </div>

              <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-soft-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-fredoka font-semibold text-gray-900 dark:text-gray-100">Weekly hydration trend</h2>
                  <TrendingUp className="h-5 w-5 text-olive-500" />
                </div>
                {weeklySeries.length ? (
                  <div className="max-h-[420px] lg:max-h-[460px] overflow-y-auto pr-1 space-y-3">
                    {weeklySeries.map((entry) => {
                      const target = Number.isFinite(entry.goal) && entry.goal > 0 ? entry.goal : null
                      const divisor = target ?? (weeklyMax > 0 ? weeklyMax : 1)
                      const progressRaw = Math.round((entry.amount / divisor) * 100)
                      const progress = Math.max(0, Math.min(100, progressRaw))
                      return (
                        <div key={entry.iso} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-fredoka text-gray-500 dark:text-gray-400">
                            <span>{entry.label}</span>
                            <span>{entry.amount.toLocaleString()} ml</span>
                          </div>
                          <div className="w-full bg-soft-200 dark:bg-gray-800 rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-olive-500 transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            ></div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-300 font-fredoka">
                    Log hydration across the week to unlock trend insights and spot low-intake days.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
