import { useMemo, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles
} from 'lucide-react'

const DEFAULT_FORM_STATE = {
  name: '',
  description: '',
  goal: 'weight_loss',
  planType: 'standard',
  startDate: '',
  endDate: '',
  dailyCalories: '',
  protein: '',
  carbs: '',
  fat: '',
  targetWeightKg: '',
  notes: ''
}

const FORM_STEPS = [
  { key: 'basics', title: 'Plan basics', description: 'Name your plan and choose an overall goal.' },
  { key: 'targets', title: 'Targets', description: 'Set calories, macros, and body targets.' },
  { key: 'schedule', title: 'Schedule & notes', description: 'Pick dates and add reminders.' }
]

const PRESETS = [
  {
    key: 'lean_cut',
    label: 'Lean cut · 1,850 kcal',
    goal: 'weight_loss',
    planType: 'standard',
    dailyCalories: 1850,
    macros: { protein: 150, carbs: 180, fat: 60 }
  },
  {
    key: 'muscle_gain',
    label: 'Muscle gain · 2,600 kcal',
    goal: 'build_muscle',
    planType: 'mediterranean',
    dailyCalories: 2600,
    macros: { protein: 180, carbs: 280, fat: 85 }
  },
  {
    key: 'maintenance',
    label: 'Maintenance · 2,200 kcal',
    goal: 'maintain_weight',
    planType: 'standard',
    dailyCalories: 2200,
    macros: { protein: 140, carbs: 240, fat: 75 }
  }
]

const helper = {
  name: 'Give your plan a descriptive title so it stands out.',
  goal: 'The goal tailors analytics and dashboard insights.',
  planType: 'Pick the style closest to the meals you plan to follow.',
  description: 'Optional. Capture focus meals, coach guidance, or reminders.',
  dailyCalories: 'Set a positive number of calories you aim to eat each day.',
  macros: 'Macros are optional—leave blank if calories are enough.',
  targetWeightKg: 'Optional. Helps show progress toward a target body weight.',
  startDate: 'Select the day you want to begin this plan.',
  endDate: 'Optional end date. Must be on or after the start date.',
  notes: 'Leave yourself reminders, recipes, or check-ins.'
}

export default function PlanFormModal({ open, onClose, onSubmit, goalOptions, planTypes }) {
  const [formState, setFormState] = useState(DEFAULT_FORM_STATE)
  const [stepIndex, setStepIndex] = useState(0)
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitError, setSubmitError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const presets = useMemo(() => PRESETS, [])

  if (!open) {
    return null
  }

  const updateField = (name, value) => {
    setFormState((prev) => ({ ...prev, [name]: value }))
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    updateField(name, value)
  }

  const applyPreset = (preset) => {
    updateField('goal', preset.goal)
    updateField('planType', preset.planType)
    updateField('dailyCalories', String(preset.dailyCalories))
    updateField('protein', String(preset.macros.protein))
    updateField('carbs', String(preset.macros.carbs))
    updateField('fat', String(preset.macros.fat))
  }

  const validateStep = (stepKey) => {
    const errors = {}
    if (stepKey === 'basics') {
      if (!formState.name.trim()) {
        errors.name = 'Plan name is required.'
      }
      if (!formState.goal) {
        errors.goal = 'Choose a goal to continue.'
      }
    }
    if (stepKey === 'targets') {
      if (!formState.dailyCalories || Number(formState.dailyCalories) <= 0) {
        errors.dailyCalories = 'Daily calories must be greater than zero.'
      }
      if (formState.protein && Number(formState.protein) < 0) {
        errors.protein = 'Protein cannot be negative.'
      }
      if (formState.carbs && Number(formState.carbs) < 0) {
        errors.carbs = 'Carbs cannot be negative.'
      }
      if (formState.fat && Number(formState.fat) < 0) {
        errors.fat = 'Fat cannot be negative.'
      }
      if (formState.targetWeightKg && Number(formState.targetWeightKg) <= 0) {
        errors.targetWeightKg = 'Target weight must be positive.'
      }
    }
    if (stepKey === 'schedule') {
      if (!formState.startDate) {
        errors.startDate = 'Start date is required.'
      }
      if (formState.endDate) {
        const start = new Date(formState.startDate)
        const end = new Date(formState.endDate)
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          errors.endDate = 'Provide valid calendar dates.'
        } else if (end < start) {
          errors.endDate = 'End date cannot be before the start date.'
        }
      }
    }
    return errors
  }

  const attemptStepAdvance = () => {
    const stepErrors = validateStep(FORM_STEPS[stepIndex].key)
    if (Object.keys(stepErrors).length) {
      setFieldErrors((prev) => ({ ...prev, ...stepErrors }))
      return false
    }
    return true
  }

  const goToStep = (nextIndex) => {
    setStepIndex(nextIndex)
  }

  const handleNext = () => {
    if (!attemptStepAdvance()) {
      return
    }
    goToStep(Math.min(stepIndex + 1, FORM_STEPS.length - 1))
  }

  const handleBack = () => {
    goToStep(Math.max(stepIndex - 1, 0))
  }

  const buildPayload = () => ({
    name: formState.name.trim(),
    description: formState.description.trim() || null,
    goal: formState.goal,
    planType: formState.planType,
    startDate: formState.startDate,
    endDate: formState.endDate ? formState.endDate : null,
    dailyCalories: formState.dailyCalories ? Number.parseInt(formState.dailyCalories, 10) : null,
    targetWeightKg: formState.targetWeightKg ? Number.parseFloat(formState.targetWeightKg) : null,
    notes: formState.notes.trim() || null,
    macros: {
      protein: formState.protein ? Number.parseFloat(formState.protein) : null,
      carbs: formState.carbs ? Number.parseFloat(formState.carbs) : null,
      fat: formState.fat ? Number.parseFloat(formState.fat) : null
    }
  })

  const handleSubmit = async (event) => {
    event.preventDefault()
    const mergedErrors = FORM_STEPS.reduce((acc, step) => {
      const stepErrors = validateStep(step.key)
      if (Object.keys(stepErrors).length) {
        acc = { ...acc, ...stepErrors }
      }
      return acc
    }, {})

    if (Object.keys(mergedErrors).length) {
      setFieldErrors(mergedErrors)
      const firstInvalid = FORM_STEPS.findIndex((step) => Object.keys(validateStep(step.key)).length)
      if (firstInvalid >= 0) {
        goToStep(firstInvalid)
      }
      return
    }

    try {
      setIsSubmitting(true)
      setSubmitError(null)
      const payload = buildPayload()
      await onSubmit(payload)
      setFormState(DEFAULT_FORM_STATE)
      setFieldErrors({})
      setStepIndex(0)
      onClose()
    } catch (error) {
      setSubmitError(error?.message || 'Unable to create diet plan right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderStep = () => {
    if (FORM_STEPS[stepIndex].key === 'basics') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300" htmlFor="plan-name">
              Plan name
            </label>
            <input
              id="plan-name"
              name="name"
              type="text"
              value={formState.name}
              onChange={handleChange}
              placeholder="e.g. Spring Lean Cut"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 ${
                fieldErrors.name ? 'border-rose-400 focus:ring-rose-400' : 'border-gray-300'
              }`}
              required
            />
            <p className={`mt-1 text-xs ${fieldErrors.name ? 'text-rose-500' : 'text-gray-500 dark:text-gray-400'}`}>
              {fieldErrors.name || helper.name}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300" htmlFor="plan-goal">
              Goal
            </label>
            <select
              id="plan-goal"
              name="goal"
              value={formState.goal}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 ${
                fieldErrors.goal ? 'border-rose-400 focus:ring-rose-400' : 'border-gray-300'
              }`}
            >
              {goalOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className={`mt-1 text-xs ${fieldErrors.goal ? 'text-rose-500' : 'text-gray-500 dark:text-gray-400'}`}>
              {fieldErrors.goal || helper.goal}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300" htmlFor="plan-type">
              Plan type
            </label>
            <select
              id="plan-type"
              name="planType"
              value={formState.planType}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              {planTypes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helper.planType}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300" htmlFor="plan-description">
              Description (optional)
            </label>
            <textarea
              id="plan-description"
              name="description"
              rows={4}
              value={formState.description}
              onChange={handleChange}
              placeholder="Describe the focus of this plan and any key guidelines."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helper.description}</p>
          </div>
        </div>
      )
    }

    if (FORM_STEPS[stepIndex].key === 'targets') {
      return (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-olive-200 bg-olive-50 text-xs font-medium text-olive-700 hover:bg-olive-100 dark:border-olive-300/40 dark:bg-olive-900/20 dark:text-olive-100"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300" htmlFor="plan-calories">
                Daily calories
              </label>
              <input
                id="plan-calories"
                name="dailyCalories"
                type="number"
                min={0}
                value={formState.dailyCalories}
                onChange={handleChange}
                placeholder="2000"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 ${
                  fieldErrors.dailyCalories ? 'border-rose-400 focus:ring-rose-400' : 'border-gray-300'
                }`}
                required
              />
              <p className={`mt-1 text-xs ${fieldErrors.dailyCalories ? 'text-rose-500' : 'text-gray-500 dark:text-gray-400'}`}>
                {fieldErrors.dailyCalories || helper.dailyCalories}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300" htmlFor="plan-targetWeight">
                Target weight (kg, optional)
              </label>
              <input
                id="plan-targetWeight"
                name="targetWeightKg"
                type="number"
                min={0}
                step="0.1"
                value={formState.targetWeightKg}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 ${
                  fieldErrors.targetWeightKg ? 'border-rose-400 focus:ring-rose-400' : 'border-gray-300'
                }`}
              />
              <p className={`mt-1 text-xs ${fieldErrors.targetWeightKg ? 'text-rose-500' : 'text-gray-500 dark:text-gray-400'}`}>
                {fieldErrors.targetWeightKg || helper.targetWeightKg}
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">Daily macro targets (optional)</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['protein', 'carbs', 'fat'].map((macro) => (
                <div key={macro}>
                  <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">{macro[0].toUpperCase() + macro.slice(1)} (g)</label>
                  <input
                    name={macro}
                    type="number"
                    min={0}
                    step="0.1"
                    value={formState[macro]}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 ${
                      fieldErrors[macro] ? 'border-rose-400 focus:ring-rose-400' : 'border-gray-300'
                    }`}
                  />
                  <p className={`mt-1 text-xs ${fieldErrors[macro] ? 'text-rose-500' : 'text-gray-500 dark:text-gray-400'}`}>
                    {fieldErrors[macro] || helper.macros}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300" htmlFor="plan-startDate">
            Start date
          </label>
          <input
            id="plan-startDate"
            name="startDate"
            type="date"
            value={formState.startDate}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 ${
              fieldErrors.startDate ? 'border-rose-400 focus:ring-rose-400' : 'border-gray-300'
            }`}
            required
          />
          <p className={`mt-1 text-xs ${fieldErrors.startDate ? 'text-rose-500' : 'text-gray-500 dark:text-gray-400'}`}>
            {fieldErrors.startDate || helper.startDate}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300" htmlFor="plan-endDate">
            End date (optional)
          </label>
          <input
            id="plan-endDate"
            name="endDate"
            type="date"
            value={formState.endDate}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 ${
              fieldErrors.endDate ? 'border-rose-400 focus:ring-rose-400' : 'border-gray-300'
            }`}
          />
          <p className={`mt-1 text-xs ${fieldErrors.endDate ? 'text-rose-500' : 'text-gray-500 dark:text-gray-400'}`}>
            {fieldErrors.endDate || helper.endDate}
          </p>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300" htmlFor="plan-notes">
            Notes (optional)
          </label>
          <textarea
            id="plan-notes"
            name="notes"
            rows={3}
            value={formState.notes}
            onChange={handleChange}
            placeholder="Add reminders, check-ins, or linked workouts."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helper.notes}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 dark:bg-gray-950 dark:text-gray-100">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Create a new diet plan</h2>
            <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">{FORM_STEPS[stepIndex].description}</p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          {FORM_STEPS.map((step, index) => {
            const isActive = index === stepIndex
            const isCompleted = index < stepIndex
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => goToStep(index)}
                className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                  isActive
                    ? 'border-olive-500 bg-olive-50 text-olive-700 dark:border-olive-400/80 dark:bg-olive-900/20 dark:text-olive-100'
                    : isCompleted
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-300/40 dark:bg-emerald-900/20 dark:text-emerald-200'
                      : 'border-soft-200 bg-soft-100 text-gray-500 hover:border-olive-300 hover:text-olive-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className={`h-5 w-5 inline-flex items-center justify-center rounded-full border ${
                    isCompleted
                      ? 'border-transparent bg-emerald-500 text-white'
                      : isActive
                        ? 'border-olive-500 text-olive-600'
                        : 'border-current text-inherit'
                  }`}>
                    {isCompleted ? <Check className="h-3 w-3" /> : index + 1}
                  </span>
                  {step.title}
                </div>
              </button>
            )
          })}
        </div>

        {submitError ? (
          <div className="mt-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm dark:bg-rose-900/20 dark:border-rose-300/30 dark:text-rose-200">
            {submitError}
          </div>
        ) : null}

        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          {renderStep()}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>Step {stepIndex + 1} of {FORM_STEPS.length}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBack}
                disabled={stepIndex === 0 || isSubmitting}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-soft-200 text-sm text-gray-600 hover:border-olive-300 hover:text-olive-600 disabled:opacity-60 dark:border-gray-800 dark:text-gray-300"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              {stepIndex < FORM_STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-olive-600 text-white text-sm font-medium hover:bg-olive-700 disabled:opacity-60"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-olive-600 text-white font-semibold hover:bg-olive-700 disabled:opacity-60"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create plan'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
