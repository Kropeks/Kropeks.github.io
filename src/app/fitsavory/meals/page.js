'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Loader2,
  Search,
  Clock,
  Utensils,
  RefreshCw,
  RotateCcw,
  Plus,
  ChefHat,
  ExternalLink,
  CheckCircle,
  PencilLine,
  Droplets
} from 'lucide-react'
import {
  formatToManilaDate,
  formatManilaDateLabel,
  getManilaTodayIso,
  getMsUntilNextManilaMidnight
} from '@/lib/manilaTime'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog'

const mealTypes = [
  { id: 'breakfast', name: 'Breakfast', icon: '🍳', color: 'bg-orange-100 text-orange-800' },
  { id: 'lunch', name: 'Lunch', icon: '🥗', color: 'bg-green-100 text-green-800' },
  { id: 'dinner', name: 'Dinner', icon: '🍽️', color: 'bg-blue-100 text-blue-800' },
  { id: 'snack', name: 'Snack', icon: '🍎', color: 'bg-purple-100 text-purple-800' }
]

const EMPTY_TARGETS = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0
}

const NUTRIENT_METRICS = ['calories', 'protein', 'carbs', 'fat']

const normalizeTargetValue = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.round(numeric) : 0
}

const normalizeTargets = (targets) => {
  if (!targets) {
    return { ...EMPTY_TARGETS }
  }

  return {
    calories: normalizeTargetValue(targets.calories),
    protein: normalizeTargetValue(targets.protein),
    carbs: normalizeTargetValue(targets.carbs),
    fat: normalizeTargetValue(targets.fat)
  }
}

const DEFAULT_LOG_FORM = {
  weightKg: '',
  caloriesConsumed: '',
  caloriesBurned: '',
  protein: '',
  carbs: '',
  fat: '',
  waterMl: '',
  workoutDurationMinutes: '',
  notes: ''
}

export default function MealTracking() {
  const { status } = useSession()
  const router = useRouter()
  const [mealPlan, setMealPlan] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedDayValue, setSelectedDayValue] = useState('')
  const [dailyLog, setDailyLog] = useState(null)
  const [isLogLoading, setIsLogLoading] = useState(false)
  const [isLogModalOpen, setIsLogModalOpen] = useState(false)
  const [logForm, setLogForm] = useState(DEFAULT_LOG_FORM)
  const [isSavingLog, setIsSavingLog] = useState(false)
  const [logSubmitError, setLogSubmitError] = useState(null)
  const [logSuccess, setLogSuccess] = useState(null)
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false)
  const [recipeModalLoading, setRecipeModalLoading] = useState(false)
  const [recipeModalError, setRecipeModalError] = useState(null)
  const [recipeDetails, setRecipeDetails] = useState(null)
  const [recipeMealContext, setRecipeMealContext] = useState(null)
  const midnightTimerRef = useRef(null)
  const [quickLoggingMealId, setQuickLoggingMealId] = useState(null)
  const [loggedMeals, setLoggedMeals] = useState([])
  const [isResettingLog, setIsResettingLog] = useState(false)
  const [hydrationTotalMl, setHydrationTotalMl] = useState(null)
  const [hydrationWeeklySeries, setHydrationWeeklySeries] = useState([])
  const [hydrationWeeklyStats, setHydrationWeeklyStats] = useState({ average: null, streak: 0 })
  const [isHydrationWeeklyLoading, setIsHydrationWeeklyLoading] = useState(false)

  const parseHydrationAmount = useCallback((value) => {
    if (value === null || value === undefined) {
      return 0
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0
    }

    if (typeof value === 'string') {
      const match = value.match(/-?\d+(?:\.\d+)?/)
      if (!match) {
        return 0
      }
      const numeric = Number(match[0])
      return Number.isFinite(numeric) ? numeric : 0
    }

    return 0
  }, [])

  const activeDietPlanId = useMemo(() => {
    const candidate = mealPlan?.dietPlan?.id ?? mealPlan?.metadata?.dietPlanId ?? mealPlan?.dietPlanId ?? null
    if (candidate === null || candidate === undefined) {
      return null
    }

    if (typeof candidate === 'string') {
      const trimmed = candidate.trim()
      return trimmed.length ? trimmed : null
    }

    if (Number.isFinite(Number(candidate))) {
      return String(candidate)
    }

    return null
  }, [mealPlan])

  const loadDailyLog = useCallback(
    async ({ planId, isoDate, signal }) => {
      if (!planId || !isoDate) {
        setDailyLog(null)
        return
      }

      try {
        setIsLogLoading(true)
        const params = new URLSearchParams({ planId, startDate: isoDate, endDate: isoDate })
        const response = await fetch(`/api/diet-plans/logs?${params.toString()}`, {
          cache: 'no-store',
          signal
        })

        if (!response.ok) {
          throw new Error('Unable to load intake log for this day')
        }

        const data = await response.json()
        const logEntry = Array.isArray(data?.logs) ? data.logs[0] ?? null : null
        setDailyLog(logEntry)
      } catch (logError) {
        if (signal?.aborted) return
        console.error('Failed to fetch daily intake log:', logError)
        setDailyLog(null)
      } finally {
        if (!signal?.aborted) {
          setIsLogLoading(false)
        }
      }
    },
    []
  )

  const fetchHydrationTotal = useCallback(
    async ({ isoDate, signal } = {}) => {
      if (!isoDate) {
        setHydrationTotalMl(null)
        return
      }

      try {
        const params = new URLSearchParams({ startDate: isoDate, endDate: isoDate, limit: '60' })
        const response = await fetch(`/api/fitsavory/hydration/logs?${params.toString()}`, {
          cache: 'no-store',
          signal
        })

        if (!response.ok) {
          throw new Error('Unable to load hydration intake for this day')
        }

        const data = await response.json()
        const total = Array.isArray(data?.logs)
          ? data.logs.reduce((sum, entry) => {
              const numeric = Number(entry?.waterMl ?? entry?.water_ml)
              return Number.isFinite(numeric) ? sum + numeric : sum
            }, 0)
          : 0

        setHydrationTotalMl(total)
      } catch (hydrationError) {
        if (signal?.aborted) return
        console.error('Failed to fetch hydration totals:', hydrationError)
        setHydrationTotalMl(null)
      }
    },
    []
  )

  const fetchMealPlan = useCallback(
    async (controller) => {
      setIsLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/meal-planner', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          const message = body?.error || 'Unable to load meal plan'
          throw new Error(message)
        }

        const data = await response.json()
        setMealPlan(data?.mealPlan?.length ? data : null)
      } catch (fetchError) {
        if (controller.signal.aborted) return
        console.error('Failed to load meal plan meals:', fetchError)
        setError(fetchError.message || 'Unable to load meal plan meals right now')
        setMealPlan(null)
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    },
    []
  )

  useEffect(() => {
    if (status !== 'authenticated') {
      setIsLoading(false)
      setMealPlan(null)
      return
    }

    const controller = new AbortController()
    fetchMealPlan(controller)
    return () => controller.abort()
  }, [status, fetchMealPlan])

  const planStartIso = useMemo(() => getManilaTodayIso(), [])

  const dayOptions = useMemo(() => {
    if (!mealPlan?.mealPlan?.length) return []

    return mealPlan.mealPlan.map((day, index) => {
      const base = new Date(`${planStartIso}T00:00:00+08:00`)
      const offset = Number.isFinite(Number(day.day)) ? Number(day.day) - 1 : index
      base.setDate(base.getDate() + (Number.isFinite(offset) ? offset : index))
      const iso = formatToManilaDate(base)

      const value = iso ?? `day-${day.day ?? index + 1}`
      const label = iso
        ? formatManilaDateLabel(iso, {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
          })
        : `Day ${day.day ?? index + 1}`

      return {
        value,
        label,
        date: iso,
        iso,
        data: day
      }
    })
  }, [mealPlan, planStartIso])

  useEffect(() => {
    if (!dayOptions.length) {
      setSelectedDayValue('')
      return
    }

    const todayIso = getManilaTodayIso()
    const todayOption = dayOptions.find((option) => (option.iso ?? formatToManilaDate(option.date)) === todayIso)
    const firstOption = dayOptions[0]
    setSelectedDayValue((current) => {
      if (current) {
        const stillExists = dayOptions.some((option) => option.value === current)
        if (stillExists) return current
      }
      return todayOption?.value ?? firstOption.value
    })
  }, [dayOptions])

  const selectedDayOption = useMemo(() => {
    if (!dayOptions.length) return null
    return dayOptions.find((option) => option.value === selectedDayValue) ?? dayOptions[0]
  }, [dayOptions, selectedDayValue])

  const selectedDay = useMemo(() => selectedDayOption?.data ?? null, [selectedDayOption])

  const getSelectedIsoDate = useCallback(() => {
    return selectedDayOption?.iso ?? null
  }, [selectedDayOption])

  const selectedDayDisplayLabel = useMemo(() => {
    if (selectedDayOption?.iso) {
      return formatManilaDateLabel(selectedDayOption.iso, {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      })
    }
    if (selectedDayOption?.label) return selectedDayOption.label
    if (selectedDay?.day) return `Day ${selectedDay.day}`
    return 'Selected day'
  }, [selectedDayOption, selectedDay])

  const fetchHydrationWeekly = useCallback(
    async ({ endDateIso, signal } = {}) => {
      const resolvedEnd = endDateIso || getSelectedIsoDate() || getManilaTodayIso()
      if (!resolvedEnd) {
        setHydrationWeeklySeries([])
        setHydrationWeeklyStats({ average: null, streak: 0 })
        return
      }

      setIsHydrationWeeklyLoading(true)
      try {
        const endDate = new Date(`${resolvedEnd}T00:00:00+08:00`)
        const startDate = new Date(endDate)
        startDate.setDate(startDate.getDate() - 6)

        const params = new URLSearchParams({
          startDate: formatToManilaDate(startDate),
          endDate: formatToManilaDate(endDate),
          limit: '90'
        })

        const response = await fetch(`/api/fitsavory/hydration/logs?${params.toString()}`, {
          cache: 'no-store',
          signal
        })

        if (!response.ok) {
          throw new Error('Unable to load hydration history')
        }

        const data = await response.json()
        const rows = Array.isArray(data?.logs) ? data.logs : []
        const totals = new Map()
        rows.forEach((entry) => {
          if (!entry?.date) return
          const iso = formatToManilaDate(entry.date)
          const amount = parseHydrationAmount(entry.waterMl ?? entry.water_ml)
          totals.set(iso, (totals.get(iso) || 0) + amount)
        })

        const series = []
        const cursor = new Date(startDate)
        for (let offset = 0; offset < 7; offset += 1) {
          const iso = formatToManilaDate(cursor)
          series.push({ iso, amount: totals.get(iso) || 0 })
          cursor.setDate(cursor.getDate() + 1)
        }

        const average = series.length
          ? Math.round(series.reduce((sum, entry) => sum + entry.amount, 0) / series.length)
          : null

        let streak = 0
        for (let index = series.length - 1; index >= 0; index -= 1) {
          if (series[index].amount > 0) {
            streak += 1
          } else {
            break
          }
        }

        setHydrationWeeklySeries(series)
        setHydrationWeeklyStats({ average, streak })
      } catch (weeklyError) {
        if (signal?.aborted) {
          return
        }
        console.error('Failed to load hydration weekly trend:', weeklyError)
        setHydrationWeeklySeries([])
        setHydrationWeeklyStats({ average: null, streak: 0 })
      } finally {
        if (!signal?.aborted) {
          setIsHydrationWeeklyLoading(false)
        }
      }
    },
    [getSelectedIsoDate, parseHydrationAmount]
  )

  useEffect(() => {
    const isoDate = getSelectedIsoDate()
    if (!activeDietPlanId || !isoDate) {
      setLoggedMeals([])
      return
    }

    const key = `fitSavoryLoggedMeals:${activeDietPlanId}:${isoDate}`
    try {
      const stored = window.localStorage.getItem(key)
      if (!stored) {
        setLoggedMeals([])
        return
      }
      const parsed = JSON.parse(stored)
      setLoggedMeals(Array.isArray(parsed) ? parsed : [])
    } catch (storageError) {
      console.warn('Failed to load logged meals from storage:', storageError)
      setLoggedMeals([])
    }
  }, [mealPlan?.planId, getSelectedIsoDate])

  useEffect(() => {
    if (!activeDietPlanId) {
      setDailyLog(null)
      return
    }

    const isoDate = getSelectedIsoDate()
    if (!isoDate) {
      setDailyLog(null)
      return
    }

    const controller = new AbortController()
    loadDailyLog({ planId: activeDietPlanId, isoDate, signal: controller.signal })

    return () => controller.abort()
  }, [activeDietPlanId, selectedDayValue, dayOptions, loadDailyLog, getSelectedIsoDate])

  useEffect(() => {
    if (!activeDietPlanId) {
      setHydrationTotalMl(null)
      setHydrationWeeklySeries([])
      setHydrationWeeklyStats({ average: null, streak: 0 })
      return
    }

    const isoDate = getSelectedIsoDate()
    if (!isoDate) {
      setHydrationTotalMl(null)
      setHydrationWeeklySeries([])
      setHydrationWeeklyStats({ average: null, streak: 0 })
      return
    }

    const controller = new AbortController()
    fetchHydrationTotal({ isoDate, signal: controller.signal })
    fetchHydrationWeekly({ endDateIso: isoDate, signal: controller.signal })

    return () => controller.abort()
  }, [activeDietPlanId, fetchHydrationTotal, fetchHydrationWeekly, getSelectedIsoDate])

  const normalizeMeal = (meal, typeId, label) => {
    if (!meal) return null
    const nutrition = meal.nutrition || {}
    const toNumber = (value) => {
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? Math.round(parsed) : null
    }

    const recipeIdentifier = meal.id ?? meal.recipeSlug ?? null

    return {
      id: `${typeId}-${recipeIdentifier ?? label}`,
      type: typeId,
      label,
      name: meal.title || 'Untitled meal',
      description: meal.description || null,
      time: null,
      nutrition: {
        calories: toNumber(nutrition.calories),
        protein: toNumber(nutrition.protein),
        carbs: toNumber(nutrition.carbs),
        fat: toNumber(nutrition.fat)
      },
      source: meal.source || null,
      recipeIdentifier,
      recipeSlug: meal.recipeSlug ?? null,
      recipeSource: meal.source || null
    }
  }

  const canQuickLogMeal = useCallback((meal) => {
    if (!meal?.nutrition) return false
    const keys = ['calories', 'protein', 'carbs', 'fat']
    return keys.some((key) => {
      const value = Number.parseFloat(meal.nutrition[key])
      return Number.isFinite(value) && value > 0
    })
  }, [])

  const handleQuickLog = useCallback(
    async (meal) => {
      const effectivePlanId = activeDietPlanId

      if (!effectivePlanId) {
        setLogSubmitError('No active FitSavory plan found to attach this log to.')
        return
      }

      const isoDate = getSelectedIsoDate()
      if (!isoDate) {
        setLogSubmitError('Unable to determine the selected day for logging intake.')
        return
      }

      if (!canQuickLogMeal(meal)) {
        setLogSubmitError('This meal is missing nutrition details needed for quick logging.')
        return
      }

      const parse = (value) => {
        const number = Number.parseFloat(value)
        return Number.isFinite(number) ? number : 0
      }

      const baseCalories = Number.isFinite(Number(dailyLog?.caloriesConsumed)) ? Number(dailyLog?.caloriesConsumed) : 0
      const baseProtein = Number.isFinite(Number(dailyLog?.protein)) ? Number(dailyLog?.protein) : 0
      const baseCarbs = Number.isFinite(Number(dailyLog?.carbs)) ? Number(dailyLog?.carbs) : 0
      const baseFat = Number.isFinite(Number(dailyLog?.fat)) ? Number(dailyLog?.fat) : 0

      const mealCalories = parse(meal.nutrition.calories)
      const mealProtein = parse(meal.nutrition.protein)
      const mealCarbs = parse(meal.nutrition.carbs)
      const mealFat = parse(meal.nutrition.fat)

      const payload = {
        planId: effectivePlanId,
        logDate: isoDate,
        weightKg: dailyLog?.weightKg ?? null,
        caloriesConsumed: Math.round(baseCalories + mealCalories),
        caloriesBurned: dailyLog?.caloriesBurned ?? null,
        protein: Math.round(baseProtein + mealProtein),
        carbs: Math.round(baseCarbs + mealCarbs),
        fat: Math.round(baseFat + mealFat),
        waterMl: dailyLog?.waterMl ?? null,
        workoutDurationMinutes: dailyLog?.workoutDurationMinutes ?? null,
        notes: dailyLog?.notes ?? null
      }

      try {
        setQuickLoggingMealId(meal.id)
        setLogSubmitError(null)
        setLogSuccess(null)

        const response = await fetch('/api/diet-plans/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body?.error || 'Failed to quick log this meal')
        }

        const data = await response.json()
        const logEntry = data?.log ?? data ?? null
        setDailyLog(logEntry)
        setLogSuccess(`Logged ${meal.name} successfully.`)
        const isoDate = getSelectedIsoDate()
        if (effectivePlanId && isoDate && typeof window !== 'undefined') {
          const key = `fitSavoryLoggedMeals:${effectivePlanId}:${isoDate}`
          setLoggedMeals((previous) => {
            if (previous.includes(meal.id)) return previous
            const next = [...previous, meal.id]
            window.localStorage.setItem(key, JSON.stringify(next))
            return next
          })
        }
        window.dispatchEvent(new Event('refreshFitSavoryDashboard'))
        window.dispatchEvent(new Event('refreshFitSavoryHydration'))
        window.dispatchEvent(new Event('refreshMealPlan'))
      } catch (quickLogError) {
        console.error('Failed to quick log meal:', quickLogError)
        setLogSubmitError(quickLogError.message || 'Unable to quick log this meal right now')
      } finally {
        setQuickLoggingMealId(null)
      }
    },
    [canQuickLogMeal, dailyLog, getSelectedIsoDate, activeDietPlanId]
  )

  const resolveRecipeAttempts = useCallback((meal) => {
    if (!meal) return []

    const attempts = []
    const seen = new Set()
    const pushAttempt = (id, source) => {
      if (!id) return
      const normalizedId = id.toString().trim()
      if (!normalizedId) return
      const normalizedSource = source ? source.toString().toLowerCase() : undefined
      const key = `${normalizedId}::${normalizedSource ?? 'community'}`
      if (seen.has(key)) return
      seen.add(key)
      attempts.push({ id: normalizedId, source: normalizedSource })
    }

    const inferredSource = meal.recipeSource?.toString().toLowerCase()
    pushAttempt(meal.recipeSlug, inferredSource)
    pushAttempt(meal.recipeIdentifier, inferredSource)

    if (meal.recipeSlug) {
      pushAttempt(meal.recipeSlug, 'community')
      pushAttempt(meal.recipeSlug, 'mealdb')
    }

    if (meal.recipeIdentifier) {
      const looksNumeric = /^\d+$/.test(meal.recipeIdentifier)
      pushAttempt(meal.recipeIdentifier, looksNumeric ? 'mealdb' : 'community')
      pushAttempt(meal.recipeIdentifier, 'mealdb')
    }

    return attempts
  }, [])

  const hasMeaningfulNutrition = (nutrition) => {
    if (!nutrition) return false
    const keys = ['calories', 'protein', 'carbs', 'fat']
    return keys.some((key) => {
      const numeric = Number(nutrition[key])
      return Number.isFinite(numeric) && numeric > 0
    })
  }

  const normalizeNutritionValue = (value) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? Math.round(numeric) : null
  }

  const isPlaceholderInstruction = (value) => {
    if (!value) return true
    if (Array.isArray(value)) {
      if (!value.length) return true
      return value.every((entry) => isPlaceholderInstruction(entry))
    }
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase()
      if (!trimmed) return true
      return trimmed.startsWith('no detailed instructions available')
    }
    return false
  }

  const mergeRecipeContent = (primary = {}, fallback = {}) => {
    const merged = { ...fallback, ...primary }

    const fallbackIngredients = Array.isArray(fallback.ingredients) ? fallback.ingredients : []
    const primaryIngredients = Array.isArray(primary.ingredients) ? primary.ingredients : []
    merged.ingredients = primaryIngredients.length ? primaryIngredients : fallbackIngredients

    if (isPlaceholderInstruction(primary.instructions) && !isPlaceholderInstruction(fallback.instructions)) {
      merged.instructions = fallback.instructions
    }

    if (!merged.image) {
      merged.image = fallback.image || null
    }

    if (!hasMeaningfulNutrition(merged.nutrition) && hasMeaningfulNutrition(fallback.nutrition)) {
      merged.nutrition = fallback.nutrition
    }

    merged.url = merged.url || fallback.url || null
    merged.source = merged.source || fallback.source || null

    return merged
  }

  const fetchMealDbDetails = useCallback(async (id) => {
    if (!id) return null
    try {
      const response = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${encodeURIComponent(id)}`)
      if (!response.ok) return null
      const payload = await response.json().catch(() => null)
      const mealData = payload?.meals?.[0]
      if (!mealData) return null

      const instructions = mealData.strInstructions
        ? mealData.strInstructions.replace(/\r\n/g, '\n').trim()
        : null

      const ingredients = []
      for (let index = 1; index <= 20; index += 1) {
        const ingredient = mealData[`strIngredient${index}`]
        const measure = mealData[`strMeasure${index}`]
        if (!ingredient || !ingredient.trim()) continue
        const clean = ingredient.trim()
        if (!clean || clean.toLowerCase() === 'null' || clean.toLowerCase() === 'undefined') continue
        ingredients.push({
          id: index,
          name: clean,
          measure: measure?.trim() || '',
          original: `${measure?.trim() || ''} ${clean}`.trim()
        })
      }

      return {
        id: mealData.idMeal,
        title: mealData.strMeal,
        description: mealData.strCategory || null,
        category: mealData.strCategory || null,
        cuisine: mealData.strArea || null,
        instructions: instructions && instructions.length ? instructions : null,
        image: mealData.strMealThumb || null,
        ingredients,
        url: mealData.strSource || null,
        source: 'mealdb'
      }
    } catch (error) {
      console.warn('Failed to fetch MealDB recipe details:', error)
      return null
    }
  }, [])

  const enrichRecipeDetails = useCallback(
    async (details, meal) => {
      const draft = details ? { ...details } : {}

      const numericId = meal?.recipeIdentifier && /^\d+$/.test(meal.recipeIdentifier)
        ? meal.recipeIdentifier
        : null

      const missingIngredients = !Array.isArray(draft.ingredients) || draft.ingredients.length === 0
      const placeholderInstructions = isPlaceholderInstruction(draft.instructions)
      const missingImage = !draft.image

      if ((missingIngredients || placeholderInstructions || missingImage) && numericId) {
        const mealDbData = await fetchMealDbDetails(numericId)
        if (mealDbData) {
          Object.assign(draft, mergeRecipeContent(draft, mealDbData))
        }
      }

      if (!hasMeaningfulNutrition(draft.nutrition) && meal?.nutrition) {
        draft.nutrition = {
          calories: normalizeNutritionValue(meal.nutrition?.calories) ?? 0,
          protein: normalizeNutritionValue(meal.nutrition?.protein) ?? 0,
          carbs: normalizeNutritionValue(meal.nutrition?.carbs) ?? 0,
          fat: normalizeNutritionValue(meal.nutrition?.fat) ?? 0
        }
      }

      if (!draft.title && meal?.name) {
        draft.title = meal.name
      }

      if (!draft.category && meal?.label) {
        draft.category = meal.label
      }

      return draft
    },
    [fetchMealDbDetails]
  )

  const handleViewRecipe = useCallback(
    async (meal) => {
      if (!meal) {
        return
      }

      setRecipeMealContext({
        name: meal.name,
        label: meal.label,
        source: meal.recipeSource ?? null
      })
      setRecipeModalError(null)
      setRecipeModalLoading(true)
      setRecipeDetails(null)
      setIsRecipeModalOpen(true)

      const attempts = resolveRecipeAttempts(meal)
      if (!attempts.length) {
        setRecipeModalLoading(false)
        setRecipeModalError('No recipe identifier is available for this meal.')
        return
      }

      let lastError = null

      for (const attempt of attempts) {
        try {
          const query = attempt.source ? `?source=${encodeURIComponent(attempt.source)}` : ''
          const response = await fetch(`/api/recipes/${encodeURIComponent(attempt.id)}${query}`, {
            cache: 'no-store'
          })

          if (!response.ok) {
            const body = await response.json().catch(() => null)
            lastError =
              body?.message ||
              body?.error ||
              `${response.status} ${response.statusText || 'Unable to fetch recipe details.'}`
            continue
          }

          const data = await response.json()
          if (!data) {
            lastError = 'Recipe details were empty.'
            continue
          }

          const enriched = await enrichRecipeDetails(data, meal)
          setRecipeDetails(enriched)
          setRecipeModalLoading(false)
          return
        } catch (fetchError) {
          lastError = fetchError.message || 'Unexpected error while fetching recipe details.'
        }
      }

      setRecipeModalLoading(false)
      const fallbackDetails = await enrichRecipeDetails(null, meal)
      if (fallbackDetails && (fallbackDetails.ingredients?.length || fallbackDetails.instructions || fallbackDetails.nutrition)) {
        setRecipeDetails(fallbackDetails)
        setRecipeModalError(lastError || 'Unable to load recipe from the source, showing available plan data.')
      } else {
        setRecipeModalError(
          lastError || 'Unable to load recipe details for this meal right now. Please try again later.'
        )
      }
    },
    [enrichRecipeDetails, resolveRecipeAttempts]
  )

  const selectedDayMeals = useMemo(() => {
    if (!selectedDay) return []
    const entries = []

    const breakfast = normalizeMeal(selectedDay.breakfast, 'breakfast', 'Breakfast')
    const lunch = normalizeMeal(selectedDay.lunch, 'lunch', 'Lunch')
    const dinner = normalizeMeal(selectedDay.dinner, 'dinner', 'Dinner')

    if (breakfast) entries.push(breakfast)
    if (lunch) entries.push(lunch)
    if (dinner) entries.push(dinner)

    if (Array.isArray(selectedDay.snacks)) {
      const seenSnackIds = new Set()
      selectedDay.snacks.forEach((snack, index) => {
        const snackEntry = normalizeMeal(snack, 'snack', `Snack ${index + 1}`)
        if (!snackEntry) {
          return
        }

        const key = snackEntry.id || `${snackEntry.type}-${snackEntry.mealId}-${snackEntry.name}`
        if (seenSnackIds.has(key)) {
          return
        }
        seenSnackIds.add(key)
        entries.push(snackEntry)
      })
    }

    return entries
  }, [selectedDay])

  const filteredMeals = useMemo(() => {
    return selectedDayMeals.filter((meal) => {
      const matchesSearch = meal.name.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesType = !selectedType || meal.type === selectedType
      return matchesSearch && matchesType
    })
  }, [selectedDayMeals, searchTerm, selectedType])

  const plannedNutrition = useMemo(() => {
    const totals = selectedDay?.totals || { calories: 0, protein: 0, carbs: 0, fat: 0 }
    const format = (value) => {
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? Math.round(parsed) : 0
    }
    return {
      calories: format(totals.calories),
      protein: format(totals.protein),
      carbs: format(totals.carbs),
      fat: format(totals.fat)
    }
  }, [selectedDay])

  const planTargets = useMemo(() => {
    if (mealPlan?.dietPlan?.targets) {
      return normalizeTargets(mealPlan.dietPlan.targets)
    }
    if (selectedDay && plannedNutrition) {
      return plannedNutrition
    }
    return null
  }, [mealPlan?.dietPlan?.targets, plannedNutrition, selectedDay])

  const loggedNutrition = useMemo(() => {
    if (!dailyLog) {
      return {
        calories: null,
        protein: null,
        carbs: null,
        fat: null
      }
    }

    const round = (value) => {
      if (value === null || value === undefined) return null
      const parsed = Number(value)
      return Number.isFinite(parsed) ? Math.round(parsed) : null
    }

    return {
      calories: round(dailyLog.caloriesConsumed),
      protein: round(dailyLog.protein),
      carbs: round(dailyLog.carbs),
      fat: round(dailyLog.fat)
    }
  }, [dailyLog])

  const shouldShowPlanTargets = Boolean(activeDietPlanId && planTargets)

  const remainingTargets = useMemo(() => {
    if (!shouldShowPlanTargets) return null
    return {
      calories: Math.max(0, planTargets.calories - (loggedNutrition.calories ?? 0)),
      protein: Math.max(0, planTargets.protein - (loggedNutrition.protein ?? 0)),
      carbs: Math.max(0, planTargets.carbs - (loggedNutrition.carbs ?? 0)),
      fat: Math.max(0, planTargets.fat - (loggedNutrition.fat ?? 0))
    }
  }, [planTargets, loggedNutrition, shouldShowPlanTargets])

  const formatTargetsSummary = (targets) => {
    if (!targets) return 'No plan targets set'
    return `${targets.calories.toLocaleString()} kcal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat`
  }

  const hydrationIntake = useMemo(() => {
    if (dailyLog?.waterMl !== null && dailyLog?.waterMl !== undefined) {
      const numeric = Number(dailyLog.waterMl)
      if (Number.isFinite(numeric)) {
        return Math.max(0, Math.round(numeric))
      }
    }

    if (hydrationTotalMl !== null && hydrationTotalMl !== undefined) {
      if (Number.isFinite(hydrationTotalMl)) {
        return Math.max(0, Math.round(hydrationTotalMl))
      }
    }

    return null
  }, [dailyLog?.waterMl, hydrationTotalMl])

  const handleOpenLogModal = () => {
    const isoDate = getSelectedIsoDate()
    if (!activeDietPlanId || !isoDate) {
      setLogSubmitError('Unable to identify the selected day for logging intake.')
      return
    }

    setLogSubmitError(null)
    setLogSuccess(null)
    setLogForm({
      weightKg: dailyLog?.weightKg?.toString() ?? '',
      caloriesConsumed: dailyLog?.caloriesConsumed?.toString() ?? '',
      caloriesBurned: dailyLog?.caloriesBurned?.toString() ?? '',
      protein: dailyLog?.protein?.toString() ?? '',
      carbs: dailyLog?.carbs?.toString() ?? '',
      fat: dailyLog?.fat?.toString() ?? '',
      waterMl: dailyLog?.waterMl?.toString() ?? '',
      workoutDurationMinutes: dailyLog?.workoutDurationMinutes?.toString() ?? '',
      notes: dailyLog?.notes ?? ''
    })
    setIsLogModalOpen(true)
  }

  const handleCloseLogModal = () => {
    setIsLogModalOpen(false)
    setIsSavingLog(false)
  }

  const handleLogInputChange = (event) => {
    const { name, value } = event.target
    setLogForm((previous) => ({ ...previous, [name]: value }))
  }

  const handleSubmitLog = async (event) => {
    event.preventDefault()
    if (!activeDietPlanId) {
      setLogSubmitError('No active FitSavory plan found to attach this log to.')
      return
    }

    const isoDate = getSelectedIsoDate()
    if (!isoDate) {
      setLogSubmitError('Unable to determine the selected day for logging intake.')
      return
    }

    const parseValue = (value) => {
      if (value === null || value === undefined || value === '') return null
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }

    setIsSavingLog(true)
    setLogSubmitError(null)

    try {
      const response = await fetch('/api/diet-plans/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: activeDietPlanId,
          logDate: isoDate,
          weightKg: parseValue(logForm.weightKg),
          caloriesConsumed: parseValue(logForm.caloriesConsumed),
          caloriesBurned: parseValue(logForm.caloriesBurned),
          protein: parseValue(logForm.protein),
          carbs: parseValue(logForm.carbs),
          fat: parseValue(logForm.fat),
          waterMl: parseValue(logForm.waterMl),
          workoutDurationMinutes: parseValue(logForm.workoutDurationMinutes),
          notes: logForm.notes?.trim() || null
        })
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body?.error || 'Failed to save intake log')
      }

      const data = await response.json()
      setDailyLog(data?.log ?? null)
      setIsLogModalOpen(false)
      setLogSuccess('Intake log saved successfully.')
      window.dispatchEvent(new Event('refreshFitSavoryDashboard'))
      window.dispatchEvent(new Event('refreshFitSavoryHydration'))
      window.dispatchEvent(new Event('refreshMealPlan'))
    } catch (submitError) {
      console.error('Failed to save intake log:', submitError)
      setLogSubmitError(submitError.message || 'Unable to save intake log right now')
    } finally {
      setIsSavingLog(false)
    }
  }

  const handleRefresh = () => {
    if (status !== 'authenticated') {
      router.push('/auth/login?callbackUrl=/fitsavory/meals')
      return
    }
    setMealPlan(null)
    setIsLoading(true)
    setError(null)
    setSelectedDayValue('')
    window.dispatchEvent(new Event('refreshMealPlan'))
  }

  const handleResetDailyLog = useCallback(async () => {
    if (!activeDietPlanId) {
      setLogSubmitError('No active FitSavory plan found to reset this log.')
      return
    }

    const isoDate = getSelectedIsoDate()
    if (!isoDate) {
      setLogSubmitError('Unable to determine which day to reset.')
      return
    }

    setIsResettingLog(true)
    setLogSubmitError(null)
    setLogSuccess(null)

    try {
      const response = await fetch('/api/diet-plans/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: activeDietPlanId,
          logDate: isoDate,
          weightKg: null,
          caloriesConsumed: 0,
          caloriesBurned: null,
          protein: 0,
          carbs: 0,
          fat: 0,
          waterMl: null,
          workoutDurationMinutes: null,
          notes: null
        })
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body?.error || 'Failed to reset intake log')
      }

      const data = await response.json()
      const logEntry = data?.log ?? data ?? null
      setDailyLog(logEntry)
      setLogSuccess('Daily intake log cleared for this day.')

      if (activeDietPlanId && typeof window !== 'undefined') {
        const key = `fitSavoryLoggedMeals:${activeDietPlanId}:${isoDate}`
        window.localStorage.setItem(key, JSON.stringify([]))
      }
      setLoggedMeals([])

      try {
        await fetch('/api/fitsavory/hydration/logs', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: isoDate })
        })
      } catch (hydrationDeleteError) {
        console.warn('Failed to remove hydration intake while resetting log:', hydrationDeleteError)
      }

      window.dispatchEvent(new Event('refreshFitSavoryHydration'))
    } catch (resetError) {
      console.error('Failed to reset intake log:', resetError)
      setLogSubmitError(resetError.message || 'Unable to reset intake log right now')
    } finally {
      setIsResettingLog(false)
    }
  }, [getSelectedIsoDate, activeDietPlanId])

  useEffect(() => {
    const handler = () => {
      if (status !== 'authenticated') return

      const controller = new AbortController()
      fetchMealPlan(controller)
      return () => controller.abort()
    }

    window.addEventListener('refreshMealPlan', handler)
    return () => window.removeEventListener('refreshMealPlan', handler)
  }, [status, fetchMealPlan])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handler = () => {
      if (!activeDietPlanId) return
      const isoDate = getSelectedIsoDate()
      if (!isoDate) return
      fetchHydrationTotal({ isoDate })
      fetchHydrationWeekly({ endDateIso: isoDate })
    }

    window.addEventListener('refreshFitSavoryHydration', handler)
    return () => window.removeEventListener('refreshFitSavoryHydration', handler)
  }, [activeDietPlanId, fetchHydrationTotal, fetchHydrationWeekly, getSelectedIsoDate])

  useEffect(() => {
    if (status !== 'authenticated') {
      if (midnightTimerRef.current) {
        clearTimeout(midnightTimerRef.current)
        midnightTimerRef.current = null
      }
      return
    }

    const scheduleRefresh = () => {
      const delay = getMsUntilNextManilaMidnight() || 24 * 60 * 60 * 1000
      if (midnightTimerRef.current) {
        clearTimeout(midnightTimerRef.current)
      }
      midnightTimerRef.current = setTimeout(() => {
        const todayIso = getManilaTodayIso()
        const todayOption = dayOptions.find((option) => (option.iso ?? formatToManilaDate(option.date)) === todayIso)
        if (todayOption) {
          setSelectedDayValue(todayOption.value)
        }
        window.dispatchEvent(new Event('refreshFitSavoryDashboard'))
        window.dispatchEvent(new Event('refreshFitSavoryHydration'))
        window.dispatchEvent(new Event('refreshMealPlan'))
        scheduleRefresh()
      }, delay)
    }

    scheduleRefresh()

    return () => {
      if (midnightTimerRef.current) {
        clearTimeout(midnightTimerRef.current)
        midnightTimerRef.current = null
      }
    }
  }, [status, dayOptions])

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-olive-600" />
        <span className="ml-2 text-sm text-gray-600">Loading your meal plan…</span>
      </div>
    )
  }

  if (status !== 'authenticated') {
    return (
      <div className="max-w-2xl mx-auto bg-white border border-soft-200 rounded-xl p-10 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 mb-3">Log in to access meal tracking</h1>
        <p className="text-sm text-gray-600">
          Meal tracking is available for authenticated users with an active FitSavory plan.
        </p>
        <button
          onClick={() => router.push('/auth/login?callbackUrl=/fitsavory/meals')}
          className="mt-6 inline-flex items-center px-5 py-2.5 rounded-lg bg-olive-600 text-white font-medium hover:bg-olive-700"
        >
          Go to Login
        </button>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto bg-rose-50 border border-rose-200 rounded-xl p-6 text-center">
        <h2 className="text-lg font-semibold text-rose-800">Unable to load meals</h2>
        <p className="text-sm text-rose-700 mt-2">{error}</p>
        <div className="mt-4">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!mealPlan?.mealPlan?.length) {
    return (
      <div className="max-w-3xl mx-auto bg-white border border-dashed border-soft-200 rounded-xl p-12 text-center dark:bg-gray-900 dark:border-gray-700">
        <Utensils className="h-14 w-14 text-olive-400 mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">No meal plan available yet</h2>
        <p className="text-sm text-gray-600 mt-2 dark:text-gray-300">
          Generate a FitSavory meal plan first to view daily meal breakdowns here.
        </p>
        <button
          onClick={() => router.push('/fitsavory')}
          className="mt-6 inline-flex items-center px-5 py-2.5 rounded-lg bg-olive-600 text-white font-medium hover:bg-olive-700"
        >
          Go to FitSavory Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Meal Tracking</h1>
          <p className="text-gray-600 mt-1 dark:text-gray-300">
            Review meals generated for your FitSavory plan. Manual logging is coming soon.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-gray-600 dark:text-gray-300" htmlFor="day-select">
            Viewing plan day
          </label>
          <select
            id="day-select"
            value={selectedDayValue}
            onChange={(event) => setSelectedDayValue(event.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {dayOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-soft-200 hover:border-olive-400 hover:text-olive-700 dark:border-gray-700 dark:text-gray-200 dark:hover:text-olive-200"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {logSubmitError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-300/30 dark:bg-rose-900/20 dark:text-rose-200">
          {logSubmitError}
        </div>
      ) : null}

      {logSuccess ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-300/30 dark:bg-emerald-900/20 dark:text-emerald-200">
          {logSuccess}
        </div>
      ) : null}

      <div className="bg-white p-6 rounded-xl shadow-sm border dark:bg-gray-900 dark:border-gray-800">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Daily intake log</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {selectedDayDisplayLabel}
              {shouldShowPlanTargets ? ` · Plan target: ${formatTargetsSummary(planTargets)}` : null}
            </p>
          </div>

          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <span>{isLogLoading ? 'Loading intake data…' : dailyLog ? 'Intake logged' : 'No intake logged yet'}</span>
            <button
              type="button"
              onClick={handleResetDailyLog}
              disabled={isResettingLog || (!dailyLog && loggedMeals.length === 0)}
              className="inline-flex items-center gap-2 rounded-lg border border-soft-200 px-3 py-1.5 text-xs font-fredoka text-gray-700 transition-colors hover:border-rose-400 hover:text-rose-600 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:border-rose-400 dark:hover:text-rose-300"
            >
              {isResettingLog ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Resetting…
                </>
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset log
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleOpenLogModal}
              className="inline-flex items-center gap-2 rounded-lg border border-soft-200 px-3 py-1.5 text-xs font-fredoka text-gray-700 hover:border-olive-400 hover:text-olive-600 dark:border-gray-700 dark:text-gray-200"
              disabled={!mealPlan?.planId || isLogLoading}
            >
              <PencilLine className="h-3.5 w-3.5" />
              Manual log
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-soft-50 border border-soft-200 rounded-lg p-4 dark:bg-gray-800/60 dark:border-gray-700">
            <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Calories</p>
            <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {loggedNutrition.calories !== null ? `${loggedNutrition.calories.toLocaleString()} kcal` : '—'}
            </p>
          </div>
          <div className="bg-soft-50 border border-soft-200 rounded-lg p-4 dark:bg-gray-800/60 dark:border-gray-700">
            <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Protein</p>
            <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {loggedNutrition.protein !== null ? `${loggedNutrition.protein} g` : '—'}
            </p>
          </div>
          <div className="bg-soft-50 border border-soft-200 rounded-lg p-4 dark:bg-gray-800/60 dark:border-gray-700">
            <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Carbs</p>
            <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {loggedNutrition.carbs !== null ? `${loggedNutrition.carbs} g` : '—'}
            </p>
          </div>
          <div className="bg-soft-50 border border-soft-200 rounded-lg p-4 dark:bg-gray-800/60 dark:border-gray-700">
            <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Fat</p>
            <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {loggedNutrition.fat !== null ? `${loggedNutrition.fat} g` : '—'}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-1 gap-4 text-sm text-gray-600 dark:text-gray-300">
          <div>
            <span className="block text-gray-500 text-xs uppercase dark:text-gray-400">Water</span>
            <span className="font-medium dark:text-gray-100">
              {hydrationIntake !== null ? `${hydrationIntake.toLocaleString()} ml` : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Plan Day Calories',
            value: shouldShowPlanTargets ? `${planTargets.calories.toLocaleString()} kcal` : '—',
            logged:
              loggedNutrition.calories !== null
                ? `Logged: ${loggedNutrition.calories.toLocaleString()} kcal`
                : 'No intake logged',
            remaining:
              remainingTargets?.calories !== undefined
                ? `Remaining: ${remainingTargets.calories.toLocaleString()} kcal`
                : null,
            icon: <Utensils className="h-8 w-8 text-orange-500" />
          },
          {
            label: 'Protein',
            value: shouldShowPlanTargets ? `${planTargets.protein} g` : '—',
            logged:
              loggedNutrition.protein !== null
                ? `Logged: ${loggedNutrition.protein} g`
                : 'No intake logged',
            remaining:
              remainingTargets?.protein !== undefined
                ? `Remaining: ${remainingTargets.protein} g`
                : null,
            icon: (
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-bold">P</span>
              </div>
            )
          },
          {
            label: 'Carbs',
            value: shouldShowPlanTargets ? `${planTargets.carbs} g` : '—',
            logged:
              loggedNutrition.carbs !== null
                ? `Logged: ${loggedNutrition.carbs} g`
                : 'No intake logged',
            remaining:
              remainingTargets?.carbs !== undefined
                ? `Remaining: ${remainingTargets.carbs} g`
                : null,
            icon: (
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <span className="text-green-600 font-bold">C</span>
              </div>
            )
          },
          {
            label: 'Fat',
            value: shouldShowPlanTargets ? `${planTargets.fat} g` : '—',
            logged:
              loggedNutrition.fat !== null
                ? `Logged: ${loggedNutrition.fat} g`
                : 'No intake logged',
            remaining:
              remainingTargets?.fat !== undefined
                ? `Remaining: ${remainingTargets.fat} g`
                : null,
            icon: (
              <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                <span className="text-yellow-600 font-bold">F</span>
              </div>
            )
          }
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white p-4 rounded-lg shadow-sm border dark:bg-gray-900 dark:border-gray-800"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{card.value}</p>
                <p className={`text-xs mt-1 ${card.logged.startsWith('Logged') ? 'text-olive-700 dark:text-olive-300' : 'text-gray-400 dark:text-gray-500'}`}>
                  {card.logged}
                </p>
                {card.remaining ? (
                  <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">{card.remaining}</p>
                ) : null}
              </div>
              {card.icon}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border dark:bg-gray-900 dark:border-gray-800">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1 w-full">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Search meals..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <select
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
              className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">All Meal Types</option>
              {mealTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            <select
              value={selectedDayValue}
              onChange={(event) => setSelectedDayValue(event.target.value)}
              className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              {dayOptions.map((option) => (
                <option key={`filter-${option.value}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border dark:bg-gray-900 dark:border-gray-800">
        <div className="p-6 border-b dark:border-gray-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Plan Meals</h2>
          <p className="text-gray-600 mt-1 dark:text-gray-300">{filteredMeals.length} meals in this day</p>
        </div>

        <div className="divide-y">
          {filteredMeals.map((meal, index) => {
            const mealType = mealTypes.find((type) => type.id === meal.type)
            const quickLogEnabled = canQuickLogMeal(meal)
            const isQuickLogging = quickLoggingMealId === meal.id
            const isLogged = loggedMeals.includes(meal.id)
            const mealKey = meal.id
              ? `${meal.id}-${index}`
              : `${meal.type}-${meal.mealId}-${meal.name}-${index}`
            return (
              <div key={mealKey} className="p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:gap-4 gap-3">
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${mealType?.color}`}>
                      <span className="mr-2">{mealType?.icon}</span>
                      {mealType?.name}
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 break-words">{meal.name}</h3>
                      <p className="text-sm text-gray-500 flex items-center dark:text-gray-400">
                        <Clock className="h-4 w-4 mr-1 shrink-0" />
                        {meal.label}
                      </p>
                      {meal.source ? <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">Source: {meal.source}</p> : null}
                      {isLogged ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-olive-100 px-2 py-0.5 text-xs font-medium text-olive-700 dark:bg-olive-900/40 dark:text-olive-200">
                          <CheckCircle className="h-3 w-3" /> Logged
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-5 lg:items-center lg:justify-end">
                    <div className="text-left sm:text-right">
                      <p className="font-semibold dark:text-gray-100">{meal.nutrition.calories ?? '—'} cal</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        P: {meal.nutrition.protein ?? '—'}g | C: {meal.nutrition.carbs ?? '—'}g | F: {meal.nutrition.fat ?? '—'}g
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => handleQuickLog(meal)}
                        disabled={!quickLogEnabled || isQuickLogging}
                        className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                          !quickLogEnabled || isQuickLogging
                            ? 'bg-soft-200 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                          : isLogged
                            ? 'border border-olive-200 bg-olive-50 text-olive-700 hover:border-olive-300 hover:bg-olive-100 dark:border-olive-500/40 dark:bg-olive-900/30 dark:text-olive-200'
                            : 'bg-olive-600 text-white hover:bg-olive-700'
                        }`}
                        title={!quickLogEnabled ? 'Meal needs macros to quick log' : isLogged ? 'Logged (click to add again)' : undefined}
                      >
                        {isQuickLogging ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Logging…
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4" />
                            {isLogged ? 'Log again' : 'Quick log'}
                          </>
                        )}
                      </button>
                      {meal.recipeSlug || meal.recipeIdentifier ? (
                        <button
                          type="button"
                          onClick={() => handleViewRecipe(meal)}
                          className="inline-flex items-center gap-2 rounded-lg border border-soft-200 px-3 py-2 text-sm font-fredoka text-olive-700 transition-colors hover:border-olive-400 hover:bg-olive-50 dark:border-gray-700 dark:text-olive-200 dark:hover:border-olive-400 dark:hover:bg-gray-800"
                        >
                          <ChefHat className="h-4 w-4" />
                          View recipe
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">No recipe link</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {filteredMeals.length === 0 && (
          <div className="p-12 text-center">
            <Utensils className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-600 mb-2 dark:text-gray-300">No meals for this day</h3>
            <p className="text-gray-500 dark:text-gray-400">
              {searchTerm || selectedType
                ? 'Try adjusting your filters to explore other meals in this plan day.'
                : 'Generate a FitSavory meal plan to populate meals automatically.'}
            </p>
          </div>
        )}
      </div>

      <Dialog
        open={isRecipeModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsRecipeModalOpen(false)
            setRecipeModalLoading(false)
            setRecipeModalError(null)
            setRecipeDetails(null)
            setRecipeMealContext(null)
          } else {
            setIsRecipeModalOpen(true)
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {recipeMealContext?.name ?? 'Recipe preview'}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600 dark:text-gray-300">
              Preview ingredients, instructions, and macros for this planned meal.
            </DialogDescription>
          </DialogHeader>

          {recipeModalLoading ? (
            <div className="flex min-h-[160px] items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-300">
              <Loader2 className="h-5 w-5 animate-spin text-olive-600" />
              Loading recipe…
            </div>
          ) : recipeModalError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-300/30 dark:bg-rose-900/20 dark:text-rose-200">
              {recipeModalError}
            </div>
          ) : recipeDetails ? (
            <div className="space-y-6">
              {recipeDetails.image ? (
                <img
                  src={recipeDetails.image}
                  alt={recipeDetails.title || recipeMealContext?.name || 'Recipe image'}
                  className="h-48 w-full rounded-xl object-cover opacity-100"
                />
              ) : null}

              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Nutrition snapshot</h3>
                {recipeDetails.nutrition ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm font-fredoka">
                    <div className="rounded-lg border border-soft-200 bg-soft-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800/60">
                      <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Calories</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {Math.round(recipeDetails.nutrition.calories ?? 0)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-soft-200 bg-soft-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800/60">
                      <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Protein</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {Math.round(recipeDetails.nutrition.protein ?? 0)} g
                      </p>
                    </div>
                    <div className="rounded-lg border border-soft-200 bg-soft-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800/60">
                      <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Carbs</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {Math.round(recipeDetails.nutrition.carbs ?? 0)} g
                      </p>
                    </div>
                    <div className="rounded-lg border border-soft-200 bg-soft-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800/60">
                      <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Fat</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {Math.round(recipeDetails.nutrition.fat ?? 0)} g
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-300">Nutrition data is not available for this recipe.</p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Ingredients</h3>
                {recipeDetails.ingredients?.length ? (
                  <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-200">
                    {recipeDetails.ingredients.map((ingredient, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <ChefHat className="mt-0.5 h-4 w-4 text-olive-500" />
                        <span>
                          {typeof ingredient === 'string'
                            ? ingredient
                            : ingredient.original || `${ingredient.name ?? ''} ${ingredient.measure ?? ''}`.trim()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-300">Ingredient details are not available for this recipe.</p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Instructions</h3>
                {recipeDetails.instructions ? (
                  <div className="rounded-lg border border-soft-200 bg-white px-4 py-3 text-sm leading-relaxed text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                    {Array.isArray(recipeDetails.instructions)
                      ? recipeDetails.instructions.map((step, index) => (
                          <p key={index} className="mb-2">
                            <span className="font-semibold text-olive-600 dark:text-olive-300 mr-2">{index + 1}.</span>
                            {step}
                          </p>
                        ))
                      : recipeDetails.instructions
                          .split(/\n+/)
                          .filter(Boolean)
                          .map((step, index) => (
                            <p key={index} className="mb-2">
                              <span className="font-semibold text-olive-600 dark:text-olive-300 mr-2">{index + 1}.</span>
                              {step}
                            </p>
                          ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-300">Cooking instructions are not provided for this recipe.</p>
                )}
              </div>

              {recipeDetails.url ? (
                <a
                  href={recipeDetails.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-olive-600 px-4 py-2 text-sm font-fredoka font-medium text-white transition-colors hover:bg-olive-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  View full recipe
                </a>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-300">Select a meal to preview its recipe details.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isLogModalOpen} onOpenChange={(open) => (open ? handleOpenLogModal() : handleCloseLogModal())}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-olive-100 text-olive-700">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold text-gray-900">Log daily intake</DialogTitle>
                <DialogDescription className="text-sm text-gray-500">
                  Record what you actually consumed for {selectedDayDisplayLabel}.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmitLog} className="mt-4 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700" htmlFor="log-calories-burned">
                  Calories burned
                </label>
                <input
                  id="log-weight"
                  name="weightKg"
                  type="number"
                  step="1"
                  min="0"
                  value={logForm.weightKg}
                  onChange={handleLogInputChange}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-olive-500 focus:outline-none focus:ring-2 focus:ring-olive-500"
                  placeholder="e.g. 45"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="log-notes">
                Notes
              </label>
              <textarea
                id="log-notes"
                name="notes"
                value={logForm.notes}
                onChange={handleLogInputChange}
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-olive-500 focus:outline-none focus:ring-2.focus:ring-olive-500"
                placeholder="Anything notable about today’s intake or activity..."
              ></textarea>
            </div>

            <DialogFooter className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-gray-500">
                Logging for {selectedDayDisplayLabel} ({getSelectedIsoDate() ?? '—'}).
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <DialogClose
                  type="button"
                  onClick={handleCloseLogModal}
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </DialogClose>
                <button
                  type="submit"
                  disabled={isSavingLog}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-olive-600 px-4 py-2 text-sm font-medium text-white hover:bg-olive-700 disabled:opacity-60"
                >
                  {isSavingLog ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    'Save log'
                  )}
                </button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
