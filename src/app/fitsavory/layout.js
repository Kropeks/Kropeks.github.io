'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowRight, LayoutDashboard, Utensils, FileText, Upload, BookOpen, Calendar, Droplets, Loader2, TrendingUp } from 'lucide-react'
import FloatingThemeToggle from '@/components/FloatingThemeToggle'
import {
  formatToManilaDate,
  formatManilaTimeLabel,
  getManilaTodayIso,
  PHILIPPINES_TIME_ZONE
} from '@/lib/manilaTime'

const NAV_LINKS = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, href: '/fitsavory' },
  { id: 'meals', name: 'Meal Tracking', icon: Utensils, href: '/fitsavory/meals' },
  { id: 'plans', name: 'Diet Plans', icon: FileText, href: '/fitsavory/plans' },
  { id: 'hydration', name: 'Hydration Intake', icon: Droplets, href: '/fitsavory/hydration' },
  { id: 'upload', name: 'Upload Recipe', icon: Upload, href: '/fitsavory/upload' },
  { id: 'foods', name: 'My Foods', icon: BookOpen, href: '/fitsavory/foods' },
  { id: 'calendar', name: 'Calendar', icon: Calendar, href: '/fitsavory/calendar' }
]

function ProgressSummary({
  variant = 'sidebar',
  isAuthenticated,
  progressError,
  progressMetrics,
  onRefresh,
  isRefreshing,
  lastUpdatedLabel,
  todayProgress,
  formatMetric
}) {
  const isCompact = variant === 'mobile'

  const containerClass = isCompact
    ? 'rounded-xl border border-olive-100 bg-olive-50 p-4 shadow-sm dark:border-olive-200/40 dark:bg-olive-900/20'
    : 'mt-8 rounded-xl border border-olive-100 bg-olive-50 p-5 shadow-sm dark:border-olive-200/40 dark:bg-olive-900/20'

  const titleClass = isCompact
    ? 'text-xs font-semibold uppercase tracking-wide text-olive-900 dark:text-olive-200'
    : 'text-sm font-semibold uppercase tracking-wide text-olive-900 dark:text-olive-200'

  const refreshClass = isCompact
    ? 'text-[0.65rem] font-semibold text-olive-800 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-olive-200'
    : 'text-xs font-semibold text-olive-800 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-olive-200'

  const messageClass = isCompact
    ? 'mt-3 text-xs text-olive-800 dark:text-olive-200'
    : 'mt-3 text-sm text-olive-800 dark:text-olive-200'

  const metricsSpacing = isCompact ? 'mt-3 space-y-2' : 'mt-4 space-y-3'
  const noLogClass = isCompact
    ? 'mt-3 rounded-lg bg-white/70 px-3 py-2 text-[0.7rem] text-olive-800 dark:bg-gray-900/60 dark:text-olive-200'
    : 'mt-4 rounded-lg bg-white/70 px-3 py-2 text-xs text-olive-800 dark:bg-gray-900/60 dark:text-olive-200'
  const updatedClass = isCompact
    ? 'mt-3 text-[0.65rem] text-olive-700 dark:text-olive-300'
    : 'mt-3 text-xs text-olive-700 dark:text-olive-300'

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={titleClass}>Today’s Progress</h3>
        {isAuthenticated ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className={refreshClass}
          >
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        ) : null}
      </div>

      {progressError ? (
        <p className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-200/40 dark:bg-rose-900/20 dark:text-rose-200">
          {progressError}
        </p>
      ) : null}

      {!isAuthenticated ? (
        <p className={messageClass}>Log in to track today’s nutrition progress.</p>
      ) : progressMetrics.length ? (
        <>
          <div className={metricsSpacing}>
            {progressMetrics.map((metric) => (
              <div key={metric.key} className="flex items-center justify-between text-xs sm:text-sm">
                <span className="font-medium text-olive-800 dark:text-olive-200">{metric.label}</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatMetric(metric.current, metric.unit)} / {formatMetric(metric.target, metric.unit)}
                </span>
              </div>
            ))}
          </div>

          {!todayProgress ? (
            <p className={noLogClass}>No intake logged for today yet. Start tracking meals to see live progress.</p>
          ) : null}

          {lastUpdatedLabel ? <p className={updatedClass}>Updated {lastUpdatedLabel}</p> : null}
        </>
      ) : (
        <p className={messageClass}>Set up a meal plan to unlock live progress tracking.</p>
      )}
    </div>
  )
}

export default function FitSavoryLayout({ children }) {
  const { status } = useSession()
  const pathname = usePathname()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [progressTargets, setProgressTargets] = useState(null)
  const [todayProgress, setTodayProgress] = useState(null)
  const [isRefreshingProgress, setIsRefreshingProgress] = useState(false)
  const [progressError, setProgressError] = useState(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null)
  const [accessStatus, setAccessStatus] = useState('checking') // 'checking' | 'granted' | 'denied' | 'error' | 'unauthenticated'
  const [accessError, setAccessError] = useState(null)
  const [subscriptionPlan, setSubscriptionPlan] = useState(null)

  const numberFormatter = useMemo(() => new Intl.NumberFormat(), [])

  const formatMetric = useCallback(
    (value, unit = '') => {
      const safeValue = typeof value === 'number' && !Number.isNaN(value) ? value : 0
      const formatted = numberFormatter.format(safeValue)
      return unit ? `${formatted}${unit}` : formatted
    },
    [numberFormatter]
  )

  const refreshTodayProgress = useCallback(async () => {
    if (status !== 'authenticated') {
      setTodayProgress(null)
      setProgressTargets(null)
      setLastUpdatedAt(null)
      setProgressError(null)
      return
    }

    if (accessStatus !== 'granted') {
      setTodayProgress(null)
      setProgressTargets(null)
      if (accessStatus === 'denied') {
        setProgressError('FitSavory requires an active Premium subscription. Upgrade to unlock meal planning and nutrition insights.')
      } else if (accessStatus === 'error') {
        setProgressError(accessError || 'Unable to verify your subscription right now. Please try again later.')
      } else {
        setProgressError(null)
      }
      return
    }

    setIsRefreshingProgress(true)
    setProgressError(null)

    try {
      const response = await fetch('/api/meal-planner', { cache: 'no-store' })
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        const message = errorBody?.message || 'Meal planner service is unavailable. Please try again later.'
        throw new Error(message)
      }

      const data = await response.json()
      const targets = {
        calories: data?.targets?.calories ?? 2000,
        protein: data?.targets?.protein ?? 150,
        carbs: data?.targets?.carbs ?? 250,
        fat: data?.targets?.fat ?? 67
      }

      const normalizeDate = (value) => formatToManilaDate(value) ?? null

      const todayIso = getManilaTodayIso()
      const planDays = Array.isArray(data?.mealPlan) ? data.mealPlan : []
      const todayEntry = planDays.find((day) => normalizeDate(day?.date) === todayIso) ?? null

      const resolvePlanIdForLogs = () => {
        const candidates = [
          data?.planId,
          data?.dietPlan?.id,
          data?.metadata?.dietPlanId,
          todayEntry?.plan_id,
          todayEntry?.diet_plan_id
        ]

        for (const candidate of candidates) {
          if (candidate === null || candidate === undefined) continue
          const numeric = Number(candidate)
          if (Number.isFinite(numeric)) {
            return numeric
          }

          const trimmed = candidate?.toString().trim()
          if (trimmed) {
            return trimmed
          }
        }

        return null
      }

      const planIdForLogs = resolvePlanIdForLogs()

      const logsResponse = planIdForLogs
        ? await fetch(
            `/api/diet-plans/logs?${new URLSearchParams({
              planId: planIdForLogs.toString(),
              startDate: todayIso ?? '',
              endDate: todayIso ?? ''
            }).toString()}`,
            { cache: 'no-store' }
          ).catch(() => null)
        : null

      let actualLog = null
      if (logsResponse?.ok) {
        const logsData = await logsResponse.json().catch(() => null)
        if (Array.isArray(logsData?.logs) && logsData.logs.length) {
          const resolveLogDate = (log) => {
            const raw =
              log?.logDate ??
              log?.log_date ??
              log?.date ??
              log?.created_at ??
              log?.createdAt ??
              null

            return normalizeDate(raw)
          }

          const matchingLog = logsData.logs.find((log) => resolveLogDate(log) === todayIso)

          actualLog = matchingLog ?? logsData.logs[0]
        }
      }

      const pickValue = (...keys) => {
        for (const key of keys) {
          const value = actualLog?.[key]
          if (value == null) continue
          const numeric = Number(value)
          if (Number.isFinite(numeric)) {
            return Math.round(numeric)
          }
        }
        return null
      }

      const totals = actualLog
        ? {
            calories: pickValue('caloriesConsumed', 'calories_consumed') ?? 0,
            protein: pickValue('protein', 'protein_g') ?? 0,
            carbs: pickValue('carbs', 'carbs_g') ?? 0,
            fat: pickValue('fat', 'fat_g') ?? 0
          }
        : null

      setProgressTargets(targets)
      setTodayProgress(totals)
      setLastUpdatedAt(new Date())
    } catch (error) {
      console.error('Failed to refresh FitSavory progress:', error)
      setProgressError(error.message || 'Unable to refresh progress right now')
    } finally {
      setIsRefreshingProgress(false)
    }
  }, [accessError, accessStatus, status])

  useEffect(() => {
    let isActive = true

    if (status !== 'authenticated') {
      if (isActive) {
        setAccessStatus(status === 'loading' ? 'checking' : 'unauthenticated')
        setAccessError(null)
        setSubscriptionPlan(null)
      }
      return () => {
        isActive = false
      }
    }

    const verifyAccess = async () => {
      try {
        if (isActive) {
          setAccessStatus('checking')
          setAccessError(null)
        }

        const response = await fetch('/api/user/subscription', { cache: 'no-store' })

        if (!response.ok) {
          throw new Error('Unable to confirm your subscription right now')
        }

        const data = await response.json()
        const planName = data?.plan?.name?.toString().toLowerCase()
        const planFeatures = Array.isArray(data?.plan?.features) ? data.plan.features.map((feature) => feature?.toString().toLowerCase()) : []
        const hasPremiumPlan = planName?.includes('premium')
        const hasFitSavoryFeature = planFeatures.some((feature) => feature?.includes('fitsavory'))
        const statusLabel = data?.status?.toString().toLowerCase()
        const hasSubscription = data?.hasSubscription === true

        const isActiveSubscription = hasPremiumPlan || hasFitSavoryFeature || statusLabel === 'active' || hasSubscription

        if (!isActive) {
          return
        }

        setSubscriptionPlan(data?.plan ?? null)
        setAccessStatus(isActiveSubscription ? 'granted' : 'denied')
        if (!isActiveSubscription) {
          setProgressTargets(null)
          setTodayProgress(null)
        }
      } catch (error) {
        console.error('Failed to verify FitSavory access:', error)
        if (!isActive) {
          return
        }
        setAccessStatus('error')
        setAccessError(error.message || 'Unable to verify your subscription right now')
        setProgressTargets(null)
        setTodayProgress(null)
      }
    }

    verifyAccess()

    return () => {
      isActive = false
    }
  }, [status])

  useEffect(() => {
    let isMounted = true

    const runRefresh = () => {
      if (!isMounted) return
      refreshTodayProgress()
    }

    runRefresh()

    window.addEventListener('refreshFitSavoryDashboard', runRefresh)
    window.addEventListener('refreshMealPlan', runRefresh)
    window.addEventListener('refreshFitSavoryHydration', runRefresh)

    return () => {
      isMounted = false
      window.removeEventListener('refreshFitSavoryDashboard', runRefresh)
      window.removeEventListener('refreshMealPlan', runRefresh)
      window.removeEventListener('refreshFitSavoryHydration', runRefresh)
    }
  }, [status, accessStatus, refreshTodayProgress])

  const progressMetrics = useMemo(() => {
    if (!progressTargets) return []
    return [
      {
        key: 'calories',
        label: 'Calories',
        current: todayProgress?.calories ?? 0,
        target: progressTargets.calories ?? 0,
        unit: ''
      },
      {
        key: 'protein',
        label: 'Protein',
        current: todayProgress?.protein ?? 0,
        target: progressTargets.protein ?? 0,
        unit: 'g'
      },
      {
        key: 'carbs',
        label: 'Carbs',
        current: todayProgress?.carbs ?? 0,
        target: progressTargets.carbs ?? 0,
        unit: 'g'
      },
      {
        key: 'fat',
        label: 'Fat',
        current: todayProgress?.fat ?? 0,
        target: progressTargets.fat ?? 0,
        unit: 'g'
      }
    ]
  }, [progressTargets, todayProgress])

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return null
    return formatManilaTimeLabel(lastUpdatedAt)
  }, [lastUpdatedAt])

  useEffect(() => {
    if (!pathname) return

    const sortedNav = [...NAV_LINKS].sort((a, b) => b.href.length - a.href.length)
    const match = sortedNav.find((item) => pathname.startsWith(item.href))
    if (match) {
      setActiveTab(match.id)
    }
  }, [pathname])

  const isAuthenticated = status === 'authenticated'

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 dark:bg-gray-950">
      {/* Mobile Top Navigation */}
      <div className="md:hidden sticky top-0 z-20 bg-white border-b border-soft-200 dark:bg-gray-900 dark:border-gray-800">
        <div className="px-4 py-2 space-y-2">
          <div>
            <h2 className="text-lg font-fredoka font-semibold text-gray-900.dark:text-gray-100">FitSavory</h2>
            <p className="text-xs text-gray-500 font-fredoka mt-1 dark:text-gray-400">Navigate between dashboard tools and keep tabs on today’s progress.</p>
          </div>

          <nav className="flex gap-2 overflow-x-auto pb-1">
            {NAV_LINKS.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              const isItemLocked = !isAuthenticated || (accessStatus !== 'granted' && item.id !== 'dashboard')

              return (
                <Link
                  key={item.id}
                  href={isItemLocked ? '#' : item.href}
                  aria-current={isActive ? 'page' : undefined}
                  aria-disabled={isItemLocked}
                  onClick={(event) => {
                    if (isItemLocked) {
                      event.preventDefault()
                      event.stopPropagation()
                      return
                    }
                    setActiveTab(item.id)
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-olive-600 text-white shadow-sm'
                      : 'bg-soft-100 text-gray-600 hover:bg-olive-100 hover:text-olive-700'
                  } ${isItemLocked ? 'cursor-not-allowed opacity-60' : ''}`}
                  title={isItemLocked ? 'Available with FitSavory Premium access' : undefined}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Sidebar Navigation */}
      <div className="hidden md:flex md:fixed md:left-0 md:top-16 md:h-[calc(100vh-4rem)] md:w-64 md:flex-col md:bg-white md:shadow-sm md:overflow-y-auto dark:md:bg-gray-900 dark:md:shadow-none">
        <div className="p-6">
          <nav className="space-y-2">
            {NAV_LINKS.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              const isItemLocked = !isAuthenticated || (accessStatus !== 'granted' && item.id !== 'dashboard')

              return (
                <Link
                  key={item.id}
                  href={isItemLocked ? '#' : item.href}
                  onClick={(event) => {
                    if (isItemLocked) {
                      event.preventDefault()
                      event.stopPropagation()
                      return
                    }
                    setActiveTab(item.id)
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  aria-disabled={isItemLocked}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isItemLocked
                      ? 'cursor-not-allowed text-gray-400 dark:text-gray-500'
                      : isActive
                        ? 'bg-olive-100 text-olive-700 ring-1 ring-olive-500/40 dark:bg-olive-900/40 dark:text-olive-200'
                        : 'text-gray-600 hover:bg-white hover:text-olive-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                  }`}
                  title={isItemLocked ? 'Available with FitSavory Premium access' : undefined}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 w-full px-4 pb-10 pt-2 md:ml-64 md:px-10 md:pt-4 md:pb-8">
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          {status === 'loading' || accessStatus === 'checking' ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-olive-200 bg-white/60 p-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-olive-700" />
              <p className="text-sm text-olive-800">Verifying your FitSavory access…</p>
            </div>
          ) : !isAuthenticated ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center.gap-4 rounded-xl border border-olive-200 bg-white p-8 text-center">
              <p className="text-lg font-semibold text-olive-900">Log in to access FitSavory</p>
              <p className="text-sm text-olive-700 max-w-md">
                FitSavory provides personalized meal planning, macro tracking, and advanced nutrition analytics. Sign in and upgrade to Premium to get started.
              </p>
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 rounded-lg bg-olive-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-olive-700"
              >
                Go to Login
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : accessStatus === 'denied' ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
              <p className="text-lg font-semibold text-amber-900">Premium subscription required</p>
              <p className="text-sm text-amber-800 max-w-md">
                Your account doesn’t have FitSavory access yet. Upgrade to a Premium plan to unlock meal planner automations and nutrition tracking tools.
              </p>
              <Link
                href="/subscribe?plan=premium"
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
              >
                View Premium Plans
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : accessStatus === 'error' ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-xl border border-rose-200 bg-rose-50 p-8 text-center">
              <p className="text-lg font-semibold text-rose-900">Unable to verify access</p>
              <p className="text-sm text-rose-800 max-w-md">
                {accessError || 'We couldn’t confirm your FitSavory subscription. Please refresh the page or contact support if the issue persists.'}
              </p>
              <button
                type="button"
                onClick={refreshTodayProgress}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700"
              >
                Retry
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
      <FloatingThemeToggle />
    </div>
  )
}
