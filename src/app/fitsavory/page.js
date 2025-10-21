'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  Calendar,
  TrendingUp,
  Target,
  Flame,
  Apple,
  Droplets,
  Clock,
  Award,
  Plus,
  ChefHat,
  Utensils,
  HelpCircle,
  Info,
  PlayCircle
} from 'lucide-react'
import {
  formatManilaDateLabel,
  formatManilaTimeLabel,
  formatToManilaDate,
  getManilaTodayIso,
  getMsUntilNextManilaMidnight,
  PHILIPPINES_TIME_ZONE
} from '@/lib/manilaTime'
import { recommendDailyWaterMl } from '@/lib/recommendations'
import {
  clearCachedSubscriptionStatus,
  getCachedSubscriptionStatus,
  resolveFitSavoryAccess,
  setCachedSubscriptionStatus
} from '@/lib/subscriptionCache'

const clampNumber = (value, min, max) => {
  if (Number.isNaN(value)) return min
  if (typeof max === 'number' && value > max) return max
  if (value < min) return min
  return value
}

const getTodayIsoDate = () => getManilaTodayIso()

const formatDate = (value) => formatManilaDateLabel(value)

const formatSnapshotDate = (value) => {
  if (!value) return null

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: PHILIPPINES_TIME_ZONE,
      month: '2-digit',
      day: '2-digit',
      year: '2-digit'
    })

    const dateValue = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value
    if (Number.isNaN(dateValue?.getTime())) {
      return null
    }

    return formatter.format(dateValue)
  } catch (error) {
    console.warn('Unable to format snapshot date:', error)
    return null
  }
}

const parseNumber = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const resolveFirstNumber = (...values) => {
  for (const value of values) {
    const numeric = parseNumber(value)
    if (numeric != null) {
      return numeric
    }
  }
  return null
}

const toDateOrNull = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const safeRound = (value) => {
  const numeric = parseNumber(value)
  return numeric == null ? 0 : Math.round(numeric)
}

const roundOrNull = (value) => {
  const numeric = parseNumber(value)
  return numeric == null ? null : Math.round(numeric)
}

const parseWaterMl = (value) => {
  if (value === null || value === undefined || value === '') {
    return 0
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
  }

  if (typeof value === 'string') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0
  }

  return 0
}

const SkeletonBlock = ({ className = '' }) => (
  <div className={`animate-pulse bg-soft-200 dark:bg-gray-800 rounded-lg ${className}`}></div>
)

const createRingStyle = (percent, color, track = 'rgba(148, 163, 184, 0.2)') => {
  const normalized = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0
  return {
    background: `conic-gradient(${color} ${normalized}%, ${track} ${normalized}% 100%)`,
    mask: 'radial-gradient(farthest-side, transparent calc(100% - 12px), black calc(100% - 12px))',
    WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 12px), black calc(100% - 12px))'
  }
}

const DASHBOARD_CACHE_KEY = 'fitsavory_dashboard_cache_v1'
const MEALPLAN_CACHE_KEY = 'fitsavory_meal_plan_cache_v1'
const CACHE_TTL_MS = 5 * 60 * 1000

const readCacheEntry = (key) => {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null

    const timestamp = Number(parsed.timestamp)
    if (Number.isFinite(timestamp) && Date.now() - timestamp > CACHE_TTL_MS) {
      window.sessionStorage.removeItem(key)
      return null
    }

    return {
      value: parsed.value ?? null,
      timestamp: timestamp || Date.now()
    }
  } catch (error) {
    console.warn('Unable to read FitSavory cache:', error)
    return null
  }
}

const writeCacheEntry = (key, value) => {
  if (typeof window === 'undefined') return
  try {
    const payload = JSON.stringify({ value, timestamp: Date.now() })
    window.sessionStorage.setItem(key, payload)
  } catch (error) {
    console.warn('Unable to write FitSavory cache:', error)
  }
}

const clearCacheEntry = (key) => {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(key)
  } catch (error) {
    console.warn('Unable to clear FitSavory cache:', error)
  }
}

export default function FitSavoryDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [mealPlan, setMealPlan] = useState(null)
  const [subscriptionStatus, setSubscriptionStatus] = useState(null)
  const [error, setError] = useState(null)
  const [subscriptionLoading, setSubscriptionLoading] = useState(true)
  const [planLoading, setPlanLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [calorieTarget, setCalorieTarget] = useState(2000)
  const [days, setDays] = useState(7)
  const [plannerInputs, setPlannerInputs] = useState({
    calories: '2000',
    protein: '150',
    carbs: '250',
    fat: '67',
    days: '7'
  })
  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
  const [dailySnapshots, setDailySnapshots] = useState([])
  const [activeSnapshotIndex, setActiveSnapshotIndex] = useState(0)
  const [dietPlans, setDietPlans] = useState([])
  const [activeDietPlanId, setActiveDietPlanId] = useState(null)
  const hasActivePlan = Boolean(activeDietPlanId)
  const [dailyLog, setDailyLog] = useState(null)
  const [isLogLoading, setIsLogLoading] = useState(false)
  const [logError, setLogError] = useState(null)
  const [selectedDayLogEntry, setSelectedDayLogEntry] = useState(null)
  const [isSelectedDayLogLoading, setIsSelectedDayLogLoading] = useState(false)
  const [dashboard, setDashboard] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState(null)
  const [currentDateIso, setCurrentDateIso] = useState(getTodayIsoDate)
  const [isGuideOpen, setIsGuideOpen] = useState(false)
  const prevPlannerTargetsRef = useRef(null)

  useEffect(() => {
    let isMounted = true

    const applySubscriptionData = (data) => {
      if (!isMounted) return
      const hasAccess = resolveFitSavoryAccess(data)
      setSubscriptionStatus(hasAccess)
    }

    const checkSubscription = async ({ manageLoading } = { manageLoading: true }) => {
      if (manageLoading && isMounted) {
        setSubscriptionLoading(true)
      }

      try {
        const response = await fetch('/api/user/subscription', { cache: 'no-store' })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to check subscription status')
        }

        if (!isMounted) {
          return
        }

        setCachedSubscriptionStatus(data)
        applySubscriptionData(data)
      } catch (err) {
        console.error('Subscription check error:', err)
        if (!isMounted) {
          return
        }
        if (manageLoading) {
          setError('An error occurred while checking your subscription')
        }
      } finally {
        if (manageLoading && isMounted) {
          setSubscriptionLoading(false)
        }
      }
    }

    if (status === 'authenticated') {
      const cached = getCachedSubscriptionStatus()
      if (cached) {
        applySubscriptionData(cached)
        setSubscriptionLoading(false)
        checkSubscription({ manageLoading: false })
      } else {
        checkSubscription()
      }
    } else if (status === 'unauthenticated') {
      clearCachedSubscriptionStatus()
      setSubscriptionLoading(false)
      setPlanLoading(false)
    }

    return () => {
      isMounted = false
    }
  }, [status])

  const loadDashboardOverview = useCallback(async ({ allowCache = true } = {}) => {
    try {
      if (allowCache) {
        const cached = readCacheEntry(DASHBOARD_CACHE_KEY)
        if (cached?.value) {
          setDashboard(cached.value)
          setDashboardLoading(false)
          setDashboardError(null)
        }
      }

      setDashboardLoading((previous) => previous || !allowCache)
      setDashboardError(null)
      const response = await fetch('/api/fitsavory/dashboard', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`Dashboard request failed (${response.status})`)
      }
      const data = await response.json()
      setDashboard(data ?? null)
      writeCacheEntry(DASHBOARD_CACHE_KEY, data ?? null)
    } catch (dashboardFetchError) {
      console.error('Failed to load FitSavory dashboard overview:', dashboardFetchError)
      setDashboard(null)
      setDashboardError('Unable to load dashboard overview right now.')
      clearCacheEntry(DASHBOARD_CACHE_KEY)
    } finally {
      setDashboardLoading(false)
    }
  }, [])

  const fetchDietPlanLog = useCallback(async ({ planId, date }) => {
    if (!planId || !date) return null

    const params = new URLSearchParams({
      planId: planId.toString(),
      startDate: date,
      endDate: date,
      limit: '1'
    })

    const response = await fetch(`/api/diet-plans/logs?${params.toString()}`, { cache: 'no-store' })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body?.error || 'Failed to load diet plan log entry')
    }

    const data = await response.json()
    const logs = Array.isArray(data?.logs) ? data.logs : []
    return logs.length ? logs[0] : null
  }, [])

  const loadDailyLog = useCallback(
    async ({ planId, date }) => {
      if (!planId || !date) {
        setDailyLog(null)
        return null
      }

      setIsLogLoading(true)
      setLogError(null)

      try {
        const logEntry = await fetchDietPlanLog({ planId, date })
        setDailyLog(logEntry)
        return logEntry
      } catch (logError) {
        console.error('Error loading diet plan log:', logError)
        setDailyLog(null)
        setLogError(logError.message || 'Unable to load your daily log right now')
        return null
      } finally {
        setIsLogLoading(false)
      }
    },
    [fetchDietPlanLog]
  )

  const fetchLatestMealPlan = useCallback(
    async (planIdOverride = null, { allowCache = true } = {}) => {
      const effectiveDietPlanId = planIdOverride ?? activeDietPlanId
      if (!effectiveDietPlanId) {
        setMealPlan(null)
        setPlanLoading(false)
        return
      }

      try {
        if (allowCache) {
          const cached = readCacheEntry(MEALPLAN_CACHE_KEY)
          if (cached?.value?.dietPlanId === effectiveDietPlanId) {
            setMealPlan(cached.value)
            setPlanLoading(false)
            setError(null)
          }
        }

        setPlanLoading((previous) => previous || !allowCache)
        const params = new URLSearchParams()
        params.set('dietPlanId', String(effectiveDietPlanId))
        const response = await fetch(`/api/meal-planner${params.size ? `?${params.toString()}` : ''}`, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error('Failed to load your most recent meal plan')
        }

        const data = await response.json()

        if (data?.mealPlan?.length) {
          setMealPlan(data)
          setError(null)
          writeCacheEntry(MEALPLAN_CACHE_KEY, { ...data, dietPlanId: effectiveDietPlanId })

          const todayIso = getManilaTodayIso()
          if (data?.planId) {
            loadDailyLog({ planId: data.planId, date: todayIso })
          } else {
            setDailyLog(null)
          }

          if (data.targets) {
            setCalorieTarget(data.targets.calories ?? 2000)
          }
        } else {
          setMealPlan(null)
          clearCacheEntry(MEALPLAN_CACHE_KEY)
        }
      } catch (planError) {
        console.error('Error loading FitSavory meal plan:', planError)
        setMealPlan(null)
        setError((prev) => prev ?? 'Unable to load your FitSavory meal plan.')
        clearCacheEntry(MEALPLAN_CACHE_KEY)
      } finally {
        setPlanLoading(false)
      }
    },
    [activeDietPlanId, loadDailyLog]
  )

  useEffect(() => {
    const handleDashboardRefresh = () => {
      loadDashboardOverview({ allowCache: false })
      fetchLatestMealPlan(null, { allowCache: false })
    }

    window.addEventListener('refreshFitSavoryDashboard', handleDashboardRefresh)
    return () => window.removeEventListener('refreshFitSavoryDashboard', handleDashboardRefresh)
  }, [loadDashboardOverview, fetchLatestMealPlan])

  useEffect(() => {
    if (status !== 'authenticated') {
      if (status === 'unauthenticated') {
        setPlanLoading(false)
      }
      return
    }

    if (subscriptionLoading) return

    if (subscriptionStatus === false) {
      setMealPlan(null)
      setPlanLoading(false)
      setDashboard(null)
      return
    }

    fetchLatestMealPlan(null, { allowCache: true })
    loadDashboardOverview({ allowCache: true })
  }, [status, subscriptionLoading, subscriptionStatus, fetchLatestMealPlan, loadDashboardOverview])

  useEffect(() => {
    if (!mealPlan?.planId) {
      setDailyLog(null)
      return
    }

    setDailyLog(null)
    loadDailyLog({ planId: mealPlan.planId, date: getTodayIsoDate() })
  }, [mealPlan?.planId, loadDailyLog, currentDateIso])

  useEffect(() => {
    const delay = getMsUntilNextManilaMidnight() || 24 * 60 * 60 * 1000

    const timer = setTimeout(() => {
      setCurrentDateIso(getTodayIsoDate())
    }, delay)

    return () => clearTimeout(timer)
  }, [currentDateIso])

  useEffect(() => {
    if (status !== 'authenticated' || subscriptionStatus === false) return
    loadDashboardOverview({ allowCache: false })
    fetchLatestMealPlan(null, { allowCache: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDateIso])

  useEffect(() => {
    if (!mealPlan?.mealPlan?.length) {
      setSelectedDayIndex(0)
      return
    }

    setSelectedDayIndex((previous) => clampNumber(previous, 0, mealPlan.mealPlan.length - 1))
  }, [mealPlan])

  const dietPlanProgress = useMemo(() => {
    const activeDietPlan = mealPlan?.dietPlan ?? dashboard?.activeDietPlan ?? null
    if (!activeDietPlan) {
      return null
    }

    const start = toDateOrNull(activeDietPlan.startDate)
    const end = toDateOrNull(activeDietPlan.endDate)
    const totalDays = parseNumber(activeDietPlan.totalDays) ?? (start && end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1) : null)

    if (!start || !totalDays) {
      return null
    }

    const today = toDateOrNull(currentDateIso) ?? new Date()
    const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    const endUtc = end ? Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) : null

    const elapsedRaw = Math.floor((todayUtc - startUtc) / (24 * 60 * 60 * 1000)) + 1
    const daysElapsed = todayUtc < startUtc ? 0 : Math.min(totalDays, Math.max(0, elapsedRaw))
    const daysRemaining = Math.max(0, totalDays - daysElapsed)
    const percentage = totalDays ? Math.min(100, Math.round((daysElapsed / totalDays) * 100)) : 0

    let status = 'In progress'
    if (todayUtc < startUtc) {
      status = 'Starts soon'
    } else if (endUtc && todayUtc > endUtc) {
      status = 'Completed'
    } else if (daysElapsed >= totalDays) {
      status = 'Completed'
    }

    return {
      totalDays,
      daysElapsed,
      daysRemaining,
      percentage,
      status
    }
  }, [mealPlan?.dietPlan, dashboard?.activeDietPlan, currentDateIso])

  const resolvedPlannerTargets = useMemo(() => {
    const source = mealPlan?.targets ?? mealPlan?.dietPlan?.targets ?? dashboard?.nutritionProfile?.targets ?? null
    if (!source) return null
    return {
      calories: safeRound(source.calories),
      protein: safeRound(source.protein),
      carbs: safeRound(source.carbs),
      fat: safeRound(source.fat)
    }
  }, [mealPlan?.targets, mealPlan?.dietPlan?.targets, dashboard?.nutritionProfile?.targets])

  useEffect(() => {
    if (!resolvedPlannerTargets) return
    const previous = prevPlannerTargetsRef.current
    const hasChanged =
      !previous ||
      previous.calories !== resolvedPlannerTargets.calories ||
      previous.protein !== resolvedPlannerTargets.protein ||
      previous.carbs !== resolvedPlannerTargets.carbs ||
      previous.fat !== resolvedPlannerTargets.fat

    if (!hasChanged) {
      return
    }

    prevPlannerTargetsRef.current = resolvedPlannerTargets

    setCalorieTarget(resolvedPlannerTargets.calories)
    setPlannerInputs((previousInputs) => ({
      ...previousInputs,
      calories: String(resolvedPlannerTargets.calories ?? ''),
      protein: String(resolvedPlannerTargets.protein ?? ''),
      carbs: String(resolvedPlannerTargets.carbs ?? ''),
      fat: String(resolvedPlannerTargets.fat ?? '')
    }))
  }, [resolvedPlannerTargets])

  useEffect(() => {
    if (!mealPlan?.mealPlan?.length) return
    setDays(mealPlan.mealPlan.length)
    setPlannerInputs((previousInputs) => ({
      ...previousInputs,
      days: String(mealPlan.mealPlan.length)
    }))
  }, [mealPlan?.mealPlan?.length])

  const nutritionTargets = useMemo(() => {
    if (mealPlan?.targets) {
      return mealPlan.targets
    }
    const dietPlanTargets = mealPlan?.dietPlan?.targets
    if (dietPlanTargets) {
      return dietPlanTargets
    }
    if (dashboard?.nutritionProfile?.targets) {
      return dashboard.nutritionProfile.targets
    }
    return null
  }, [mealPlan, dashboard])

  const goalStats = useMemo(() => {
    if (!mealPlan?.mealPlan?.length || !nutritionTargets) {
      return null
    }

    const totals = mealPlan.mealPlan.reduce(
      (acc, day) => {
        acc.calories += day.totals?.calories ?? 0
        acc.protein += day.totals?.protein ?? 0
        acc.carbs += day.totals?.carbs ?? 0
        acc.fat += day.totals?.fat ?? 0
        return acc
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )

    const daysCount = mealPlan.mealPlan.length
    const average = {
      calories: daysCount ? totals.calories / daysCount : 0,
      protein: daysCount ? totals.protein / daysCount : 0,
      carbs: daysCount ? totals.carbs / daysCount : 0,
      fat: daysCount ? totals.fat / daysCount : 0
    }

    const safePercentage = (current, target) => {
      if (!target || target <= 0) return 0
      return Math.min(100, Math.round((current / target) * 100))
    }

    return {
      calories: {
        current: Math.round(average.calories),
        target: nutritionTargets.calories ?? 0,
        percentage: safePercentage(average.calories, nutritionTargets.calories ?? 0)
      },
      protein: {
        current: Math.round(average.protein),
        target: nutritionTargets.protein ?? 0,
        percentage: safePercentage(average.protein, nutritionTargets.protein ?? 0)
      },
      carbs: {
        current: Math.round(average.carbs),
        target: nutritionTargets.carbs ?? 0,
        percentage: safePercentage(average.carbs, nutritionTargets.carbs ?? 0)
      },
      fat: {
        current: Math.round(average.fat),
        target: nutritionTargets.fat ?? 0,
        percentage: safePercentage(average.fat, nutritionTargets.fat ?? 0)
      }
    }
  }, [mealPlan, nutritionTargets])

  const actualTotals = useMemo(() => {
    if (!dailyLog) return null

    const pickValue = (...keys) => {
      for (const key of keys) {
        const value = dailyLog?.[key]
        if (value == null) continue
        const numeric = Number(value)
        if (Number.isFinite(numeric)) {
          return numeric
        }
      }
      return null
    }

    const totals = {
      calories: pickValue('caloriesConsumed', 'calories_consumed'),
      protein: pickValue('protein', 'protein_g'),
      carbs: pickValue('carbs', 'carbs_g'),
      fat: pickValue('fat', 'fat_g')
    }

    const hasValues = Object.values(totals).some((value) => value != null)
    if (!hasValues) return null

    return {
      calories: totals.calories ?? 0,
      protein: totals.protein ?? 0,
      carbs: totals.carbs ?? 0,
      fat: totals.fat ?? 0
    }
  }, [dailyLog])

  const fallbackDayTotals = useMemo(() => {
    const dashboardSummaries = Array.isArray(dashboard?.planSummary?.daySummaries)
      ? dashboard.planSummary.daySummaries
      : null
    const dashboardTotals = dashboardSummaries?.[selectedDayIndex]?.totals

    if (dashboardTotals) {
      return {
        calories: Number(dashboardTotals.calories ?? 0),
        protein: Number(dashboardTotals.protein ?? 0),
        carbs: Number(dashboardTotals.carbs ?? 0),
        fat: Number(dashboardTotals.fat ?? 0)
      }
    }

    const mealPlanDays = Array.isArray(mealPlan?.mealPlan) ? mealPlan.mealPlan : null
    const mealPlanTotals = mealPlanDays?.[selectedDayIndex]?.totals

    if (mealPlanTotals) {
      return {
        calories: Number(mealPlanTotals.calories ?? 0),
        protein: Number(mealPlanTotals.protein ?? 0),
        carbs: Number(mealPlanTotals.carbs ?? 0),
        fat: Number(mealPlanTotals.fat ?? 0)
      }
    }

    return null
  }, [dashboard?.planSummary?.daySummaries, mealPlan?.mealPlan, selectedDayIndex])

  const planSummary = useMemo(() => {
    if (dashboard?.planSummary) {
      const summary = dashboard.planSummary
      const daySummaries = Array.isArray(summary.daySummaries)
        ? summary.daySummaries.map((day) => ({
            dayNumber: day.dayNumber ?? day.day ?? day.dayIndex ?? 0,
            date: day.date ?? null,
            totals: {
              calories: safeRound(day.totals?.calories),
              protein: safeRound(day.totals?.protein),
              carbs: safeRound(day.totals?.carbs),
              fat: safeRound(day.totals?.fat)
            },
            waterGoalMl: Number(day.waterGoalMl ?? day.water_goal_ml ?? summary.targets?.waterMl ?? summary.targets?.water_ml ?? 0)
          }))
        : []

      const consumptionDaySummaries = Array.isArray(summary.consumptionDaySummaries)
        ? summary.consumptionDaySummaries.map((day, index) => ({
            dayNumber: day.dayNumber ?? day.day ?? day.dayIndex ?? daySummaries[index]?.dayNumber ?? index + 1,
            date: day.date ?? daySummaries[index]?.date ?? null,
            totals: {
              calories: safeRound(day.totals?.calories),
              protein: safeRound(day.totals?.protein),
              carbs: safeRound(day.totals?.carbs),
              fat: safeRound(day.totals?.fat)
            }
          }))
        : []

      return {
        id: summary.planId ?? null,
        name: summary.name ?? 'Current Meal Plan',
        startDate: summary.startDate ?? null,
        endDate: summary.endDate ?? null,
        totalDays: summary.totalDays ?? daySummaries.length,
        targets: summary.targets ?? null,
        averages: summary.averagePlanTotals
          ? {
              calories: safeRound(summary.averagePlanTotals.calories),
              protein: safeRound(summary.averagePlanTotals.protein),
              carbs: safeRound(summary.averagePlanTotals.carbs),
              fat: safeRound(summary.averagePlanTotals.fat)
            }
          : null,
        daySummaries,
        consumptionDaySummaries
      }
    }

    if (mealPlan?.mealPlan?.length) {
      const daySummaries = mealPlan.mealPlan.map((day) => ({
        dayNumber: day.day,
        date: day.date ?? null,
        totals: {
          calories: safeRound(day.totals?.calories),
          protein: safeRound(day.totals?.protein),
          carbs: safeRound(day.totals?.carbs),
          fat: safeRound(day.totals?.fat)
        },
        meals: {
          breakfast: day.breakfast ?? null,
          lunch: day.lunch ?? null,
          dinner: day.dinner ?? null,
          snacks: Array.isArray(day.snacks) ? day.snacks : []
        },
        waterGoalMl: Number(day.waterGoalMl ?? day.water_goal_ml ?? day.waterGoal ?? 0)
      }))

      return {
        id: mealPlan.planId ?? null,
        name: mealPlan.name ?? 'Generated Meal Plan',
        startDate: mealPlan.startDate ?? null,
        endDate: mealPlan.endDate ?? null,
        totalDays: mealPlan.mealPlan.length,
        targets: mealPlan.targets ?? nutritionTargets,
        averages: goalStats
          ? {
              calories: safeRound(goalStats.calories.current),
              protein: safeRound(goalStats.protein.current),
              carbs: safeRound(goalStats.carbs.current),
              fat: safeRound(goalStats.fat.current)
            }
          : null,
        daySummaries,
        consumptionDaySummaries: []
      }
    }

    return null
  }, [dashboard, mealPlan, nutritionTargets, goalStats])

  const effectiveDaySummaries = useMemo(() => {
    if (planSummary?.daySummaries?.length) return planSummary.daySummaries
    if (planSummary?.consumptionDaySummaries?.length) {
      return planSummary.consumptionDaySummaries.map((day, index) => ({
        dayNumber: day.dayNumber ?? index + 1,
        date: day.date ?? null,
        totals: {
          calories: safeRound(day.totals?.calories),
          protein: safeRound(day.totals?.protein),
          carbs: safeRound(day.totals?.carbs),
          fat: safeRound(day.totals?.fat)
        },
        waterGoalMl: Number(day.waterGoalMl ?? 0)
      }))
    }
    return []
  }, [planSummary?.daySummaries, planSummary?.consumptionDaySummaries])

  const hasPlanData = effectiveDaySummaries.length > 0

  useEffect(() => {
    const days = effectiveDaySummaries
    if (!days.length) {
      setSelectedDayIndex(0)
      return
    }

    setSelectedDayIndex((previous) => clampNumber(previous, 0, days.length - 1))
  }, [effectiveDaySummaries])

  const hydrationByDate = useMemo(() => {
    const entries = dashboard?.nutritionProfile?.hydration?.dailyLogs
    if (!Array.isArray(entries)) return {}

    return entries.reduce((acc, entry) => {
      const iso = formatToManilaDate(entry?.date ?? entry?.logDate ?? entry?.log_date)
      if (!iso) return acc
      const intake = safeRound(entry?.waterMl ?? entry?.water_ml)
      const goal = safeRound(entry?.goalMl ?? entry?.goal_ml)
      acc[iso] = {
        total: intake,
        goal: goal > 0 ? goal : null
      }
      return acc
    }, {})
  }, [dashboard?.nutritionProfile?.hydration?.dailyLogs])

  const consumptionTotalsByDate = useMemo(() => {
    const entries = dashboard?.planSummary?.consumptionDaySummaries
    if (!Array.isArray(entries)) return {}

    return entries.reduce((acc, entry) => {
      const iso = formatToManilaDate(entry?.date ?? entry?.isoDate ?? entry?.iso)
      if (!iso) return acc

      const resolve = (value) => {
        const numeric = Number(value)
        return Number.isFinite(numeric) ? numeric : null
      }

      const totals = entry?.totals ?? {}
      acc[iso] = {
        calories: resolve(totals.calories),
        protein: resolve(totals.protein),
        carbs: resolve(totals.carbs),
        fat: resolve(totals.fat)
      }
      return acc
    }, {})
  }, [dashboard?.planSummary?.consumptionDaySummaries])

  const weeklyProgress = useMemo(() => {
    const days = effectiveDaySummaries
    if (!days?.length) return []

    const todayIso = getManilaTodayIso()

    const enriched = days
      .filter((day) => {
        const iso = formatToManilaDate(day.date)
        if (!iso) return true
        return iso <= todayIso
      })
      .map((day, index) => {
        const iso = formatToManilaDate(day.date)
        const hydration = iso ? hydrationByDate[iso] : null
        const consumptionTotals = iso ? consumptionTotalsByDate[iso] : null

        const hasLoggedTotals = consumptionTotals
          ? Object.values(consumptionTotals).some((value) => Number.isFinite(value) && value !== null)
          : false

        const safeHydrationTotal = Number.isFinite(hydration?.total) ? safeRound(hydration.total) : null
        const safeHydrationGoal = Number.isFinite(hydration?.goal) ? safeRound(hydration.goal) : null

        return {
          key: day.dayNumber ?? iso ?? index,
          isoDate: day.date ?? null,
          label: formatSnapshotDate(day.date) ?? `Day ${day.dayNumber}`,
          calories: hasLoggedTotals ? safeRound(consumptionTotals?.calories) : null,
          protein: hasLoggedTotals ? safeRound(consumptionTotals?.protein) : null,
          carbs: hasLoggedTotals ? safeRound(consumptionTotals?.carbs) : null,
          fat: hasLoggedTotals ? safeRound(consumptionTotals?.fat) : null,
          waterMl: safeHydrationTotal,
          waterGoalMl: safeHydrationGoal ?? safeRound(day.waterGoalMl ?? 0),
          hasLoggedTotals
        }
      })

    return enriched.sort((a, b) => {
      const isoA = formatToManilaDate(a.isoDate) ?? (typeof a.isoDate === 'string' ? a.isoDate : '')
      const isoB = formatToManilaDate(b.isoDate) ?? (typeof b.isoDate === 'string' ? b.isoDate : '')

      if (isoA && isoB && isoA !== isoB) {
        return isoA < isoB ? 1 : -1
      }

      const dayA = Number.isFinite(a.key) ? a.key : 0
      const dayB = Number.isFinite(b.key) ? b.key : 0
      return dayB - dayA
    })
  }, [consumptionTotalsByDate, planSummary, hydrationByDate])

  const dayTabs = useMemo(() => {
    const days = effectiveDaySummaries
    if (!days?.length) return []
    return days.map((day, index) => ({
      index,
      label: formatSnapshotDate(day.date) ?? `Day ${day.dayNumber}`,
      totals: day.totals ?? {},
      isoDate: day.date ?? null,
      dateLabel: formatSnapshotDate(day.date) ?? formatDate(day.date) ?? `Day ${day.dayNumber}`
    }))
  }, [planSummary])

  const selectedDay = useMemo(() => {
    const days = effectiveDaySummaries
    if (!days?.length) return null
    return days[selectedDayIndex] ?? null
  }, [effectiveDaySummaries, selectedDayIndex])

  const selectedDayIsoDate = useMemo(() => {
    if (!selectedDay) return null
    const iso = formatToManilaDate(selectedDay.date)
    if (iso) return iso
    if (typeof selectedDay.date === 'string' && selectedDay.date.trim().length) {
      return selectedDay.date.trim()
    }
    return null
  }, [selectedDay])

  useEffect(() => {
    if (!selectedDayIsoDate) {
      setSelectedDayLogEntry(null)
      setIsSelectedDayLogLoading(false)
      return
    }

    const planIdCandidates = [planSummary?.id, mealPlan?.planId, dashboard?.planSummary?.planId, activeDietPlanId]
    let resolvedPlanId = null
    for (const candidate of planIdCandidates) {
      if (candidate === null || candidate === undefined) continue
      const numeric = Number(candidate)
      if (Number.isFinite(numeric)) {
        resolvedPlanId = numeric
        break
      }
      const trimmed = candidate?.toString().trim()
      if (trimmed) {
        resolvedPlanId = trimmed
        break
      }
    }

    if (!resolvedPlanId) {
      setSelectedDayLogEntry(null)
      setIsSelectedDayLogLoading(false)
      return
    }

    let isMounted = true
    setIsSelectedDayLogLoading(true)

    fetchDietPlanLog({ planId: resolvedPlanId, date: selectedDayIsoDate })
      .then((logEntry) => {
        if (!isMounted) return
        setSelectedDayLogEntry(logEntry)
      })
      .catch((error) => {
        console.warn('Failed to load selected day diet plan log:', error)
        if (!isMounted) return
        setSelectedDayLogEntry(null)
      })
      .finally(() => {
        if (isMounted) {
          setIsSelectedDayLogLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [selectedDayIsoDate, planSummary?.id, mealPlan?.planId, dashboard?.planSummary?.planId, activeDietPlanId, fetchDietPlanLog])

  const selectedDayTotals = useMemo(() => {
    const resolveTotalsFromLog = (log) => {
      if (!log) return null

      const pick = (...keys) => {
        for (const key of keys) {
          const value = log?.[key]
          if (value === null || value === undefined) continue
          const numeric = Number(value)
          if (Number.isFinite(numeric)) {
            return numeric
          }
        }
        return null
      }

      const totals = {
        calories: pick('caloriesConsumed', 'calories_consumed'),
        protein: pick('protein', 'protein_g'),
        carbs: pick('carbs', 'carbs_g'),
        fat: pick('fat', 'fat_g')
      }

      const hasValues = Object.values(totals).some((value) => value !== null)
      if (!hasValues) return null

      return {
        calories: totals.calories ?? 0,
        protein: totals.protein ?? 0,
        carbs: totals.carbs ?? 0,
        fat: totals.fat ?? 0
      }
    }

    const logTotals = resolveTotalsFromLog(selectedDayLogEntry)
    if (logTotals) {
      return logTotals
    }

    return {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0
    }
  }, [selectedDayLogEntry])

  const targetTotals = useMemo(() => {
    const normalize = (totals) => {
      if (!totals) return null
      return {
        calories: safeRound(totals.calories),
        protein: safeRound(totals.protein),
        carbs: safeRound(totals.carbs),
        fat: safeRound(totals.fat)
      }
    }

    return (
      normalize(resolvedPlannerTargets) ??
      normalize(nutritionTargets) ??
      normalize(fallbackDayTotals) ??
      normalize(selectedDay?.totals)
    )
  }, [selectedDay?.totals, fallbackDayTotals, resolvedPlannerTargets, nutritionTargets])

  const loggedTotals = useMemo(() => {
    if (selectedDayLogEntry) {
      return {
        calories: safeRound(selectedDayTotals.calories),
        protein: safeRound(selectedDayTotals.protein),
        carbs: safeRound(selectedDayTotals.carbs),
        fat: safeRound(selectedDayTotals.fat)
      }
    }

    if (selectedDayIsoDate && selectedDayIsoDate === currentDateIso && actualTotals) {
      return {
        calories: safeRound(actualTotals.calories),
        protein: safeRound(actualTotals.protein),
        carbs: safeRound(actualTotals.carbs),
        fat: safeRound(actualTotals.fat)
      }
    }

    return {
      calories: safeRound(selectedDayTotals.calories),
      protein: safeRound(selectedDayTotals.protein),
      carbs: safeRound(selectedDayTotals.carbs),
      fat: safeRound(selectedDayTotals.fat)
    }
  }, [actualTotals, currentDateIso, selectedDayIsoDate, selectedDayLogEntry, selectedDayTotals])

  const plannedWaterGoalMl = useMemo(() => {
    if (selectedDay?.waterGoalMl) {
      return parseWaterMl(selectedDay.waterGoalMl)
    }

    const planWaterGoal = resolveFirstNumber(
      planSummary?.targets?.waterMl,
      planSummary?.targets?.water_ml,
      mealPlan?.targets?.waterMl,
      mealPlan?.targets?.water_ml,
      dashboard?.activeDietPlan?.waterGoalMl,
      dashboard?.activeDietPlan?.water_goal_ml
    )

    return parseWaterMl(planWaterGoal)
  }, [
    selectedDay?.waterGoalMl,
    planSummary?.targets?.waterMl,
    planSummary?.targets?.water_ml,
    mealPlan?.targets?.waterMl,
    mealPlan?.targets?.water_ml,
    dashboard?.activeDietPlan?.waterGoalMl,
    dashboard?.activeDietPlan?.water_goal_ml
  ])

  const selectedDayLoggedWaterMl = useMemo(
    () => parseWaterMl(selectedDayLogEntry?.waterMl ?? selectedDayLogEntry?.water_ml),
    [selectedDayLogEntry]
  )

  const lastUpdatedLabel = useMemo(() => {
    const entries = [
      dashboard?.planSummary?.lastUpdatedAt ?? dashboard?.planSummary?.lastUpdated_at ?? null,
      dashboard?.planSummary?.lastRefreshedAt ?? dashboard?.planSummary?.lastRefreshed_at ?? null,
      dashboard?.lastUpdatedAt ?? dashboard?.lastUpdated_at ?? null,
      dailyLog?.updatedAt ?? dailyLog?.updated_at ?? null,
      selectedDayLogEntry?.updatedAt ?? selectedDayLogEntry?.updated_at ?? null
    ]

    for (const value of entries) {
      if (!value) continue
      const date = value instanceof Date ? value : new Date(value)
      if (Number.isNaN(date?.getTime?.() ?? Number.NaN)) continue
      const timestamp = date instanceof Date ? date : new Date(date)
      if (Number.isNaN(timestamp.getTime())) continue
      return formatManilaTimeLabel(timestamp)
    }

    return null
  }, [
    dashboard?.planSummary?.lastUpdatedAt,
    dashboard?.planSummary?.lastUpdated_at,
    dashboard?.planSummary?.lastRefreshedAt,
    dashboard?.planSummary?.lastRefreshed_at,
    dashboard?.lastUpdatedAt,
    dashboard?.lastUpdated_at,
    dailyLog?.updatedAt,
    dailyLog?.updated_at,
    selectedDayLogEntry?.updatedAt,
    selectedDayLogEntry?.updated_at
  ])

  const recentMeals = useMemo(() => {
    if (!dashboard?.recentMeals?.length) {
      return []
    }

    return dashboard.recentMeals.slice(0, 9).map((meal, index) => ({
      id: `${meal.id ?? 'recent'}-${index}`,
      name: meal.title ?? meal.name ?? 'Tracked meal',
      calories: safeRound(meal.nutrition?.calories ?? meal.calories),
      protein: safeRound(meal.nutrition?.protein ?? meal.protein),
      context:
        meal.dayNumber
          ? `Day ${meal.dayNumber} · ${meal.mealType?.toLowerCase() ?? 'meal'}`
          : `${meal.mealType?.toLowerCase?.() ?? 'Meal'} · Day ${meal.dayNumber ?? '?'}`
    }))
  }, [dashboard?.recentMeals])

  const nutritionLogSummary = dashboard?.nutritionProfile?.logs ?? null
  const nutritionDailyLogs = Array.isArray(dashboard?.nutritionProfile?.logs?.dailyLogs)
    ? dashboard.nutritionProfile.logs.dailyLogs
    : []
  const nutritionMacroEntries = useMemo(() => {
    if (!nutritionDailyLogs.length) return []

    return nutritionDailyLogs.flatMap((log, logIndex) => {
      const iso = formatToManilaDate(log.date ?? log.logDate ?? log.log_date)
      const dateLabel = iso ?? `Entry ${logIndex + 1}`

      const buildEntry = (key, label, value, unit) => ({
        key: `${log.id ?? iso ?? logIndex}-${key}`,
        label,
        value: Number.isFinite(value) ? `${roundOrNull(value)}${unit}` : '—',
        iso,
        dateLabel
      })

      const calories = parseNumber(log.caloriesConsumed ?? log.calories_consumed)
      const protein = parseNumber(log.protein ?? log.protein_g)
      const carbs = parseNumber(log.carbs ?? log.carbs_g)
      const fat = parseNumber(log.fat ?? log.fat_g)

      return [
        buildEntry('calories', 'Calories', calories, ' kcal'),
        buildEntry('protein', 'Protein', protein, ' g'),
        buildEntry('carbs', 'Carbs', carbs, ' g'),
        buildEntry('fat', 'Fat', fat, ' g')
      ]
    })
  }, [nutritionDailyLogs])
  const hydrationSummary = dashboard?.nutritionProfile?.hydration ?? null
  const sleepSummary = dashboard?.nutritionProfile?.sleep ?? null
  const energySummary = dashboard?.nutritionProfile?.energy ?? null

  const handleQuickAction = useCallback(
    (path) => {
      if (!path) return
      router.push(path)
    },
    [router]
  )

  const handleInputChange = useCallback((key, setter) => (event) => {
    const { value } = event.target
    setPlannerInputs((previous) => ({
      ...previous,
      [key]: value
    }))

    if (setter) {
      const numericValue = Number.parseInt(value, 10)
      if (!Number.isNaN(numericValue)) {
        setter(numericValue)
      }
    }
  }, [])

  const handleInputBlur = useCallback((key, setter, min, max) => () => {
    setPlannerInputs((previous) => {
      const rawValue = previous[key]
      const numericValue = Number.parseInt(rawValue, 10)
      const clampedValue = clampNumber(Number.isNaN(numericValue) ? min : numericValue, min, max)

      if (setter) {
        setter(clampedValue)
      }

      return {
        ...previous,
        [key]: String(clampedValue)
      }
    })
  }, [])

  const handleGeneratePlan = useCallback(async () => {
    const normalizedTargets = {
      calories: clampNumber(Number.parseInt(plannerInputs.calories, 10), 1200, 4000),
      protein: clampNumber(Number.parseInt(plannerInputs.protein, 10), 60, 250),
      carbs: clampNumber(Number.parseInt(plannerInputs.carbs, 10), 100, 400),
      fat: clampNumber(Number.parseInt(plannerInputs.fat, 10), 30, 150)
    }
    const normalizedDays = clampNumber(Number.parseInt(plannerInputs.days, 10), 3, 14)

    setCalorieTarget(normalizedTargets.calories)
    setDays(normalizedDays)
    setPlannerInputs({
      calories: String(normalizedTargets.calories),
      protein: String(normalizedTargets.protein),
      carbs: String(normalizedTargets.carbs),
      fat: String(normalizedTargets.fat),
      days: String(normalizedDays)
    })
    setIsGenerating(true)
    try {
      const response = await fetch('/api/meal-planner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          targets: normalizedTargets,
          days: normalizedDays,
          dietPlanId: activeDietPlanId ?? undefined
        })
      })
      if (!response.ok) throw new Error('Failed to generate meal plan')
      const data = await response.json()
      if (data?.targets) {
        const resolvedTargets = {
          calories: data.targets.calories ?? 2000,
          protein: data.targets.protein ?? 150,
          carbs: data.targets.carbs ?? 250,
          fat: data.targets.fat ?? 67
        }
        setCalorieTarget(resolvedTargets.calories)
        setPlannerInputs((previous) => ({
          ...previous,
          calories: String(resolvedTargets.calories),
          protein: String(resolvedTargets.protein),
          carbs: String(resolvedTargets.carbs),
          fat: String(resolvedTargets.fat)
        }))
      }
      setMealPlan(data?.mealPlan?.length ? data : null)
      setSelectedDayIndex(0)
      if (data?.planId) {
        loadDailyLog({ planId: data.planId, date: getTodayIsoDate() })
      } else {
        setDailyLog(null)
      }
      setError(null)
      await loadDashboardOverview()
    } catch (generateError) {
      console.error('Error generating meal plan:', generateError)
      setError(generateError.message || 'Unable to generate meal plan right now')
    } finally {
      setIsGenerating(false)
    }
  }, [plannerInputs, loadDailyLog, loadDashboardOverview, activeDietPlanId])

  const loadDietPlans = useCallback(async () => {
    try {
      const response = await fetch('/api/diet-plans', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('Failed to load diet plans')
      }
      const data = await response.json()
      const plans = Array.isArray(data?.plans) ? data.plans : []
      setDietPlans(plans)
      if (!plans.some((plan) => String(plan.id) === activeDietPlanId)) {
        const nextActive = plans.find((plan) => plan.status === 'active')
        setActiveDietPlanId(nextActive ? String(nextActive.id) : null)
      }
    } catch (planLoadError) {
      console.error('Failed to load diet plans:', planLoadError)
      setDietPlans([])
    }
  }, [activeDietPlanId])

  useEffect(() => {
    if (status === 'authenticated') {
      loadDietPlans()
    }
  }, [status, loadDietPlans])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetchLatestMealPlan()
  }, [status, activeDietPlanId, fetchLatestMealPlan])

  const isLoading = status === 'loading' || subscriptionLoading || planLoading || isGenerating
  const isUnauthenticated = !session
  const isSubscriptionLocked = subscriptionStatus === false
  const isSnapshotLoading = planLoading || dashboardLoading || isLogLoading || isSelectedDayLogLoading

  const renderLoadingState = () => (
    <div className="min-h-screen bg-soft-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-olive-600 mx-auto"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-300 font-fredoka">Loading your dashboard...</p>
      </div>
    </div>
  )

  const renderUnauthenticatedState = () => (
    <div className="min-h-screen bg-soft-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm border border-soft-100 dark:border-gray-800 max-w-md">
          <h1 className="text-2xl font-fredoka font-bold text-gray-900 dark:text-gray-100 mb-4">Access Denied</h1>
          <p className="text-gray-600 dark:text-gray-300 font-fredoka mb-6">You need to be logged in to access the FitSavory dashboard.</p>
          <button
            onClick={() => router.push(`/auth/login?callbackUrl=${encodeURIComponent('/fitsavory')}`)}
            className="bg-olive-600 text-white py-2 px-4 rounded-lg hover:bg-olive-700 transition-colors font-fredoka font-medium"
          >
            Login
          </button>
        </div>
      </div>
    </div>
  )

  const renderSubscriptionPrompt = () => (
    <div className="min-h-screen bg-soft-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm border border-soft-100 dark:border-gray-800 max-w-md">
          <div className="bg-yellow-100 dark:bg-yellow-900/30 p-4 rounded-lg mb-6">
            <h2 className="text-xl font-fredoka font-bold text-yellow-800 dark:text-yellow-200">Premium Feature</h2>
          </div>
          <h1 className="text-2xl font-fredoka font-bold text-gray-900 dark:text-gray-100 mb-4">Upgrade Required</h1>
          <p className="text-gray-600 dark:text-gray-300 font-fredoka mb-6">
            FitSavory is a premium feature. Please upgrade your account to access this content.
          </p>
          <div className="space-y-4">
            <button
              onClick={() => router.push('/pricing')}
              className="w-full bg-olive-600 text-white py-2 px-4 rounded-lg hover:bg-olive-700 transition-colors font-fredoka font-medium"
            >
              View Subscription Plans
            </button>
            <button
              onClick={() => router.back()}
              className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100 font-fredoka"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  if (isLoading) {
    return renderLoadingState()
  }

  if (isUnauthenticated) {
    return renderUnauthenticatedState()
  }

  if (isSubscriptionLocked) {
    return renderSubscriptionPrompt()
  }

  return (
    <div className="min-h-screen bg-soft-50 dark:bg-gray-950">
      {/* Header spacer */}
      <div className="h-8 md:h-12"></div>

      <div className="space-y-4 max-w-6xl mx-auto px-4 lg:px-0">
        {dashboardError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-fredoka text-rose-600 dark:border-rose-300/30 dark:bg-rose-900/20 dark:text-rose-200">
            {dashboardError}
          </div>
        ) : null}
        {logError ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-fredoka text-amber-700 dark:border-amber-300/30 dark:bg-amber-900/20 dark:text-amber-200">
            {logError}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-white dark:bg-gray-900 border border-soft-100 dark:border-gray-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-olive-100 p-2 text-olive-700 dark:bg-olive-900/40 dark:text-olive-200">
              <Info className="h-4 w-4" />
            </div>
            <div>
              <p className="font-fredoka font-semibold text-gray-900 dark:text-gray-100">Dashboard overview</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Planner controls create your meal plan. Your tracking data lives on the Meal Tracking page, where you can open recipe previews and log intake or hydration.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/fitsavory/meals')}
              className="inline-flex items-center gap-2 rounded-lg border border-soft-200 px-3 py-1.5 text-sm font-fredoka text-gray-700 hover:border-olive-400 hover:text-olive-600 dark:border-gray-700 dark:text-gray-200"
            >
              <PlayCircle className="h-4 w-4" />
              Go to meal tracking
            </button>
            <button
              type="button"
              onClick={() => setIsGuideOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-olive-600 px-3 py-1.5 text-sm font-fredoka font-medium text-white hover:bg-olive-700"
            >
              <HelpCircle className="h-4 w-4" />
              Quick tour
            </button>
          </div>
        </div>

        {/* Planner Controls */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-soft-100 dark:border-gray-800">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-fredoka font-semibold text-gray-900 dark:text-gray-100">Planner Controls</h3>
              <p className="text-xs font-fredoka text-gray-500 dark:text-gray-400">
                Adjust your calorie and macro targets below.
              </p>
            </div>

            <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="md:w-1/2">
                <label className="block text-sm font-fredoka text-gray-600 dark:text-gray-300 mb-1">Linked Diet Plan</label>
                <select
                  value={activeDietPlanId ?? ''}
                  onChange={(event) => setActiveDietPlanId(event.target.value || null)}
                  className="w-full rounded-lg border border-soft-300 px-3 py-2 font-fredoka focus:outline-none focus:ring-2 focus:ring-olive-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                >
                  <option value="">No diet plan selected</option>
                  {dietPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} · {plan.status ?? 'active'}
                    </option>
                  ))}
                </select>
              </div>
              {activeDietPlanId ? (
                <button
                  type="button"
                  onClick={() => router.push(`/fitsavory/plans?plan=${encodeURIComponent(activeDietPlanId)}`)}
                  className="inline-flex items-center gap-2 rounded-lg border border-soft-200 px-3 py-1.5 text-sm font-fredoka text-gray-700 hover:border-olive-400 hover:text-olive-600 dark:border-gray-700 dark:text-gray-200"
                >
                  <Info className="h-4 w-4" />
                  View plan details
                </button>
              ) : null}
            </div>

            {mealPlan?.dietPlan ? (
              <div className="mb-6 grid gap-4 rounded-lg border border-soft-200 bg-soft-50 p-4 text-sm dark:border-gray-800 dark:bg-gray-900/50">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Linked diet plan</p>
                    <p className="text-base font-fredoka font-semibold text-gray-900 dark:text-gray-100">{mealPlan.dietPlan.name}</p>
                    {mealPlan.dietPlan.goal ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Goal: {mealPlan.dietPlan.goal}</p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Duration</p>
                    <p className="font-fredoka text-sm text-gray-900 dark:text-gray-100">
                      {mealPlan.dietPlan.startDate ? formatDate(mealPlan.dietPlan.startDate) : '—'}
                      {mealPlan.dietPlan.endDate ? ` → ${formatDate(mealPlan.dietPlan.endDate)}` : ''}
                    </p>
                    {mealPlan.dietPlan.totalDays ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{mealPlan.dietPlan.totalDays} total days</p>
                    ) : null}
                  </div>
                </div>
                {mealPlan.dietPlan.targets ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { key: 'calories', label: 'Calories', unit: 'kcal' },
                      { key: 'protein', label: 'Protein', unit: 'g' },
                      { key: 'carbs', label: 'Carbs', unit: 'g' },
                      { key: 'fat', label: 'Fat', unit: 'g' }
                    ].map((macro) => (
                      <div
                        key={macro.key}
                        className="rounded-lg border border-soft-200 bg-white px-3 py-2 text-center font-fredoka text-sm dark:border-gray-800 dark:bg-gray-900"
                      >
                        <p className="text-xs uppercase text-gray-500 dark:text-gray-400">{macro.label}</p>
                        <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                          {Math.round(mealPlan.dietPlan.targets?.[macro.key] ?? 0)} {macro.unit}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {dietPlanProgress ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>Status: {dietPlanProgress.status}</span>
                      <span>
                        {dietPlanProgress.daysElapsed}/{dietPlanProgress.totalDays} days completed
                        {dietPlanProgress.daysRemaining > 0 ? ` · ${dietPlanProgress.daysRemaining} days left` : ''}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-soft-200 rounded-full overflow-hidden dark:bg-gray-800">
                      <div
                        className="h-full bg-olive-600 transition-all duration-300"
                        style={{ width: `${dietPlanProgress.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-fredoka text-gray-600 dark:text-gray-300 mb-1">Daily Calories</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={1200}
                    max={4000}
                    value={plannerInputs.calories}
                    onChange={handleInputChange('calories', setCalorieTarget)}
                    onBlur={handleInputBlur('calories', setCalorieTarget, 1200, 4000)}
                    className="w-full rounded-lg border border-soft-300 px-3 py-2 font-fredoka focus:outline-none focus:ring-2 focus:ring-olive-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  />
                  <button
                    onClick={() => handleInputBlur('calories', setCalorieTarget, 1200, 4000)()}
                    className="text-xs font-fredoka text-gray-500 hover:text-olive-600 dark:text-gray-400 dark:hover:text-olive-200"
                    type="button"
                  >
                    Apply
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-fredoka text-gray-600 dark:text-gray-300 mb-1">Protein (g)</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={60}
                    max={250}
                    value={plannerInputs.protein}
                    onChange={handleInputChange('protein', null)}
                    onBlur={handleInputBlur('protein', null, 60, 250)}
                    className="w-full rounded-lg border border-soft-300 px-3 py-2 font-fredoka focus:outline-none focus:ring-2 focus:ring-olive-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  />
                  <button
                    onClick={() => handleInputBlur('protein', null, 60, 250)()}
                    className="text-xs font-fredoka text-gray-500 hover:text-olive-600 dark:text-gray-400 dark:hover:text-olive-200"
                    type="button"
                  >
                    Apply
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-fredoka text-gray-600 dark:text-gray-300 mb-1">Carbs (g)</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={100}
                    max={400}
                    value={plannerInputs.carbs}
                    onChange={handleInputChange('carbs', null)}
                    onBlur={handleInputBlur('carbs', null, 100, 400)}
                    className="w-full rounded-lg border border-soft-300 px-3 py-2 font-fredoka focus:outline-none focus:ring-2 focus:ring-olive-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  />
                  <button
                    onClick={() => handleInputBlur('carbs', null, 100, 400)()}
                    className="text-xs font-fredoka text-gray-500 hover:text-olive-600 dark:text-gray-400 dark:hover:text-olive-200"
                    type="button"
                  >
                    Apply
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-fredoka text-gray-600 dark:text-gray-300 mb-1">Fat (g)</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={30}
                    max={150}
                    value={plannerInputs.fat}
                    onChange={handleInputChange('fat')}
                    onBlur={handleInputBlur('fat', null, 30, 150)}
                    className="w-full rounded-lg border border-soft-300 px-3 py-2 font-fredoka focus:outline-none focus:ring-2 focus:ring-olive-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  />
                  <button
                    onClick={() => handleInputBlur('fat', null, 30, 150)()}
                    className="text-xs font-fredoka text-gray-500 hover:text-olive-600 dark:text-gray-400 dark:hover:text-olive-200"
                    type="button"
                  >
                    Apply
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-fredoka text-gray-600 dark:text-gray-300 mb-1">Plan Length (days)</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={3}
                    max={14}
                    value={plannerInputs.days}
                    onChange={handleInputChange('days', setDays)}
                    onBlur={handleInputBlur('days', setDays, 3, 14)}
                    className="w-full rounded-lg border border-soft-300 px-3 py-2 font-fredoka focus:outline-none focus:ring-2 focus:ring-olive-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  />
                  <button
                    onClick={() => handleInputBlur('days', setDays, 3, 14)()}
                    className="text-xs font-fredoka text-gray-500 hover:text-olive-600 dark:text-gray-400 dark:hover:text-olive-200"
                    type="button"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={handleGeneratePlan}
                disabled={isGenerating}
                className="bg-olive-600 text-white py-2.5 px-5 rounded-lg hover:bg-olive-700 transition-colors flex items-center space-x-2 font-fredoka font-medium disabled:opacity-60"
              >
                <ChefHat className="h-4 w-4" />
                <span>{isGenerating ? 'Generating plan...' : 'Generate Plan'}</span>
              </button>
              {mealPlan?.mealPlan?.length ? (
                <div className="text-sm text-gray-500 dark:text-gray-300 font-fredoka">
                  Last generated plan: {mealPlan.mealPlan.length} days, avg {Math.round(goalStats?.calories?.target ?? targetTotals?.calories ?? calorieTarget)} kcal/day
                  {dailyLog?.caloriesConsumed ? ` · Today logged ${Math.round(dailyLog.caloriesConsumed)} kcal` : ''}
                </div>
              ) : null}
            </div>

            {error ? (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-fredoka text-rose-600 dark:border-rose-300/30 dark:bg-rose-900/20 dark:text-rose-200">
                {error}
              </div>
            ) : null}
          </div>

          <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-soft-100 dark:border-gray-800">
            <h3 className="text-lg font-fredoka font-semibold text-gray-900 dark:text-gray-100 mb-4">Daily Snapshot</h3>
            {isSnapshotLoading ? (
              <div className="space-y-3">
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="h-4 w-full" />
                <SkeletonBlock className="h-4 w-full" />
                <SkeletonBlock className="h-4 w-full" />
                <SkeletonBlock className="h-4 w-full" />
              </div>
            ) : dayTabs.length ? (
              <>
                <div className="flex flex-wrap gap-2 mb-4">
                  {dayTabs.map((tab) => (
                    <button
                      key={tab.index}
                      onClick={() => setSelectedDayIndex(tab.index)}
                      className={`px-3 py-1 rounded-full text-sm font-fredoka border transition-colors ${
                        selectedDayIndex === tab.index
                          ? 'bg-olive-600 text-white border-olive-600'
                          : 'border-soft-300 text-gray-600 hover:border-olive-400 hover:text-olive-600 dark:border-gray-700 dark:text-gray-300 dark:hover:border-olive-400 dark:hover:text-olive-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                {selectedDay ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-fredoka text-gray-500 dark:text-gray-300">Calories</span>
                      <span className="text-sm font-fredoka font-semibold text-gray-900 dark:text-gray-100">
                        {Math.round(selectedDayTotals?.calories ?? 0)} kcal
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-fredoka text-gray-500 dark:text-gray-300">Protein</span>
                      <span className="text-sm font-fredoka font-semibold text-gray-900 dark:text-gray-100">
                        {Math.round(selectedDayTotals?.protein ?? 0)} g
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-fredoka text-gray-500 dark:text-gray-300">Carbs</span>
                      <span className="text-sm font-fredoka font-semibold text-gray-900 dark:text-gray-100">
                        {Math.round(selectedDayTotals?.carbs ?? 0)} g
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-fredoka text-gray-500 dark:text-gray-300">Fat</span>
                      <span className="text-sm font-fredoka font-semibold text-gray-900 dark:text-gray-100">
                        {Math.round(selectedDayTotals?.fat ?? 0)} g
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-fredoka text-gray-500 dark:text-gray-300">Water goal</span>
                      <span className="text-sm font-fredoka font-semibold text-gray-900 dark:text-gray-100">
                        {(plannedWaterGoalMl ?? 0).toLocaleString()} ml
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-fredoka text-gray-500 dark:text-gray-300">Water logged</span>
                      <span className="text-sm font-fredoka font-semibold text-gray-900 dark:text-gray-100">
                        {selectedDayLoggedWaterMl.toLocaleString()} ml
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-fredoka">
                      {selectedDayLogEntry
                        ? 'Daily snapshot reflects your logged intake and water progress.'
                        : 'No intake logged yet; showing zero progress until you add entries.'}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-3">
                      <button
                        type="button"
                        onClick={() => router.push('/fitsavory/meals')}
                        className="inline-flex items-center gap-2 rounded-lg border border-soft-200 px-3 py-1.5 text-xs font-fredoka text-gray-700 hover:border-olive-400 hover:text-olive-600 dark:border-gray-700 dark:text-gray-200"
                      >
                        <ChefHat className="h-3.5 w-3.5" />
                        View meals for this day
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push('/fitsavory/meals')}
                        className="inline-flex items-center gap-2 rounded-lg bg-olive-600 px-3 py-1.5 text-xs font-fredoka font-medium text-white hover:bg-olive-700"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Log intake
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push('/fitsavory/hydration')}
                        className="inline-flex items-center gap-2 rounded-lg border border-soft-200 px-3 py-1.5 text-xs font-fredoka text-gray-700 hover:border-olive-400 hover:text-olive-600 dark:border-gray-700 dark:text-gray-200"
                      >
                        <Droplets className="h-3.5 w-3.5" />
                        Log hydration
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-300 font-fredoka">
                {hasActivePlan
                  ? 'Plan data is still loading. Check back soon or refresh.'
                  : 'Select or generate a plan to see your daily breakdowns.'}
              </p>
            )}
          </div>
        </div>

        {/* Intake Summary Cards */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 flex flex-col gap-6">
            {/* Calorie Overview */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-soft-100 dark:border-gray-800">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-5">
                  <div className="relative h-32 w-32">
                    <div className="absolute inset-0 rounded-full border-8 border-soft-200 dark:border-gray-800"></div>
                    {hasPlanData ? (
                      <div
                        className="absolute inset-0 rounded-full"
                        style={createRingStyle(
                          (() => {
                            const goal = targetTotals?.calories ?? nutritionTargets?.calories ?? 0
                            const food = actualTotals?.calories ?? selectedDayTotals?.calories ?? 0
                            if (!goal) return 0
                            return (food / goal) * 100
                          })(),
                          '#65a30d'
                        )}
                      ></div>
                    ) : null}
                    <div className="absolute inset-5 rounded-full bg-white dark:bg-gray-900 flex flex-col items-center justify-center text-center">
                      <span className="text-3xl font-fredoka font-semibold text-gray-900 dark:text-gray-100">
                        {(() => {
                          if (!hasPlanData) return '—'
                          const goal = targetTotals?.calories ?? nutritionTargets?.calories ?? 0
                          const food = actualTotals?.calories ?? selectedDayTotals?.calories ?? 0
                          const remaining = Math.max(goal - food, 0)
                          return remaining.toLocaleString()
                        })()}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Remaining</span>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-fredoka font-semibold text-gray-900 dark:text-gray-100">Calories</h3>
                    <p className="text-xs font-fredoka text-gray-500 dark:text-gray-400">Remaining = Goal - Food</p>
                    <div className="mt-4 grid grid-cols-2 gap-4 text-sm font-fredoka text-gray-600 dark:text-gray-300">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">Goal</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {hasPlanData ? (targetTotals?.calories ?? nutritionTargets?.calories ?? 0).toLocaleString() : '—'} kcal
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">Food</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {hasPlanData ? (actualTotals?.calories ?? selectedDayTotals?.calories ?? 0).toLocaleString() : '—'} kcal
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">Goal reached</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {hasPlanData
                            ? (() => {
                                const goal = targetTotals?.calories ?? nutritionTargets?.calories ?? 0
                                const food = actualTotals?.calories ?? selectedDayTotals?.calories ?? 0
                                if (!goal) return '0%'
                                return `${Math.min(100, Math.round((food / goal) * 100))}%`
                              })()
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">Consumed today</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {hasPlanData ? (actualTotals?.calories ?? selectedDayTotals?.calories ?? 0).toLocaleString() : '—'} kcal
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 rounded-xl border border-soft-200 dark:border-gray-800 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">Recent days</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {weeklyProgress.slice(0, 3).map((day) => {
                      const iso = day.isoDate ? formatDate(day.isoDate) : day.label
                      const caloriesDisplay = Number.isFinite(day.calories) ? `${day.calories} kcal` : '—'
                      const hasTarget = Number.isFinite(nutritionTargets?.calories)
                      return (
                        <div key={day.key ?? iso} className="rounded-lg border border-soft-200 dark:border-gray-800 p-3">
                          <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">{iso}</p>
                          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{caloriesDisplay}</p>
                          {hasTarget ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Target {nutritionTargets.calories} kcal
                            </p>
                          ) : null}
                          {!day.hasLoggedTotals ? (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              Log meals to see totals
                            </p>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Nutrition Profile */}
              <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-soft-100 dark:border-gray-800 flex flex-col">
                <h3 className="text-lg font-fredoka font-semibold text-gray-900 dark:text-gray-100 mb-4">Nutrition Profile</h3>
                {dashboardLoading ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((item) => (
                      <SkeletonBlock key={item} className="h-16" />
                    ))}
                  </div>
                ) : nutritionLogSummary?.count ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">Recent Summary</p>
                      <p className="text-sm font-fredoka text-gray-600 dark:text-gray-300">
                        {nutritionLogSummary.count} logged days · Avg {roundOrNull(nutritionLogSummary.averages?.caloriesConsumed)} kcal
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-fredoka text-gray-600 dark:text-gray-300">
                      {nutritionMacroEntries.slice(0, 8).map((entry) => (
                        <div key={entry.key} className="rounded-lg border border-soft-200 dark:border-gray-800 p-3 space-y-2">
                          <p className="text-gray-400 dark:text-gray-500 uppercase tracking-wide">{entry.dateLabel}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500 dark:text-gray-400">{entry.label}</span>
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{entry.value}</span>
                          </div>
                        </div>
                      ))}
                      <div className="sm:col-span-2 rounded-lg border border-soft-200 dark:border-gray-800 p-3">
                        <p className="text-gray-400 dark:text-gray-500 uppercase tracking-wide">Hydration</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {roundOrNull(hydrationSummary?.averageWaterMl)} ml
                        </p>
                        <p className="text-gray-500 dark:text-gray-400">
                          Goal {(plannedWaterGoalMl ?? 0).toLocaleString()} ml · Logged {selectedDayLoggedWaterMl.toLocaleString()} ml today
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-300 font-fredoka">
                    Log your daily intake to unlock calorie, macro, and hydration insights.
                  </p>
                )}
              </div>

              {/* Progress Notifications */}
              <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-soft-100 dark:border-gray-800 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-fredoka font-semibold text-gray-900 dark:text-gray-100">Progress Notifications</h3>
                  <span className="text-xs font-fredoka text-olive-700 dark:text-olive-300">Live updates</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 font-fredoka">
                  Stay informed about today’s plan targets and logged activity.
                </p>
                <div className="space-y-3 text-xs font-fredoka text-gray-600 dark:text-gray-300">
                  <div className="rounded-lg border border-soft-200 dark:border-gray-800 p-3 flex items-start gap-3">
                    <div className="rounded-md bg-olive-100 p-2 text-olive-700 dark:bg-olive-900/40 dark:text-olive-200">
                      <Target className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">Calorie goal</p>
                      <p>
                        {hasPlanData
                          ? `${Math.round(actualTotals?.calories ?? 0)} kcal logged · ${Math.round(targetTotals?.calories ?? nutritionTargets?.calories ?? 0)} kcal target`
                          : 'Generate a plan to start tracking calorie targets.'}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-soft-200 dark:border-gray-800 p-3 flex items-start gap-3">
                    <div className="rounded-md bg-soft-200 p-2 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                      <Droplets className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">Hydration status</p>
                      <p>
                        {selectedDayLoggedWaterMl
                          ? `${selectedDayLoggedWaterMl.toLocaleString()} ml logged today`
                          : 'No hydration logged yet today.'}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-soft-200 dark:border-gray-800 p-3 flex items-start gap-3">
                    <div className="rounded-md bg-soft-200 p-2 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">Last update</p>
                      <p>{lastUpdatedLabel ?? 'Progress refresh pending.'}</p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleQuickAction('/fitsavory/meals')}
                  className="inline-flex items-center gap-2 rounded-lg bg-olive-600 px-4 py-2 text-sm font-fredoka font-medium text-white hover:bg-olive-700"
                >
                  <ChefHat className="h-4 w-4" />
                  Review today’s logs
                </button>
              </div>
            </div>
          </div>

          <div className="flex.flex-col gap-6">
            {/* Macro Overview */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-soft-100 dark:border-gray-800 flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-fredoka font-semibold text-gray-900 dark:text-gray-100">Macros</h3>
                <p className="text-xs font-fredoka text-gray-500 dark:text-gray-400">Daily progress toward targets</p>
              </div>
              <div className="space-y-4">
                {hasPlanData ? (
                  (
                    [
                      {
                        key: 'carbs',
                        label: 'Carbohydrates',
                        color: '#0d9488',
                        current: loggedTotals.carbs ?? 0,
                        target: targetTotals?.carbs ?? nutritionTargets?.carbs ?? 0
                      },
                      {
                        key: 'fat',
                        label: 'Fat',
                        color: '#8b5cf6',
                        current: loggedTotals.fat ?? 0,
                        target: targetTotals?.fat ?? nutritionTargets?.fat ?? 0
                      },
                      {
                        key: 'protein',
                        label: 'Protein',
                        color: '#f59e0b',
                        current: loggedTotals.protein ?? 0,
                        target: targetTotals?.protein ?? nutritionTargets?.protein ?? 0
                      }
                    ]
                  ).map((macro) => {
                    const remaining = Math.max((macro.target ?? 0) - (macro.current ?? 0), 0)
                    const percent = macro.target ? Math.min(100, Math.round((macro.current / macro.target) * 100)) : 0
                    return (
                      <div key={macro.key} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-fredoka font-medium text-gray-900 dark:text-gray-100">{macro.label}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{macro.current ?? 0} / {macro.target ?? 0} g</p>
                          </div>
                          <p className="text-xs font-fredoka text-gray-400 dark:text-gray-500">{remaining} g left</p>
                        </div>
                        <div className="h-3 w-full rounded-full bg-soft-200 dark:bg-gray-800 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${percent}%`,
                              background: `linear-gradient(90deg, ${macro.color}, ${macro.color})`
                            }}
                          ></div>
                        </div>
                        <p className="text-xs font-fredoka text-gray-500 dark:text-gray-400 text-right">{percent}% of goal</p>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-300 font-fredoka">
                    {hasActivePlan
                      ? 'Plan data is loading. Once it arrives, we will show your macro progress here.'
                      : 'Set up a plan to start tracking your daily macro progress.'}
                  </p>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-soft-100 dark:border-gray-800 flex flex-col">
              <h3 className="text-lg font-fredoka font-semibold text-gray-900 dark:text-gray-100 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={() => handleQuickAction('/fitsavory/plans')}
                  className="w-full bg-olive-600 text-white py-2.5 px-4 rounded-lg hover:bg-olive-700 transition-colors flex items-center gap-2 font-fredoka text-sm font-medium"
                >
                  <Calendar className="h-4 w-4" />
                  <span>Plan Tomorrow’s Meals</span>
                </button>
                <button
                  onClick={() => handleQuickAction('/fitsavory/meals')}
                  className="w-full bg-matte-600 text-white py-2.5 px-4 rounded-lg hover:bg-matte-700 transition-colors flex items-center gap-2 font-fredoka text-sm font-medium"
                >
                  <ChefHat className="h-4 w-4" />
                  <span>Review Meal Tracking</span>
                </button>
                <button
                  onClick={() => handleQuickAction('/fitsavory/hydration')}
                  className="w-full bg-soft-600 text-white py-2.5 px-4 rounded-lg hover:bg-soft-700 transition-colors flex items-center gap-2 font-fredoka text-sm font-medium"
                >
                  <Apple className="h-4 w-4" />
                  <span>Log Water Intake</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {isGuideOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div
              className="absolute inset-0 bg-gray-900/60"
              onClick={() => setIsGuideOpen(false)}
              aria-hidden="true"
            ></div>
            <div className="relative z-10 max-w-lg w-full rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900 border border-soft-200 dark:border-gray-700">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-fredoka font-semibold text-gray-900 dark:text-gray-100">How FitSavory works</h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    Follow these quick steps to generate a plan, review meals, and keep your logs up to date.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsGuideOpen(false)}
                  className="rounded-full border border-soft-200 p-1 text-gray-500 hover:text-olive-600 dark:border-gray-700 dark:text-gray-300"
                  aria-label="Close guide"
                >
                  ×
                </button>
              </div>
              <div className="mt-4 space-y-4 text-sm font-fredoka text-gray-700 dark:text-gray-300">
                <div className="rounded-lg border border-soft-200 bg-soft-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">1. Generate your plan</p>
                  <p>Use the planner controls to set targets, then click <strong>Generate Plan</strong>. The dashboard updates averages immediately.</p>
                </div>
                <div className="rounded-lg border border-soft-200 bg-soft-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">2. Review meals & recipes</p>
                  <p>Visit the <button className="underline" onClick={() => { setIsGuideOpen(false); router.push('/fitsavory/meals') }}>Meal Tracking page</button> to see each day, open recipe previews, and keep nutrition in sync.</p>
                </div>
                <div className="rounded-lg border border-soft-200 bg-soft-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">3. Log daily intake & hydration</p>
                  <p>Use the intake modal on Meal Tracking and the hydration logger to capture real-world progress. Dashboard summaries pull from these logs.</p>
                </div>
                <div className="rounded-lg border border-soft-200 bg-soft-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">4. Monitor insights</p>
                  <p>Return here anytime for macro averages, recent meals, and wellness stats. Buttons on each card jump straight to the relevant action.</p>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setIsGuideOpen(false); router.push('/fitsavory/meals') }}
                  className="inline-flex items-center gap-2 rounded-lg bg-olive-600 px-4 py-2 text-sm font-fredoka font-medium text-white hover:bg-olive-700"
                >
                  <ChefHat className="h-4 w-4" />
                  Go to meal tracking
                </button>
                <button
                  type="button"
                  onClick={() => setIsGuideOpen(false)}
                  className="rounded-lg border border-soft-200 px-4 py-2 text-sm font-fredoka text-gray-700 hover:border-olive-400 hover:text-olive-600 dark:border-gray-700 dark:text-gray-200"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
