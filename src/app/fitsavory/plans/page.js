'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Loader2,
  ShieldAlert,
  Plus,
  Calendar,
  Target,
  TrendingUp,
  CheckCircle2,
  Pause,
  AlertCircle,
  RefreshCw,
  Play,
  XCircle
} from 'lucide-react'

import PlanFormModal from '@/components/fitsavory/plans/PlanFormModal'

const GOAL_OPTIONS = [
  { value: 'weight_loss', label: 'Weight Loss' },
  { value: 'weight_gain', label: 'Weight Gain' },
  { value: 'maintain_weight', label: 'Maintain Weight' },
  { value: 'build_muscle', label: 'Build Muscle' },
  { value: 'improve_health', label: 'Improve Health' },
  { value: 'other', label: 'Other' }
]

const PLAN_TYPES = [
  { value: 'standard', label: 'Standard' },
  { value: 'keto', label: 'Keto' },
  { value: 'mediterranean', label: 'Mediterranean' },
  { value: 'paleo', label: 'Paleo' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'custom', label: 'Custom' }
]

const STATUS_STYLES = {
  active: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  paused: 'bg-amber-50 text-amber-700 border border-amber-200',
  completed: 'bg-blue-50 text-blue-700 border border-blue-200',
  cancelled: 'bg-gray-100 text-gray-600 border border-gray-200'
}

const STATUS_ICONS = {
  active: CheckCircle2,
  paused: Pause,
  completed: CheckCircle2,
  cancelled: AlertCircle
}


export default function DietPlans() {
  const { status } = useSession()
  const router = useRouter()

  const [plans, setPlans] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreatePlan, setShowCreatePlan] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [statusUpdates, setStatusUpdates] = useState({})

  const loadPlans = useCallback(
    async (options = {}) => {
      const { signal, showSpinner = true } = options
      if (showSpinner) {
        setIsLoading(true)
      }
      setError(null)

      try {
        const response = await fetch('/api/diet-plans', {
          cache: 'no-store',
          signal
        })

        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          const message = body?.error || 'Unable to load diet plans'
          throw new Error(message)
        }

        const data = await response.json()
        setPlans(Array.isArray(data?.plans) ? data.plans : [])
      } catch (fetchError) {
        if (signal?.aborted) {
          return
        }
        console.error('Failed to load diet plans:', fetchError)
        setError(fetchError.message || 'Unable to load diet plans right now')
      } finally {
        if (!signal?.aborted && showSpinner) {
          setIsLoading(false)
        }
      }
    },
    []
  )

  useEffect(() => {
    if (status === 'loading') {
      return
    }

    if (status !== 'authenticated') {
      setPlans([])
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    loadPlans({ signal: controller.signal })

    return () => controller.abort()
  }, [status, loadPlans])

  const handleRefresh = async () => {
    if (status !== 'authenticated') {
      router.push('/auth/login?callbackUrl=/fitsavory/plans')
      return
    }

    setIsLoading(true)
    setActionError(null)
    await loadPlans()
    setIsLoading(false)
  }

  const handleCreatePlan = async (payload) => {
    setActionError(null)
    const response = await fetch('/api/diet-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body?.error || 'Failed to create diet plan')
    }

    const data = await response.json()
    const newPlan = data?.plan
    if (newPlan) {
      setPlans((prev) => [newPlan, ...prev])
    }
  }

  const handleUpdatePlanStatus = async (planId, nextStatus) => {
    if (!planId || !nextStatus) {
      return
    }

    setActionError(null)

    setStatusUpdates((prev) => ({ ...prev, [planId]: nextStatus }))

    try {
      const response = await fetch('/api/diet-plans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, status: nextStatus })
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body?.error || 'Failed to update diet plan status')
      }

      const data = await response.json()
      const updatedPlan = data?.plan
      if (updatedPlan) {
        setPlans((prev) => prev.map((plan) => (plan.id === updatedPlan.id ? updatedPlan : plan)))
      }
    } catch (statusError) {
      console.error('Failed to update plan status:', statusError)
      setActionError(statusError.message || 'Unable to update diet plan status right now.')
    } finally {
      setStatusUpdates((prev) => {
        const next = { ...prev }
        delete next[planId]
        return next
      })
    }
  }

  const handleDeletePlan = useCallback(
    async (planId) => {
      if (!planId) {
        return
      }

      const confirmed = window.confirm('This will delete the plan and its logs. Continue?')
      if (!confirmed) {
        return
      }

      setActionError(null)
      setStatusUpdates((prev) => ({ ...prev, [planId]: 'deleting' }))

      try {
        const response = await fetch(`/api/diet-plans?planId=${encodeURIComponent(planId)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        })

        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body?.error || 'Failed to delete diet plan')
        }

        setPlans((prev) => prev.filter((plan) => plan.id !== planId))
      } catch (deleteError) {
        console.error('Failed to delete diet plan:', deleteError)
        setActionError(deleteError.message || 'Unable to delete diet plan right now.')
      } finally {
        setStatusUpdates((prev) => {
          const next = { ...prev }
          delete next[planId]
          return next
        })
      }
    },
    []
  )

  const planMetrics = useMemo(() => {
    if (!plans.length) {
      return {
        active: 0,
        completed: 0,
        total: 0,
        averageProgress: 0,
        upcomingStart: null,
        streakMessage: null
      }
    }

    const active = plans.filter((plan) => plan.status === 'active').length
    const completed = plans.filter((plan) => plan.status === 'completed').length
    const total = plans.length
    const sumProgress = plans.reduce((acc, plan) => acc + (plan.progressPercentage || 0), 0)
    const averageProgress = total ? Math.round(sumProgress / total) : 0

    const upcomingPlan = plans
      .map((plan) => ({ plan, startDate: plan.startDate ? new Date(plan.startDate) : null }))
      .filter((entry) => entry.startDate && entry.startDate >= new Date())
      .sort((a, b) => a.startDate - b.startDate)[0]

    const streakMessage = active
      ? 'Momentum is strong—keep logging daily for best insights.'
      : completed
        ? 'Celebrate a completed plan or start a new one to maintain progress.'
        : 'Kick off your first plan to unlock tailored guidance.'

    return {
      active,
      completed,
      total,
      averageProgress,
      upcomingStart: upcomingPlan?.startDate || null,
      streakMessage
    }
  }, [plans])

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-olive-600" />
        <span className="ml-2 text-sm text-gray-600">Loading your diet plans…</span>
      </div>
    )
  }

  if (status !== 'authenticated') {
    return (
      <div className="max-w-2xl mx-auto bg-white border border-soft-200 rounded-xl p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-rose-500" />
        <h1 className="text-2xl font-semibold text-gray-900 mt-4">Sign in to view diet plans</h1>
        <p className="text-sm text-gray-600 mt-2">
          FitSavory diet plan management is available to authenticated members.
        </p>
        <button
          onClick={() => router.push('/auth/login?callbackUrl=/fitsavory/plans')}
          className="mt-6 inline-flex items-center px-5 py-2.5 rounded-lg bg-olive-600 text-white font-medium hover:bg-olive-700"
        >
          Go to Login
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Diet Plans</h1>
          <p className="text-gray-600 mt-1 dark:text-gray-300">
            Create, monitor, and adjust your FitSavory diet plans to stay on target.
          </p>
          {planMetrics.streakMessage ? (
            <p className="mt-2 text-sm text-olive-600 dark:text-olive-200">{planMetrics.streakMessage}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-soft-200 text-sm font-medium hover:border-olive-400 hover:text-olive-700 dark:border-gray-700 dark:text-gray-200 dark:hover:text-olive-200"
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={() => {
              setShowCreatePlan(true)
            }}
            type="button"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-olive-600 text-white font-semibold hover:bg-olive-700"
          >
            <Plus className="h-5 w-5" />
            New Plan
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm flex items-center justify-between dark:bg-rose-900/20 dark:border-rose-300/30 dark:text-rose-200">
          <span>{error}</span>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1 text-rose-700 hover:text-rose-800 dark:text-rose-200 dark:hover:text-rose-100"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      ) : null}

      {actionError ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm flex items-start gap-2 dark:bg-amber-900/20 dark:border-amber-200/30 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div
          className="relative bg-white p-4 rounded-lg shadow-sm border dark:bg-gray-900 dark:border-gray-800"
          title="Active diet plans currently in progress"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">Active Plans</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{planMetrics.active}</p>
            </div>
            <Target className="h-8 w-8 text-green-600" />
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Great job staying on track.</p>
        </div>
        <div
          className="relative bg-white p-4 rounded-lg shadow-sm border dark:bg-gray-900 dark:border-gray-800"
          title="How many plans you've completed"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">Completed</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{planMetrics.completed}</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-blue-600" />
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Track accomplishments for quick wins.</p>
        </div>
        <div
          className="relative bg-white p-4 rounded-lg shadow-sm border dark:bg-gray-900 dark:border-gray-800"
          title="Average completion percentage across all plans"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">Average Progress</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{planMetrics.averageProgress}%</p>
            </div>
            <TrendingUp className="h-8 w-8 text-olive-600" />
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Average completion across all plans.</p>
        </div>
        <div
          className="relative bg-white p-4 rounded-lg shadow-sm border dark:bg-gray-900 dark:border-gray-800"
          title="Total diet plans you've created, including upcoming ones"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">Total Plans</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{planMetrics.total}</p>
            </div>
            <Calendar className="h-8 w-8 text-purple-600" />
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Upcoming start: {planMetrics.upcomingStart ? new Date(planMetrics.upcomingStart).toLocaleDateString() : '—'}
          </p>
        </div>
      </div>

      {plans.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {plans.map((plan) => {
            const StatusIcon = STATUS_ICONS[plan.status] ?? AlertCircle
            const badgeClass = STATUS_STYLES[plan.status] ?? STATUS_STYLES.cancelled
            const progressValue = Math.min(Math.max(plan.progressPercentage ?? 0, 0), 100)
            const pendingStatus = statusUpdates[plan.id]
            const isBusy = Boolean(pendingStatus)

            return (
              <div key={plan.id} className="bg-white rounded-xl shadow-sm border overflow-hidden dark:bg-gray-900 dark:border-gray-800">
                <div className="p-6 space-y-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{plan.name}</h3>
                      {plan.description ? (
                        <p className="text-sm text-gray-600 mt-1 dark:text-gray-300">{plan.description}</p>
                      ) : null}
                    </div>
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${badgeClass}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      <span className="capitalize">{plan.status}</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Goal</p>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">
                        {GOAL_OPTIONS.find((goal) => goal.value === plan.goal)?.label || plan.goal}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Plan Type</p>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">
                        {PLAN_TYPES.find((type) => type.value === plan.planType)?.label || plan.planType}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Duration</p>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">
                        {plan.startDate ? plan.startDate : '—'}
                        {plan.endDate ? ` → ${plan.endDate}` : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Daily Calories</p>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">
                        {plan.dailyCalories?.toLocaleString?.() ?? plan.dailyCalories ?? '—'} kcal
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="bg-soft-50 border border-soft-200 rounded-lg p-3 text-center dark:bg-gray-800/60 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Protein</p>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{plan.macros?.protein ?? '—'} g</p>
                    </div>
                    <div className="bg-soft-50 border border-soft-200 rounded-lg p-3 text-center dark:bg-gray-800/60 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Carbs</p>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{plan.macros?.carbs ?? '—'} g</p>
                    </div>
                    <div className="bg-soft-50 border border-soft-200 rounded-lg p-3 text-center dark:bg-gray-800/60 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Fat</p>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{plan.macros?.fat ?? '—'} g</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Progress</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{Math.round(progressValue)}%</span>
                    </div>
                    <div className="h-2 bg-soft-200 rounded-full overflow-hidden dark:bg-gray-800">
                      <div
                        className="h-full bg-olive-600 transition-all duration-300"
                        style={{ width: `${progressValue}%` }}
                      ></div>
                    </div>
                    <div className="grid grid-cols-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>Total Days: {plan.totalDays ?? '—'}</span>
                      <span className="text-right">Completed: {plan.completedDays ?? 0}</span>
                    </div>
                  </div>

                  {plan.latestLog ? (
                    <div className="rounded-lg border border-soft-200 bg-soft-50 p-3 text-sm dark:bg-gray-800/60 dark:border-gray-700">
                      <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Latest log · {plan.latestLog.logDate}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-gray-500 text-xs dark:text-gray-400">Weight</p>
                          <p className="font-semibold text-gray-900 dark:text-gray-100">{plan.latestLog.weightKg ?? '—'} kg</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs dark:text-gray-400">Calories</p>
                          <p className="font-semibold text-gray-900 dark:text-gray-100">{plan.latestLog.caloriesConsumed ?? '—'} kcal</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs dark:text-gray-400">Energy</p>
                          <p className="font-semibold text-gray-900 dark:text-gray-100">{plan.latestLog.energyLevel ?? '—'}/10</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs dark:text-gray-400">Mood</p>
                          <p className="font-semibold text-gray-900 capitalize dark:text-gray-100">{plan.latestLog.mood ?? '—'}</p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 border-t border-soft-200 pt-4 dark:border-gray-800">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-soft-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-olive-300 hover:text-olive-600 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300"
                      disabled={plan.status !== 'active' || isBusy}
                      onClick={() => handleUpdatePlanStatus(plan.id, 'paused')}
                      title="Pause this plan"
                    >
                      {pendingStatus === 'paused' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
                      Pause
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-soft-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-olive-300 hover:text-olive-600 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300"
                      disabled={plan.status !== 'paused' || isBusy}
                      onClick={() => handleUpdatePlanStatus(plan.id, 'active')}
                      title="Resume this plan"
                    >
                      {pendingStatus === 'active' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      Resume
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-soft-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-rose-300 hover:text-rose-600 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300"
                      disabled={plan.status === 'cancelled' || plan.status === 'completed' || isBusy}
                      onClick={() => handleUpdatePlanStatus(plan.id, 'cancelled')}
                      title="Cancel this plan"
                    >
                      {pendingStatus === 'cancelled' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-soft-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-rose-400 hover:text-rose-600 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300"
                      onClick={() => handleDeletePlan(plan.id)}
                      disabled={isBusy}
                      title="Delete this plan"
                    >
                      {statusUpdates[plan.id] === 'deleting' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-dashed border-soft-200 p-12 text-center dark:bg-gray-900 dark:border-gray-800">
          <h3 className="text-xl font-fredoka font-semibold text-gray-900 dark:text-gray-100">No diet plans yet</h3>
          <p className="mt-2 text-gray-600 font-fredoka dark:text-gray-300">
            Create your first FitSavory plan to start tracking progress toward your goals.
          </p>
          <button
            onClick={() => setShowCreatePlan(true)}
            type="button"
            className="mt-6 inline-flex items-center px-6 py-3 bg-olive-600 text-white rounded-lg hover:bg-olive-700 transition-colors"
          >
            <Plus className="h-5 w-5 mr-2" />
            Create Plan
          </button>
        </div>
      )}

      {showCreatePlan ? (
        <PlanFormModal
          open={showCreatePlan}
          onClose={() => setShowCreatePlan(false)}
          onSubmit={handleCreatePlan}
          goalOptions={GOAL_OPTIONS}
          planTypes={PLAN_TYPES}
        />
      ) : null}
    </div>
  )
}
