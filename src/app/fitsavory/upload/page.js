'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload,
  Save,
  X,
  Plus,
  Trash2,
  Camera,
  FileText,
  Calculator
} from 'lucide-react'

export default function UploadRecipe() {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    cuisine: '',
    prepTime: '',
    cookTime: '',
    servings: '',
    difficulty: 'medium',
    ingredients: [{ name: '', amount: '', unit: '' }],
    instructions: [{ step: 1, instruction: '' }],
    nutrition: {
      calories: '',
      protein: '',
      carbs: '',
      fat: '',
      fiber: '',
      sugar: ''
    },
    tags: [],
    image: null
  })
  const [currentStep, setCurrentStep] = useState(1)
  const [isCalculatingNutrition, setIsCalculatingNutrition] = useState(false)
  const [calculationError, setCalculationError] = useState(null)
  const [calculationResults, setCalculationResults] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState(null)

  const router = useRouter()

  const steps = [
    { id: 1, name: 'Basic Info', icon: FileText },
    { id: 2, name: 'Ingredients', icon: Plus },
    { id: 3, name: 'Instructions', icon: FileText },
    { id: 4, name: 'Nutrition', icon: Calculator },
    { id: 5, name: 'Review', icon: Upload }
  ]

  const categories = [
    'Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert', 'Beverage', 'Appetizer', 'Main Course', 'Side Dish'
  ]

  const cuisines = [
    'American', 'Italian', 'Mexican', 'Chinese', 'Japanese', 'Thai', 'Indian', 'French', 'Mediterranean', 'Other'
  ]

  const difficulties = [
    { value: 'easy', label: 'Easy', description: '30 mins or less' },
    { value: 'medium', label: 'Medium', description: '30-60 mins' },
    { value: 'hard', label: 'Hard', description: '60+ mins' }
  ]

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleIngredientChange = (index, field, value) => {
    const updatedIngredients = [...formData.ingredients]
    updatedIngredients[index] = {
      ...updatedIngredients[index],
      [field]: value
    }
    setFormData(prev => ({
      ...prev,
      ingredients: updatedIngredients
    }))
  }

  const addIngredient = () => {
    setFormData(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, { name: '', amount: '', unit: '' }]
    }))
  }

  const removeIngredient = (index) => {
    if (formData.ingredients.length > 1) {
      setFormData(prev => ({
        ...prev,
        ingredients: prev.ingredients.filter((_, i) => i !== index)
      }))
    }
  }

  const handleInstructionChange = (index, value) => {
    const updatedInstructions = [...formData.instructions]
    updatedInstructions[index] = {
      step: index + 1,
      instruction: value
    }
    setFormData(prev => ({
      ...prev,
      instructions: updatedInstructions
    }))
  }

  const addInstruction = () => {
    setFormData(prev => ({
      ...prev,
      instructions: [...prev.instructions, { step: prev.instructions.length + 1, instruction: '' }]
    }))
  }

  const removeInstruction = (index) => {
    if (formData.instructions.length > 1) {
      setFormData(prev => ({
        ...prev,
        instructions: prev.instructions.filter((_, i) => i !== index).map((inst, i) => ({
          ...inst,
          step: i + 1
        }))
      }))
    }
  }

  const handleNutritionChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      nutrition: {
        ...prev.nutrition,
        [field]: value
      }
    }))
  }

  const servingsCount = useMemo(() => {
    const parsed = Number.parseFloat(formData.servings)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
  }, [formData.servings])

  const buildCalorieNinjasQuery = () => {
    const parts = formData.ingredients
      .map((ingredient) => {
        const name = ingredient?.name?.trim()
        if (!name) return null

        const amount = ingredient?.amount?.toString().trim()
        const unit = ingredient?.unit?.toString().trim()

        if (amount && unit) {
          return `${amount} ${unit} ${name}`
        }
        if (amount) {
          return `${amount} ${name}`
        }
        return name
      })
      .filter(Boolean)

    return parts.join('\n')
  }

  const handleAutoCalculateNutrition = async () => {
    const query = buildCalorieNinjasQuery()

    if (!query) {
      setCalculationError('Add at least one ingredient with a name before auto-calculating nutrition.')
      return
    }

    setIsCalculatingNutrition(true)
    setCalculationError(null)

    try {
      const response = await fetch(`/api/nutrition/calorieninjas?query=${encodeURIComponent(query)}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to calculate nutrition automatically.')
      }

      const data = await response.json()
      const items = Array.isArray(data.items) ? data.items : data

      if (!Array.isArray(items) || !items.length) {
        throw new Error('No nutrition data returned for these ingredients.')
      }

      const totals = items.reduce(
        (acc, item) => {
          acc.calories += item.calories ?? 0
          acc.protein += item.protein_g ?? 0
          acc.carbs += item.carbohydrates_total_g ?? 0
          acc.fat += item.fat_total_g ?? 0
          acc.fiber += item.fiber_g ?? 0
          acc.sugar += item.sugar_g ?? 0
          return acc
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }
      )

      const perServing = {
        calories: Math.round(totals.calories / servingsCount),
        protein: Number((totals.protein / servingsCount).toFixed(1)),
        carbs: Number((totals.carbs / servingsCount).toFixed(1)),
        fat: Number((totals.fat / servingsCount).toFixed(1)),
        fiber: Number((totals.fiber / servingsCount).toFixed(1)),
        sugar: Number((totals.sugar / servingsCount).toFixed(1))
      }

      setFormData((prev) => ({
        ...prev,
        nutrition: {
          calories: perServing.calories.toString(),
          protein: perServing.protein.toString(),
          carbs: perServing.carbs.toString(),
          fat: perServing.fat.toString(),
          fiber: perServing.fiber.toString(),
          sugar: perServing.sugar.toString()
        }
      }))

      setCalculationResults({
        query,
        servings: servingsCount,
        totals,
        perServing,
        items
      })
    } catch (error) {
      console.error('CalorieNinjas calculation failed:', error)
      setCalculationError(error.message || 'Unable to calculate nutrition automatically.')
      setCalculationResults(null)
    } finally {
      setIsCalculatingNutrition(false)
    }
  }

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview)
      }
    }
  }, [imagePreview])

  const handleImageUpload = (event) => {
    const file = event.target.files[0]
    if (file) {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview)
      }

      const previewUrl = URL.createObjectURL(file)

      setFormData(prev => ({
        ...prev,
        image: file
      }))

      setImageLoaded(false)
      setImagePreview(previewUrl)
    }
  }

  const handleRemoveImage = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview)
    }

    setImagePreview(null)
    setImageLoaded(false)
    setFormData(prev => ({
      ...prev,
      image: null
    }))
  }

  const handleSubmit = async () => {
    if (isSubmitting) return

    setSubmissionError(null)

    const trimmedTitle = formData.title?.trim() || ''
    const trimmedDescription = formData.description?.trim() || ''

    if (!trimmedTitle || !trimmedDescription || !formData.category || !formData.cuisine) {
      setSubmissionError('Complete the required fields in Basic Info before saving.')
      setCurrentStep(1)
      return
    }

    const ingredientPayload = formData.ingredients
      .map((ingredient) => ({
        name: ingredient.name?.trim() || '',
        amount: ingredient.amount?.toString().trim() || '',
        unit: ingredient.unit?.toString().trim() || ''
      }))
      .filter((ingredient) => ingredient.name)

    if (!ingredientPayload.length) {
      setSubmissionError('Add at least one ingredient with a name before saving.')
      setCurrentStep(2)
      return
    }

    if (!formData.nutrition.calories || !formData.nutrition.protein) {
      setSubmissionError('Provide calories and protein information before saving.')
      setCurrentStep(4)
      return
    }

    const instructionPayload = formData.instructions
      .map((instruction) => instruction.instruction?.trim())
      .filter(Boolean)

    if (!instructionPayload.length) {
      setSubmissionError('Add at least one instruction before saving.')
      setCurrentStep(3)
      return
    }

    const instructionsText = instructionPayload.join('\n')
    const tagsPayload = Array.isArray(formData.tags)
      ? formData.tags.map((tag) => tag?.toString().trim()).filter(Boolean)
      : []

    const nutritionPayload = {
      calories: formData.nutrition.calories ?? null,
      protein: formData.nutrition.protein ?? null,
      carbs: formData.nutrition.carbs ?? null,
      fat: formData.nutrition.fat ?? null,
      fiber: formData.nutrition.fiber ?? null,
      sugar: formData.nutrition.sugar ?? null,
      isAutoCalculated: Boolean(calculationResults)
    }

    const payload = new FormData()
    payload.append('title', trimmedTitle)
    payload.append('description', trimmedDescription)
    payload.append('difficulty', formData.difficulty || 'medium')

    if (formData.category) {
      payload.append('category', formData.category)
    }

    if (formData.cuisine) {
      payload.append('cuisine', formData.cuisine)
    }

    if (formData.prepTime) {
      payload.append('prepTime', formData.prepTime)
    }

    if (formData.cookTime) {
      payload.append('cookTime', formData.cookTime)
    }

    if (formData.servings) {
      payload.append('servings', formData.servings)
    }

    payload.append('instructions', instructionsText)
    payload.append('ingredients', JSON.stringify(ingredientPayload))
    payload.append('nutrition', JSON.stringify(nutritionPayload))

    if (tagsPayload.length) {
      payload.append('tags', JSON.stringify(tagsPayload))
    }

    if (formData.image) {
      payload.append('image', formData.image)
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/recipes', {
        method: 'POST',
        body: payload
      })

      if (!response.ok) {
        let errorMessage = 'Failed to create recipe.'
        try {
          const errorData = await response.json()
          errorMessage = errorData?.error || errorData?.message || errorMessage
        } catch {
          const errorText = await response.text()
          if (errorText) {
            errorMessage = errorText
          }
        }
        throw new Error(errorMessage)
      }

      const data = await response.json().catch(() => ({}))
      const recipeSlug = data?.recipeId
      router.push(recipeSlug ? `/fitsavory/foods?created=${encodeURIComponent(recipeSlug)}` : '/fitsavory/foods')
    } catch (error) {
      console.error('Recipe submission failed:', error)
      const message = error instanceof Error ? error.message : 'Failed to create recipe. Please try again.'
      setSubmissionError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const nextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return formData.title && formData.description && formData.category && formData.cuisine
      case 2:
        return formData.ingredients.every(ing => ing.name && ing.amount)
      case 3:
        return formData.instructions.every(inst => inst.instruction)
      case 4:
        return formData.nutrition.calories && formData.nutrition.protein
      default:
        return true
    }
  }

  return (
    <div className="max-w-4xl mx-auto text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Upload Recipe</h1>
        <p className="text-gray-600 mt-1 dark:text-gray-300">Share your favorite recipes with nutrition information</p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex justify-between items-center">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isActive = currentStep === step.id
            const isCompleted = currentStep > step.id

            return (
              <div key={step.id} className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isCompleted ? 'bg-green-500 text-white' :
                  isActive ? 'bg-olive-600 text-white' :
                  'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-200'
                }`}>
                  {isCompleted ? (
                    <span>✓</span>
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <span className={`mt-2 text-xs font-medium ${
                  isActive ? 'text-olive-600' : 'text-gray-500 dark:text-gray-300'
                }`}>
                  {step.name}
                </span>
              </div>
            )
          })}
        </div>
        <div className="mt-4 bg-gray-200 rounded-full h-2 dark:bg-gray-700">
          <div
            className="bg-olive-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(currentStep / steps.length) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Form Content */}
      <div className="bg-white rounded-xl shadow-sm border p-6 dark:bg-gray-900 dark:border-gray-800">
        {submissionError && (
          <div className="mb-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:border-rose-300/30 dark:bg-rose-900/20 dark:text-rose-200">
            {submissionError}
          </div>
        )}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                Recipe Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="e.g., Grandma's Chocolate Chip Cookies"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                Description *
              </label>
              <textarea
                rows={4}
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Describe your recipe, its origin, or why you love it..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                  Category *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => handleInputChange('category', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                >
                  <option value="">Select Category</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                  Cuisine *
                </label>
                <select
                  value={formData.cuisine}
                  onChange={(e) => handleInputChange('cuisine', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                >
                  <option value="">Select Cuisine</option>
                  {cuisines.map(cuisine => (
                    <option key={cuisine} value={cuisine}>{cuisine}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                  Difficulty
                </label>
                <select
                  value={formData.difficulty}
                  onChange={(e) => handleInputChange('difficulty', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                >
                  {difficulties.map(diff => (
                    <option key={diff.value} value={diff.value}>
                      {diff.label} - {diff.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                  Prep Time (minutes)
                </label>
                <input
                  type="number"
                  value={formData.prepTime}
                  onChange={(e) => handleInputChange('prepTime', e.target.value)}
                  placeholder="15"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                  Cook Time (minutes)
                </label>
                <input
                  type="number"
                  value={formData.cookTime}
                  onChange={(e) => handleInputChange('cookTime', e.target.value)}
                  placeholder="30"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                  Servings
                </label>
                <input
                  type="number"
                  value={formData.servings}
                  onChange={(e) => handleInputChange('servings', e.target.value)}
                  placeholder="4"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                Recipe Image (Optional)
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center dark:border-gray-600">
                <div className="flex flex-col items-center justify-center">
                  {imagePreview ? (
                    <div className="w-full">
                      <img
                        src={imagePreview}
                        alt="Recipe preview"
                        className="mx-auto h-48 w-full max-w-md rounded-lg object-cover shadow-md"
                        style={{ opacity: imageLoaded ? 1 : 0, transition: 'opacity 200ms ease-in-out' }}
                        onLoad={() => setImageLoaded(true)}
                      />
                    </div>
                  ) : (
                    <Camera className="h-12 w-12 text-gray-400 mx-auto mb-3 dark:text-gray-500" />
                  )}
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-olive-600 hover:text-olive-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-olive-500 dark:bg-gray-800"
                    >
                      <span>{imagePreview ? 'Choose another image' : 'Upload an image'}</span>
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(e)}
                      />
                    </label>
                    {!imagePreview && <p className="pl-1">or drag and drop</p>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                    PNG, JPG, GIF up to 5MB (Recommended: 800x600px)
                  </p>
                  {imagePreview && (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Remove image
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                A default image will be used if none is provided
              </p>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Ingredients</h3>
            {formData.ingredients.map((ingredient, index) => (
              <div key={index} className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                    Ingredient Name *
                  </label>
                  <input
                    type="text"
                    value={ingredient.name}
                    onChange={(e) => handleIngredientChange(index, 'name', e.target.value)}
                    placeholder="e.g., All-purpose flour"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                    Amount *
                  </label>
                  <input
                    type="text"
                    value={ingredient.amount}
                    onChange={(e) => handleIngredientChange(index, 'amount', e.target.value)}
                    placeholder="2"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={ingredient.unit}
                    onChange={(e) => handleIngredientChange(index, 'unit', e.target.value)}
                    placeholder="cups"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  />
                </div>
                {formData.ingredients.length > 1 && (
                  <button
                    onClick={() => removeIngredient(index)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addIngredient}
              className="w-full py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-olive-500 hover:text-olive-600 transition-colors dark:border-gray-700 dark:text-gray-300"
            >
              <Plus className="h-4 w-4 inline mr-2" />
              Add Ingredient
            </button>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Instructions</h3>
            {formData.instructions.map((instruction, index) => (
              <div key={index} className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-olive-100 text-olive-800 rounded-full flex items-center justify-center text-sm font-medium">
                  {instruction.step}
                </div>
                <div className="flex-1">
                  <textarea
                    rows={3}
                    value={instruction.instruction}
                    onChange={(e) => handleInstructionChange(index, e.target.value)}
                    placeholder={`Step ${instruction.step}: Describe what to do...`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  />
                </div>
                {formData.instructions.length > 1 && (
                  <button
                    onClick={() => removeInstruction(index)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg self-start dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addInstruction}
              className="w-full py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-olive-500 hover:text-olive-600 transition-colors dark:border-gray-700 dark:text-gray-300"
            >
              <Plus className="h-4 w-4 inline mr-2" />
              Add Step
            </button>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Nutrition Information</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Enter nutrition per serving or use the CalorieNinjas auto-calculator. You can fine-tune the values manually afterwards.
            </p>

            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-olive-200 bg-olive-50/40 p-4 dark:border-olive-200/40 dark:bg-olive-900/20">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-olive-700 dark:text-olive-200">
                  Uses your ingredient list (and servings) to estimate macros via CalorieNinjas.
                </div>
                <button
                  type="button"
                  onClick={handleAutoCalculateNutrition}
                  disabled={isCalculatingNutrition}
                  className="inline-flex items-center gap-2 rounded-lg bg-olive-600 px-4 py-2 text-sm font-semibold text-white hover:bg-olive-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Calculator className="h-4 w-4" />
                  {isCalculatingNutrition ? 'Calculating…' : 'Auto-calculate nutrition'}
                </button>
              </div>

              {calculationError ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:border-rose-300/30 dark:bg-rose-900/20 dark:text-rose-200">
                  {calculationError}
                </div>
              ) : null}

              {calculationResults ? (
                <div className="space-y-2 text-sm text-olive-700 dark:text-olive-200">
                  <p className="font-medium">
                    Auto-calculated totals for {calculationResults.servings} serving{calculationResults.servings === 1 ? '' : 's'}:
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-olive-800 dark:text-olive-200">
                    <span>Calories: {Math.round(calculationResults.totals.calories)} total</span>
                    <span>Protein: {calculationResults.totals.protein.toFixed(1)} g</span>
                    <span>Carbs: {calculationResults.totals.carbs.toFixed(1)} g</span>
                    <span>Fat: {calculationResults.totals.fat.toFixed(1)} g</span>
                    <span>Fiber: {calculationResults.totals.fiber.toFixed(1)} g</span>
                    <span>Sugar: {calculationResults.totals.sugar.toFixed(1)} g</span>
                  </div>
                  <p className="text-xs text-olive-500 dark:text-olive-300">
                    Values shown in the form are per serving. Adjust manually if needed.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Calories *
                </label>
                <input
                  type="number"
                  value={formData.nutrition.calories}
                  onChange={(e) => handleNutritionChange('calories', e.target.value)}
                  placeholder="250"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Protein (g) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.nutrition.protein}
                  onChange={(e) => handleNutritionChange('protein', e.target.value)}
                  placeholder="12.5"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Carbohydrates (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.nutrition.carbs}
                  onChange={(e) => handleNutritionChange('carbs', e.target.value)}
                  placeholder="35.2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Fat (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.nutrition.fat}
                  onChange={(e) => handleNutritionChange('fat', e.target.value)}
                  placeholder="8.7"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Fiber (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.nutrition.fiber}
                  onChange={(e) => handleNutritionChange('fiber', e.target.value)}
                  placeholder="3.2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Sugar (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.nutrition.sugar}
                  onChange={(e) => handleNutritionChange('sugar', e.target.value)}
                  placeholder="15.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                />
              </div>
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Review Your Recipe</h3>
            <div className="bg-gray-50 p-6 rounded-lg dark:bg-gray-800/60">
              <h4 className="font-semibold text-gray-900 mb-2 dark:text-gray-100">{formData.title}</h4>
              <p className="text-gray-600 mb-4 dark:text-gray-300">{formData.description}</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Category:</span>
                  <p className="font-medium dark:text-gray-100">{formData.category}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Cuisine:</span>
                  <p className="font-medium dark:text-gray-100">{formData.cuisine}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Prep Time:</span>
                  <p className="font-medium dark:text-gray-100">{formData.prepTime} min</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Servings:</span>
                  <p className="font-medium dark:text-gray-100">{formData.servings}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-8">
        <button
          onClick={prevStep}
          disabled={currentStep === 1}
          className={`px-6 py-2 rounded-lg ${
            currentStep === 1
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'
              : 'bg-gray-600 text-white hover:bg-gray-700'
          }`}
        >
          Previous
        </button>

        <div className="flex space-x-3">
          {currentStep < steps.length ? (
            <button
              onClick={nextStep}
              disabled={!isStepValid()}
              className={`px-6 py-2 rounded-lg ${
                isStepValid()
                  ? 'bg-olive-600 text-white hover:bg-olive-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'
              }`}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 flex items-center space-x-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              <span>{isSubmitting ? 'Saving...' : 'Save Recipe'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
