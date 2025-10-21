'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Search,
  Plus,
  Loader2,
  Star,
  Clock,
  Edit,
  Trash2,
  Copy,
  Eye,
  ChefHat,
  ExternalLink
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { useFavorites } from '@/context/FavoritesContext'

const hasMeaningfulNutrition = (nutrition) => {
  if (!nutrition) return false

  const keys = ['calories', 'protein', 'carbs', 'fat']
  return keys.some((key) => {
    const value = nutrition[key]
    if (value === null || value === undefined) {
      return false
    }
    const numeric = Number(value)
    return Number.isFinite(numeric) && numeric > 0
  })
}

const normalizeNutritionValue = (value) => {
  if (value === null || value === undefined || value === '') return null
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

const fetchMealDbDetails = async (id) => {
  if (!id) return null

  try {
    const response = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${encodeURIComponent(id)}`)
    if (!response.ok) return null

    const payload = await response.json().catch(() => null)
    const mealData = payload?.meals?.[0]
    if (!mealData) return null

    const instructions = mealData.strInstructions ? mealData.strInstructions.replace(/\r\n/g, '\n').trim() : null

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
}

const resolveFoodRecipeAttempts = (food) => {
  if (!food) return []

  const attempts = []
  const seen = new Set()
  const pushAttempt = (id, source) => {
    if (!id) return
    const normalizedId = id.toString().trim()
    if (!normalizedId) return
    const key = `${normalizedId}::${source || 'default'}`
    if (seen.has(key)) return
    seen.add(key)
    attempts.push({ id: normalizedId, source })
  }

  pushAttempt(food.slug, undefined)
  pushAttempt(food.slug, 'community')
  pushAttempt(food.slug, 'mealdb')
  pushAttempt(food.id, undefined)
  pushAttempt(food.id, 'community')
  pushAttempt(food.id, 'mealdb')
  pushAttempt(food.recipeId, undefined)
  pushAttempt(food.recipeId, 'community')
  pushAttempt(food.recipeId, 'mealdb')
  pushAttempt(food.externalId, undefined)

  if (food.externalId && /^\d+$/.test(String(food.externalId))) {
    pushAttempt(food.externalId, 'mealdb')
  }

  return attempts
}

const buildFallbackDetailsFromFood = (food) => {
  if (!food) return null

  const fallbackNutrition = {
    calories: normalizeNutritionValue(food?.calories ?? food?.nutrition?.calories),
    protein: normalizeNutritionValue(food?.protein ?? food?.nutrition?.protein),
    carbs: normalizeNutritionValue(food?.carbs ?? food?.nutrition?.carbs),
    fat: normalizeNutritionValue(food?.fat ?? food?.nutrition?.fat)
  }

  return {
    title: food.name || null,
    description: food.description || null,
    nutrition: hasMeaningfulNutrition(fallbackNutrition) ? fallbackNutrition : null,
    ingredients: Array.isArray(food?.ingredients) ? food.ingredients : [],
    instructions: food?.instructions || null,
    image: food?.image || null,
    url: food?.url || null,
    servings: food?.servings ?? null,
    source: food?.source || null
  }
}

export default function FoodLibrary() {
  const searchParams = useSearchParams()
  const createdSlug = searchParams.get('created')

  const [foods, setFoods] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [sortBy, setSortBy] = useState('recent')
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingFood, setEditingFood] = useState(null)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [isFetchingNutrition, setIsFetchingNutrition] = useState(false)
  const [nutritionLookupError, setNutritionLookupError] = useState(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [availableRecipes, setAvailableRecipes] = useState([])
  const [recipeSearchTerm, setRecipeSearchTerm] = useState('')
  const [isSearchingRecipes, setIsSearchingRecipes] = useState(false)
  const [isImportingRecipe, setIsImportingRecipe] = useState(false)
  const [addRecipeError, setAddRecipeError] = useState(null)
  const recipeSearchTimeoutRef = useRef(null)
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false)
  const [recipeModalLoading, setRecipeModalLoading] = useState(false)
  const [recipeModalError, setRecipeModalError] = useState(null)
  const [recipeDetails, setRecipeDetails] = useState(null)
  const [recipeFoodContext, setRecipeFoodContext] = useState(null)
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    category: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    tags: ''
  })
  const [hiddenIds, setHiddenIds] = useState([])
  const [hiddenInitialized, setHiddenInitialized] = useState(false)

  const { favorites, toggleFavorite: toggleFavoriteContext, removeFromFavorites } = useFavorites()

  const favoriteKeys = useMemo(() => {
    const keys = new Set()

    favorites.forEach((favorite) => {
      const identifiers = [
        favorite?.id,
        favorite?.recipeId,
        favorite?.slug,
        favorite?.externalId
      ]

      identifiers.forEach((value) => {
        if (value !== null && value !== undefined && value !== '') {
          keys.add(String(value).toLowerCase())
        }
      })
    })

    return keys
  }, [favorites])

  const hiddenIdSet = useMemo(() => {
    const keys = new Set()

    hiddenIds.forEach((value) => {
      if (value !== null && value !== undefined && value !== '') {
        keys.add(String(value).toLowerCase())
      }
    })

    return keys
  }, [hiddenIds])

  const applyFavoriteFlag = useCallback((items) => {
    if (!Array.isArray(items)) {
      return []
    }

    return items.map((item) => {
      const identifiers = [item.id, item.slug, item.recipeId, item.externalId]
      const favoriteMatch = identifiers.some((value) => {
        if (value === null || value === undefined || value === '') {
          return false
        }
        return favoriteKeys.has(String(value).toLowerCase())
      })

      return {
        ...item,
        favorite: favoriteMatch
      }
    })
  }, [favoriteKeys])

  const filterVisibleFoods = useCallback((items) => {
    if (!Array.isArray(items)) {
      return []
    }

    return items.filter((item) => {
      const key = String(item.id ?? item.slug ?? '')
      if (!key) {
        return true
      }
      return !hiddenIdSet.has(key.toLowerCase())
    })
  }, [hiddenIdSet])

  const updateFoodsWithFlags = useCallback((items) => {
    return applyFavoriteFlag(filterVisibleFoods(items))
  }, [applyFavoriteFlag, filterVisibleFoods])

  useEffect(() => {
    if (createdSlug) {
      setSuccessMessage('Recipe submitted successfully! It will appear here once approved.')
    }
  }, [createdSlug])

  useEffect(() => {
    if (typeof window === 'undefined') {
      setHiddenInitialized(true)
      return
    }

    try {
      const stored = window.localStorage.getItem('fitsavoryHiddenFoods')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          const cleaned = parsed
            .map((value) => (value !== null && value !== undefined ? String(value) : null))
            .filter((value) => value !== null && value.length)
          setHiddenIds(cleaned)
        }
      }
    } catch (storageError) {
      console.warn('Unable to read hidden foods from storage:', storageError)
    } finally {
      setHiddenInitialized(true)
    }
  }, [])

  useEffect(() => {
    if (!hiddenInitialized || typeof window === 'undefined') return

    try {
      window.localStorage.setItem('fitsavoryHiddenFoods', JSON.stringify(hiddenIds))
    } catch (storageError) {
      console.warn('Unable to persist hidden foods to storage:', storageError)
    }
  }, [hiddenIds, hiddenInitialized])

  const loadFoods = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/recipes?mine=true', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || 'Failed to load your recipes.')
      }

      const data = await response.json()
      const recipes = Array.isArray(data?.recipes) ? data.recipes : []

      const normalizedFoods = recipes.map((recipe) => ({
        id: recipe.id || recipe.slug || recipe.title,
        slug: recipe.slug,
        name: recipe.title || 'Untitled Recipe',
        description: recipe.description || '',
        category: recipe.category || 'Other',
        createdAt: recipe.createdAt,
        servings: recipe.servings,
        rating: recipe.rating ?? recipe.averageRating ?? null,
        reviews: recipe.reviews ?? recipe.totalReviews ?? 0,
        favorite: Boolean(recipe.isFavorite),
        calories: recipe.calories ?? recipe.nutrition?.calories ?? recipe.macros?.calories ?? null,
        protein: recipe.protein ?? recipe.nutrition?.protein ?? recipe.macros?.protein ?? null,
        carbs: recipe.carbs ?? recipe.nutrition?.carbs ?? recipe.macros?.carbs ?? null,
        fat: recipe.fat ?? recipe.nutrition?.fat ?? recipe.macros?.fat ?? null,
        tags: recipe.tags ?? [],
        source: recipe.source || recipe.origin || null,
        recipeId: recipe.recipeId ?? recipe.originalId ?? recipe.id ?? null,
        externalId: recipe.externalId ?? recipe.sourceId ?? recipe.originId ?? null,
        image: recipe.image || recipe.coverImage || null,
        instructions: recipe.instructions ?? null,
        ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
        nutrition: recipe.nutrition ?? recipe.macros ?? null,
        url: recipe.url ?? recipe.sourceUrl ?? null
      }))

      setFoods(updateFoodsWithFlags(normalizedFoods))
    } catch (apiError) {
      console.error('Failed to load personal recipes:', apiError)
      setError(apiError instanceof Error ? apiError.message : 'Unable to load recipes.')
      setFoods([])
    } finally {
      setIsLoading(false)
    }
  }, [updateFoodsWithFlags])

  useEffect(() => {
    if (!hiddenInitialized) return
    loadFoods()
  }, [hiddenInitialized, loadFoods])

  useEffect(() => {
    setFoods((previous) => updateFoodsWithFlags(previous))
  }, [favorites, updateFoodsWithFlags])

  const handleOpenAddModal = () => {
    setAddRecipeError(null)
    setAvailableRecipes([])
    setRecipeSearchTerm('')

    if (recipeSearchTimeoutRef.current) {
      clearTimeout(recipeSearchTimeoutRef.current)
      recipeSearchTimeoutRef.current = null
    }

    setIsAddModalOpen(true)
    void fetchRecipes('')
  }

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false)
    setIsSearchingRecipes(false)
    setIsImportingRecipe(false)
    setAddRecipeError(null)
    setAvailableRecipes([])

    if (recipeSearchTimeoutRef.current) {
      clearTimeout(recipeSearchTimeoutRef.current)
      recipeSearchTimeoutRef.current = null
    }
  }

  const fetchRecipes = useCallback(async (query) => {
    const trimmed = (query ?? '').trim()
    const communityUrl = trimmed
      ? `/api/recipes?search=${encodeURIComponent(trimmed)}&limit=10`
      : '/api/recipes?limit=12'
    const externalUrl = trimmed
      ? `/api/recipes/external?search=${encodeURIComponent(trimmed)}&limit=10`
      : '/api/recipes/external?limit=12'

    try {
      setIsSearchingRecipes(true)
      setAddRecipeError(null)

      const [communityResponse, externalResponse] = await Promise.allSettled([
        fetch(communityUrl, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' }),
        fetch(externalUrl, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' })
      ])

      const handleResponse = async (result) => {
        if (result.status !== 'fulfilled') return { recipes: [], error: result.reason }
        const response = result.value
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          return { recipes: [], error: new Error(body?.error || response.statusText) }
        }
        const data = await response.json()
        return { recipes: Array.isArray(data?.recipes) ? data.recipes : [] }
      }

      const [{ recipes: communityRecipes, error: communityError }, { recipes: mealDbRecipes, error: mealDbError }] =
        await Promise.all([handleResponse(communityResponse), handleResponse(externalResponse)])

      const normalizedCommunity = communityRecipes.map((recipe) => ({
        id: recipe.id || recipe.slug,
        slug: recipe.slug,
        title: recipe.title || 'Untitled Recipe',
        description: recipe.description || '',
        category: recipe.category || 'Other',
        calories: recipe.calories ?? recipe.nutrition?.calories ?? null,
        protein: recipe.protein ?? recipe.nutrition?.protein ?? null,
        carbs: recipe.carbs ?? recipe.nutrition?.carbs ?? null,
        fat: recipe.fat ?? recipe.nutrition?.fat ?? null,
        servings: recipe.servings ?? null,
        image: recipe.image || null,
        source: recipe.source || 'community'
      }))

      const normalizedMealDb = mealDbRecipes.map((recipe) => ({
        id: recipe.id || recipe.slug,
        slug: recipe.slug,
        title: recipe.title || 'Untitled Recipe',
        description: recipe.description || '',
        category: recipe.category || 'Other',
        calories: recipe.calories ?? recipe.nutrition?.calories ?? null,
        protein: recipe.protein ?? recipe.nutrition?.protein ?? null,
        carbs: recipe.carbs ?? recipe.nutrition?.carbs ?? null,
        fat: recipe.fat ?? recipe.nutrition?.fat ?? null,
        servings: recipe.servings ?? null,
        image: recipe.image || null,
        source: recipe.source || 'mealdb'
      }))

      const combined = [...normalizedCommunity, ...normalizedMealDb]

      const uniqueBySlug = Array.from(
        combined.reduce((map, recipe) => {
          const key = recipe.slug || recipe.id
          if (key && !map.has(key)) {
            map.set(key, recipe)
          }
          return map
        }, new Map())
        .values()
      )

      if (communityError && mealDbError) {
        throw communityError instanceof Error ? communityError : mealDbError
      }

      setAvailableRecipes(uniqueBySlug)

      if (communityError || mealDbError) {
        const partialError = communityError || mealDbError
        setAddRecipeError(
          partialError instanceof Error
            ? `Some recipes could not be loaded: ${partialError.message}`
            : 'Some recipes could not be loaded.'
        )
      }
    } catch (searchError) {
      console.error('Recipe search failed:', searchError)
      setAddRecipeError(searchError instanceof Error ? searchError.message : 'Unable to search recipes right now.')
      setAvailableRecipes([])
    } finally {
      setIsSearchingRecipes(false)
    }
  }, [])

  useEffect(() => {
    if (!isAddModalOpen) return

    if (recipeSearchTimeoutRef.current) {
      clearTimeout(recipeSearchTimeoutRef.current)
      recipeSearchTimeoutRef.current = null
    }

    const trimmed = recipeSearchTerm.trim()
    if (!trimmed) {
      void fetchRecipes('')
      return
    }

    recipeSearchTimeoutRef.current = setTimeout(() => {
      fetchRecipes(trimmed)
    }, 400)

    return () => {
      if (recipeSearchTimeoutRef.current) {
        clearTimeout(recipeSearchTimeoutRef.current)
        recipeSearchTimeoutRef.current = null
      }
    }
  }, [recipeSearchTerm, fetchRecipes, isAddModalOpen])

  const handleRecipeSearchChange = (event) => {
    setRecipeSearchTerm(event.target.value)
  }

  const handleImportRecipe = async (recipe) => {
    if (!recipe) return

    try {
      setIsImportingRecipe(true)
      setAddRecipeError(null)

      const detailResponse = await fetch(
        `/api/recipes/${encodeURIComponent(recipe.slug || recipe.id)}?source=${encodeURIComponent(recipe.source || 'community')}`,
        { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' }
      )

      if (!detailResponse.ok) {
        const body = await detailResponse.json().catch(() => ({}))
        throw new Error(body?.error || 'Failed to load recipe details.')
      }

      const detail = await detailResponse.json()

      if (detail.source === 'mealdb' && (!detail.nutrition || !Number.isFinite(detail.nutrition?.calories))) {
        try {
          const fallbackNutrition = await recipeAPI.enrichRecipesWithNutritionFatSecret([
            {
              ...detail,
              ingredients: detail.ingredients || []
            }
          ])
          const enriched = fallbackNutrition?.[0]?.nutrition
          if (enriched) {
            detail.nutrition = {
              calories: enriched.calories ?? detail.nutrition?.calories ?? null,
              protein: enriched.protein ?? detail.nutrition?.protein ?? null,
              carbs: enriched.carbs ?? detail.nutrition?.carbs ?? null,
              fat: enriched.fat ?? enriched.fats ?? detail.nutrition?.fat ?? null,
              fats: enriched.fats ?? detail.nutrition?.fats ?? null,
              fiber: enriched.fiber ?? detail.nutrition?.fiber ?? null,
              sugar: enriched.sugar ?? detail.nutrition?.sugar ?? null,
              isAutoCalculated: true
            }
          }
        } catch (nutritionError) {
          console.warn('Failed to enrich MealDB nutrition:', nutritionError)
        }
      }

      const formData = new FormData()
      formData.append('title', detail.title || recipe.title || 'Untitled Recipe')
      formData.append('description', detail.description || recipe.description || '')
      const instructions = Array.isArray(detail.instructions)
        ? detail.instructions.join('\n')
        : detail.instructions || 'No instructions provided.'
      formData.append('instructions', instructions)

      if (detail.prepTime) formData.append('prepTime', String(detail.prepTime))
      if (detail.cookTime) formData.append('cookTime', String(detail.cookTime))
      if (detail.servings) formData.append('servings', String(detail.servings))
      formData.append('difficulty', detail.difficulty || 'medium')
      if (detail.category || recipe.category) formData.append('category', detail.category || recipe.category)
      if (detail.cuisine) formData.append('cuisine', detail.cuisine)
      if (detail.image) formData.append('imageUrl', detail.image)

      const nutritionPayload = {
        calories: detail.nutrition?.calories ?? recipe.calories ?? null,
        protein: detail.nutrition?.protein ?? recipe.protein ?? null,
        carbs: detail.nutrition?.carbs ?? recipe.carbs ?? null,
        fats: detail.nutrition?.fat ?? detail.nutrition?.fats ?? recipe.fat ?? null,
        fiber: detail.nutrition?.fiber ?? null,
        sugar: detail.nutrition?.sugar ?? null,
        sodium: detail.nutrition?.sodium ?? null,
        cholesterol: detail.nutrition?.cholesterol ?? null,
        isAutoCalculated: false
      }
      formData.append('nutrition', JSON.stringify(nutritionPayload))

      const ingredientsPayload = Array.isArray(detail.ingredients) ? detail.ingredients : []
      formData.append('ingredients', JSON.stringify(ingredientsPayload))

      const createResponse = await fetch('/api/recipes', {
        method: 'POST',
        body: formData
      })

      if (!createResponse.ok) {
        const body = await createResponse.json().catch(() => ({}))
        throw new Error(body?.error || 'Failed to add recipe.')
      }

      await loadFoods()
      setSuccessMessage(`${detail.title || recipe.title} added to your foods.`)
      handleCloseAddModal()
    } catch (importError) {
      console.error('Failed to import recipe:', importError)
      setAddRecipeError(importError instanceof Error ? importError.message : 'Unable to add recipe right now.')
    } finally {
      setIsImportingRecipe(false)
    }
  }

  useEffect(() => {
    loadFoods()
  }, [loadFoods])

  const categoryOptions = useMemo(() => {
    const baseOptions = ['All']
    const dynamic = Array.from(
      new Set(
        foods
          .map((food) => food.category?.trim())
          .filter((category) => category && category.length)
      )
    ).sort((a, b) => a.localeCompare(b))

    return [...baseOptions, ...dynamic]
  }, [foods])

  useEffect(() => {
    if (!categoryOptions.includes(selectedCategory)) {
      setSelectedCategory('All')
    }
  }, [categoryOptions, selectedCategory])

  const filteredFoods = useMemo(() => (
    foods
      .filter((food) => {
        const lowerSearch = searchTerm.trim().toLowerCase()
        const normalizedName = food.name?.toLowerCase() || ''
        const normalizedDescription = food.description?.toLowerCase() || ''
        const matchesSearch = !lowerSearch ||
          normalizedName.includes(lowerSearch) ||
          normalizedDescription.includes(lowerSearch) ||
          (Array.isArray(food.tags) && food.tags.some((tag) => tag?.toLowerCase().includes(lowerSearch)))

        const foodCategory = food.category?.trim().toLowerCase() || 'other'
        const selectedNormalized = selectedCategory.trim().toLowerCase()
        const matchesCategory = selectedNormalized === 'all' || foodCategory === selectedNormalized

        const matchesFavorites = !showFavoritesOnly || Boolean(food.favorite)

        return matchesSearch && matchesCategory && matchesFavorites
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return a.name.localeCompare(b.name)
          case 'caloriesHigh':
            return (b.calories ?? Number.NEGATIVE_INFINITY) - (a.calories ?? Number.NEGATIVE_INFINITY)
          case 'calories':
            return (a.calories ?? Number.POSITIVE_INFINITY) - (b.calories ?? Number.POSITIVE_INFINITY)
          case 'recent':
          default:
            return new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0)
        }
      })
  ), [foods, searchTerm, selectedCategory, sortBy, showFavoritesOnly])

  const handleToggleFavorite = async (food) => {
    if (!food) return

    const payload = {
      id: food.id,
      recipeId: food.id,
      slug: food.slug,
      title: food.name,
      description: food.description,
      image: food.image || null,
      category: food.category,
      servings: food.servings ?? null,
      sourceKey: 'community'
    }

    try {
      await toggleFavoriteContext(payload)
      setFoods((previous) => updateFoodsWithFlags(previous))
    } catch (favoriteError) {
      console.error('Failed to toggle favorite:', favoriteError)
      setError('Unable to update favorites at the moment.')
    }
  }

  const handleDeleteFood = (food) => {
    if (!food) return

    setError(null)

    const hiddenKey = String(food.id ?? food.slug ?? '')

    setFoods((prevFoods) => {
      const filtered = prevFoods.filter((item) => {
        const key = String(item.id ?? item.slug ?? '')
        return key.toLowerCase() !== hiddenKey.toLowerCase()
      })
      return updateFoodsWithFlags(filtered)
    })

    if (food.favorite) {
      removeFromFavorites(food.id)
    }

    if (hiddenKey.length) {
      setHiddenIds((previous) => {
        const lowerKey = hiddenKey.toLowerCase()
        const existing = new Set(previous.map((value) => String(value).toLowerCase()))
        if (!existing.has(lowerKey)) {
          existing.add(lowerKey)
        }

        const slugKey = food.slug ? String(food.slug).toLowerCase() : null
        if (slugKey && !existing.has(slugKey)) {
          existing.add(slugKey)
        }

        const idKey = food.id ? String(food.id).toLowerCase() : null
        if (idKey && !existing.has(idKey)) {
          existing.add(idKey)
        }

        return Array.from(existing)
      })
    }
  }

  const enrichRecipeDetails = useCallback(async (details, food) => {
    const draft = details ? { ...details } : {}

    if (!draft.title && food?.name) {
      draft.title = food.name
    }
    if (!draft.description && food?.description) {
      draft.description = food.description
    }
    if (!draft.category && food?.category) {
      draft.category = food.category
    }
    if (!draft.servings && food?.servings) {
      draft.servings = food.servings
    }
    if (!draft.image && food?.image) {
      draft.image = food.image
    }

    if (!hasMeaningfulNutrition(draft.nutrition)) {
      const nutritionFallback = {
        calories: normalizeNutritionValue(food?.calories ?? food?.nutrition?.calories),
        protein: normalizeNutritionValue(food?.protein ?? food?.nutrition?.protein),
        carbs: normalizeNutritionValue(food?.carbs ?? food?.nutrition?.carbs),
        fat: normalizeNutritionValue(food?.fat ?? food?.nutrition?.fat)
      }

      if (hasMeaningfulNutrition(nutritionFallback)) {
        draft.nutrition = nutritionFallback
      }
    }

    if ((!draft.ingredients || draft.ingredients.length === 0) && Array.isArray(food?.ingredients) && food.ingredients.length) {
      draft.ingredients = food.ingredients
    }

    if (!draft.instructions && food?.instructions) {
      draft.instructions = food.instructions
    }

    if (isPlaceholderInstruction(draft.instructions) && food?.instructions && !isPlaceholderInstruction(food.instructions)) {
      draft.instructions = food.instructions
    }

    if (!draft.url && food?.url) {
      draft.url = food.url
    }

    const numericExternalId = food?.externalId && /^\d+$/.test(String(food.externalId)) ? String(food.externalId) : null
    if ((isPlaceholderInstruction(draft.instructions) || !draft.ingredients?.length || !draft.image) && numericExternalId) {
      const mealDbDetails = await fetchMealDbDetails(numericExternalId)
      if (mealDbDetails) {
        Object.assign(draft, mergeRecipeContent(draft, mealDbDetails))
      }
    }

    return draft
  }, [])

  const handleViewRecipe = useCallback(async (food) => {
    if (!food) return

    setRecipeFoodContext({
      name: food.name || 'Recipe preview',
      category: food.category || null,
      source: food.source || null
    })
    setRecipeModalError(null)
    setRecipeDetails(null)
    setRecipeModalLoading(true)
    setIsRecipeModalOpen(true)

    const attempts = resolveFoodRecipeAttempts(food)

    if (!attempts.length) {
      const fallbackDetails = await enrichRecipeDetails(buildFallbackDetailsFromFood(food), food)
      setRecipeDetails(fallbackDetails)
      setRecipeModalError('No recipe identifier is available for this food.')
      setRecipeModalLoading(false)
      return
    }

    let lastError = null

    for (const attempt of attempts) {
      try {
        const query = attempt.source ? `?source=${encodeURIComponent(attempt.source)}` : ''
        const response = await fetch(`/api/recipes/${encodeURIComponent(attempt.id)}${query}`, { cache: 'no-store' })
        if (!response.ok) {
          let body = null
          try {
            body = await response.json()
          } catch (parseError) {
            body = null
          }
          lastError =
            body?.error ||
            body?.message ||
            `${response.status} ${response.statusText || 'Unable to fetch recipe details.'}`
          continue
        }

        const data = await response.json()
        const enriched = await enrichRecipeDetails(data, food)
        setRecipeDetails(enriched)
        setRecipeModalLoading(false)
        return
      } catch (fetchError) {
        lastError = fetchError instanceof Error ? fetchError.message : 'Unexpected error while fetching recipe details.'
      }
    }

    const fallbackDetails = await enrichRecipeDetails(buildFallbackDetailsFromFood(food), food)
    if (fallbackDetails && (fallbackDetails.ingredients?.length || fallbackDetails.instructions || hasMeaningfulNutrition(fallbackDetails.nutrition))) {
      setRecipeDetails(fallbackDetails)
      setRecipeModalError(lastError || 'Unable to load recipe from its source, showing available food details.')
    } else {
      setRecipeModalError(lastError || 'Unable to load recipe details for this food right now. Please try again later.')
    }
    setRecipeModalLoading(false)
  }, [enrichRecipeDetails])

  const handleEditFood = (food) => {
    if (!food) return

    setEditingFood(food)
    setEditForm({
      name: food.name || '',
      description: food.description || '',
      category: food.category || 'Other',
      calories: food.calories ?? '',
      protein: food.protein ?? '',
      carbs: food.carbs ?? '',
      fat: food.fat ?? '',
      tags: Array.isArray(food.tags) ? food.tags.join(', ') : ''
    })
    setNutritionLookupError(null)
    setIsEditModalOpen(true)
  }

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false)
    setIsSavingEdit(false)
    setEditingFood(null)
    setIsFetchingNutrition(false)
    setNutritionLookupError(null)
  }

  const handleEditFormChange = (event) => {
    const { name, value } = event.target
    setEditForm((previous) => ({ ...previous, [name]: value }))
  }

  const handleFetchNutrition = async () => {
    if (!editingFood) return

    const queryParts = [editForm.name || editingFood.name, editForm.description, editForm.tags]
      .filter(Boolean)
      .join(', ')
      .trim()

    if (!queryParts) {
      setNutritionLookupError('Add a name or description before fetching nutrition.')
      return
    }

    try {
      setNutritionLookupError(null)
      setIsFetchingNutrition(true)

      const response = await fetch(`/api/nutrition?query=${encodeURIComponent(queryParts)}`)
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body?.error || 'Nutrition lookup failed')
      }

      const data = await response.json()
      if (!data) {
        setNutritionLookupError('No nutrition data returned for this query.')
        return
      }

      const toValue = (value) => {
        const parsed = Number.parseFloat(value)
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : ''
      }

      setEditForm((previous) => ({
        ...previous,
        calories: toValue(data.calories),
        protein: toValue(data.protein),
        carbs: toValue(data.carbs),
        fat: toValue(data.fat)
      }))
    } catch (lookupError) {
      console.error('Nutrition lookup failed:', lookupError)
      setNutritionLookupError(lookupError.message || 'Unable to fetch nutrition data right now.')
    } finally {
      setIsFetchingNutrition(false)
    }
  }

  const handleEditSubmit = async (event) => {
    event.preventDefault()
    if (!editingFood) return

    const parseNumber = (value) => {
      if (value === '' || value === null || value === undefined) return null
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }

    const payload = {
      name: editForm.name.trim() || editingFood.name,
      description: editForm.description.trim(),
      category: editForm.category,
      calories: parseNumber(editForm.calories),
      protein: parseNumber(editForm.protein),
      carbs: parseNumber(editForm.carbs),
      fat: parseNumber(editForm.fat)
    }

    setIsSavingEdit(true)

    try {
      const response = await fetch(`/api/recipes/${encodeURIComponent(editingFood.slug || editingFood.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: payload.name,
          description: payload.description,
          category: payload.category,
          nutrition: {
            calories: payload.calories,
            protein: payload.protein,
            carbs: payload.carbs,
            fat: payload.fat,
            isAutoCalculated: false
          }
        })
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body?.error || 'Failed to update recipe')
      }

      const updatedFood = {
        ...editingFood,
        ...payload
      }

      setFoods((previous) =>
        previous.map((food) => (food.id === editingFood.id ? updatedFood : food))
      )
      setSuccessMessage('Recipe updated successfully.')
      handleCloseEditModal()
    } catch (submitError) {
      console.error('Failed to update recipe:', submitError)
      setNutritionLookupError(submitError.message || 'Unable to save changes right now.')
      setIsSavingEdit(false)
    }
  }

  return (
    <div className="space-y-6 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">My Food Library</h1>
          <p className="text-gray-600 mt-1 dark:text-gray-300">Your personal collection of recipes and foods</p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="bg-olive-600 text-white px-6 py-3 rounded-lg hover:bg-olive-700 transition-colors flex items-center space-x-2"
        >
          <Plus className="h-5 w-5" />
          <span>Add New Food</span>
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border dark:bg-gray-900 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">Total Foods</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{foods.length}</p>
            </div>
            <ChefHat className="h-8 w-8 text-olive-600" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border dark:bg-gray-900 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">Favorites</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {foods.filter((f) => f.favorite).length}
              </p>
            </div>
            <Star className="h-8 w-8 text-yellow-500" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-xl shadow-sm border dark:bg-gray-900 dark:border-gray-800">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Search foods..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
          </div>
          <div className="flex gap-4 flex-wrap md:flex-nowrap">
            <select
              value={showFavoritesOnly ? 'favorites' : 'all'}
              onChange={(event) => setShowFavoritesOnly(event.target.value === 'favorites')}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="all">All Foods</option>
              <option value="favorites">Favorites Only</option>
            </select>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              {categoryOptions.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="recent">Most Recent</option>
              <option value="name">Name A-Z</option>
              <option value="caloriesHigh">Highest Calories</option>
              <option value="calories">Lowest Calories</option>
            </select>
          </div>
        </div>
      </div>

      {/* Food Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-600 dark:text-gray-300">
          Loading your recipes...
        </div>
      ) : filteredFoods.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-soft-200 rounded-2xl bg-white dark:bg-gray-900 dark:border-gray-800">
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">No recipes found</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {foods.length === 0
              ? 'Start by adding recipes from the community using the button above.'
              : 'Try adjusting your search or filters, or add a new recipe from the community.'}
          </p>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="mt-6 inline-flex items-center rounded-lg bg-olive-600 px-4 py-2 text-sm font-medium text-white hover:bg-olive-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Browse recipes
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredFoods.map((food) => (
            <div
              key={food.id}
              className="bg-white rounded-2xl shadow-md border border-soft-200 transition-all hover:shadow-lg dark:bg-gray-900 dark:border-gray-800"
            >
              <div className="p-6 space-y-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{food.name}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                      {food.description || 'No description provided.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleFavorite(food)}
                      className={`p-1 rounded-full transition-colors ${food.favorite ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'} dark:text-gray-300`}
                    >
                      <Star className={`h-5 w-5 ${food.favorite ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleEditFood(food)}
                      className="p-1 text-gray-400 hover:text-green-600 dark:text-gray-300 dark:hover:text-green-500"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteFood(food)}
                      className="p-1 text-gray-400 hover:text-rose-600 dark:text-gray-300 dark:hover:text-rose-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="rounded-xl border border-soft-300 bg-soft-50 p-3 dark:border-gray-700 dark:bg-gray-800/70">
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{food.calories ?? '—'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Calories</p>
                  </div>
                  <div className="rounded-xl border border-soft-300 bg-soft-50 p-3 dark:border-gray-700 dark:bg-gray-800/70">
                    <p className="text-lg font-bold text-sky-600 dark:text-sky-400">{food.protein ?? '—'}g</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Protein</p>
                  </div>
                  <div className="rounded-xl border border-soft-300 bg-soft-50 p-3 dark:border-gray-700 dark:bg-gray-800/70">
                    <p className="text-lg font-bold text-lime-600 dark:text-lime-400">{food.carbs ?? '—'}g</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Carbs</p>
                  </div>
                  <div className="rounded-xl border border-soft-300 bg-soft-50 p-3 dark:border-gray-700 dark:bg-gray-800/70">
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{food.fat ?? '—'}g</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Fat</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 text-sm text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
                  <span>{food.servings ?? '—'} servings</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {food.slug || food.id ? (
                      <button
                        type="button"
                        onClick={() => handleViewRecipe(food)}
                        className="inline-flex items-center gap-2 rounded-lg border border-soft-200 px-3 py-1.5 text-sm font-medium text-olive-700 transition-colors hover:border-olive-400 hover:bg-olive-50 dark:border-gray-700 dark:text-olive-200 dark:hover:border-olive-400 dark:hover:bg-gray-800"
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
          ))}
        </div>
      )}

      <Dialog
        open={isRecipeModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsRecipeModalOpen(false)
            setRecipeModalLoading(false)
            setRecipeModalError(null)
            setRecipeDetails(null)
            setRecipeFoodContext(null)
          } else {
            setIsRecipeModalOpen(true)
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {recipeFoodContext?.name ?? 'Recipe preview'}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600 dark:text-gray-300">
              Preview ingredients, instructions, and macros for this recipe.
            </DialogDescription>
          </DialogHeader>

          {recipeModalLoading ? (
            <div className="flex min-h-[160px] items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-300">
              <Loader2 className="h-5 w-5.animate-spin text-olive-600" />
              Loading recipe…
            </div>
          ) : recipeModalError ? (
            <div className="rounded-lg border.border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-300/30 dark:bg-rose-900/20 dark:text-rose-200">
              {recipeModalError}
            </div>
          ) : recipeDetails ? (
            <div className="space-y-6">
              {recipeDetails.image ? (
                <img
                  src={recipeDetails.image}
                  alt={recipeDetails.title || recipeFoodContext?.name || 'Recipe image'}
                  className="h-48 w-full rounded-xl object-cover"
                />
              ) : null}

              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Nutrition snapshot</h3>
                {recipeDetails.nutrition ? (
                  <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <div className="rounded-lg border.border-soft-200 bg-soft-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800/60">
                      <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Calories</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {Math.round(recipeDetails.nutrition.calories ?? 0)}
                      </p>
                    </div>
                    <div className="rounded-lg border.border-soft-200 bg-soft-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800/60">
                      <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Protein</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {Math.round(recipeDetails.nutrition.protein ?? 0)} g
                      </p>
                    </div>
                    <div className="rounded-lg border.border-soft-200 bg-soft-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800/60">
                      <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Carbs</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {Math.round(recipeDetails.nutrition.carbs ?? 0)} g
                      </p>
                    </div>
                    <div className="rounded-lg border.border-soft-200 bg-soft-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800/60">
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
                  <p className="text-sm.text-gray-500 dark:text-gray-300">Ingredient details are not available for this recipe.</p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Instructions</h3>
                {recipeDetails.instructions ? (
                  <div className="rounded-lg border.border-soft-200 bg-white px-4 py-3 text-sm leading-relaxed text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                    {Array.isArray(recipeDetails.instructions)
                      ? recipeDetails.instructions.map((step, index) => (
                          <p key={index} className="mb-2">
                            <span className="mr-2 font-semibold text-olive-600 dark:text-olive-300">{index + 1}.</span>
                            {step}
                          </p>
                        ))
                      : recipeDetails.instructions
                          .split(/\n+/)
                          .filter(Boolean)
                          .map((step, index) => (
                            <p key={index} className="mb-2">
                              <span className="mr-2 font-semibold text-olive-600 dark:text-olive-300">{index + 1}.</span>
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
                  className="inline-flex items-center gap-2 rounded-lg bg-olive-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-olive-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  View full recipe
                </a>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-300">Select a recipe to preview its details.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isAddModalOpen} onOpenChange={(value) => (value ? handleOpenAddModal() : handleCloseAddModal())}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Select a recipe</DialogTitle>
            <DialogDescription>Search recipes from the community and add them to your food library.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="recipe-search">
                Search recipes
              </label>
              <input
                id="recipe-search"
                type="text"
                value={recipeSearchTerm}
                onChange={handleRecipeSearchChange}
                placeholder="Type a recipe name..."
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-olive-500 focus:outline-none focus:ring-2 focus:ring-olive-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>

            {addRecipeError ? (
              <p className="text-sm text-rose-600 dark:text-rose-400">{addRecipeError}</p>
            ) : null}

            <div className="max-h-96 overflow-y-auto">
              {isSearchingRecipes ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Searching...</p>
              ) : availableRecipes.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No recipes found.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-2">
                  {availableRecipes.map((recipe) => (
                    <div
                      key={recipe.slug || recipe.id}
                      className="rounded-xl border border-soft-200 bg-white p-4 shadow-sm transition hover:shadow-lg dark:border-gray-700 dark:bg-gray-900"
                    >
                      <div className="flex items-start gap-3">
                        {recipe.image ? (
                          <img
                            src={recipe.image}
                            alt={recipe.title}
                            className="h-16 w-16 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-soft-100 text-soft-500 dark:bg-gray-800 dark:text-gray-500">
                            <ChefHat className="h-6 w-6" />
                          </div>
                        )}
                        <div className="flex-1 space-y-2">
                          <p className="font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{recipe.title}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                            {recipe.description || 'No description available.'}
                          </p>
                          <div className="flex flex-wrap gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                            <span className="rounded-full bg-soft-100 px-2 py-0.5 dark:bg-gray-800">
                              {recipe.category || 'Other'}
                            </span>
                            {recipe.source ? (
                              <span className="rounded-full bg-soft-100 px-2 py-0.5 uppercase tracking-wide dark:bg-gray-800">
                                {recipe.source}
                              </span>
                            ) : null}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="rounded-lg bg-soft-100 px-2 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                              <p className="font-semibold">Calories</p>
                              <p>{recipe.calories ?? recipe.nutrition?.calories ?? '—'} cal</p>
                            </div>
                            <div className="rounded-lg bg-soft-100 px-2 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                              <p className="font-semibold">Protein</p>
                              <p>{recipe.protein ?? recipe.nutrition?.protein ?? '—'} g</p>
                            </div>
                            <div className="rounded-lg bg-soft-100 px-2 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                              <p className="font-semibold">Carbs</p>
                              <p>{recipe.carbs ?? recipe.nutrition?.carbs ?? '—'} g</p>
                            </div>
                            <div className="rounded-lg bg-soft-100 px-2 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                              <p className="font-semibold">Fat</p>
                              <p>{recipe.fat ?? recipe.nutrition?.fat ?? recipe.nutrition?.fats ?? '—'} g</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleImportRecipe(recipe)}
                          disabled={isImportingRecipe}
                          className="rounded-lg bg-olive-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-olive-700 disabled:opacity-60"
                        >
                          {isImportingRecipe ? 'Adding…' : 'Add to foods'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="pt-4">
            <button
              type="button"
              onClick={handleCloseAddModal}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              disabled={isImportingRecipe}
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditModalOpen} onOpenChange={(value) => (value ? handleEditFood(editingFood) : handleCloseEditModal())}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Update the details for `{editingFood?.name || 'this recipe'}`.
            </DialogTitle>
            <DialogDescription>
              Make changes to the recipe name, description, category, tags, and nutrition information.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="edit-name">
                Name
              </label>
              <input
                id="edit-name"
                name="name"
                type="text"
                value={editForm.name}
                onChange={handleEditFormChange}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-olive-500 focus:outline-none focus:ring-2 focus:ring-olive-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="edit-description">
                Description
              </label>
              <textarea
                id="edit-description"
                name="description"
                value={editForm.description}
                onChange={handleEditFormChange}
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-olive-500 focus:outline-none focus:ring-2 focus:ring-olive-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="edit-category">
                  Category
                </label>
                <select
                  id="edit-category"
                  name="category"
                  value={editForm.category}
                  onChange={handleEditFormChange}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-olive-500 focus:outline-none focus:ring-2 focus:ring-olive-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                >
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="edit-tags">
                  Tags (comma separated)
                </label>
                <input
                  id="edit-tags"
                  name="tags"
                  type="text"
                  value={editForm.tags}
                  onChange={handleEditFormChange}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-olive-500 focus:outline-none focus:ring-2 focus:ring-olive-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  placeholder="e.g. High protein, Vegan"
                />
              </div>
            </div>

            <div className="rounded-lg border border-soft-200 bg-soft-50 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-200">Fetch nutrition automatically</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Uses CalorieNinjas / FatSecret lookups based on the recipe name and description.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleFetchNutrition}
                  disabled={isFetchingNutrition}
                  className="inline-flex items-center rounded-lg bg-olive-600 px-4 py-2 text-sm font-medium text-white hover:bg-olive-700 disabled:opacity-60"
                >
                  {isFetchingNutrition ? 'Fetching…' : 'Fetch nutrition'}
                </button>
              </div>
              {nutritionLookupError ? (
                <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{nutritionLookupError}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Calories', name: 'calories' },
                { label: 'Protein (g)', name: 'protein' },
                { label: 'Carbs (g)', name: 'carbs' },
                { label: 'Fat (g)', name: 'fat' }
              ].map((field) => (
                <div key={field.name}>
                  <label
                    className="block text-sm font-medium text-gray-700 dark:text-gray-200"
                    htmlFor={`edit-${field.name}`}
                  >
                    {field.label}
                  </label>
                  <input
                    id={`edit-${field.name}`}
                    name={field.name}
                    type="number"
                    step="0.1"
                    min="0"
                    value={editForm[field.name]}
                    onChange={handleEditFormChange}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-olive-500 focus:outline-none focus:ring-2 focus:ring-olive-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  />
                </div>
              ))}
            </div>

            <DialogFooter className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleCloseEditModal}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                disabled={isSavingEdit}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center rounded-lg bg-olive-600 px-4 py-2 text-sm font-medium text-white hover:bg-olive-700 disabled:opacity-60"
                disabled={isSavingEdit}
              >
                {isSavingEdit ? 'Saving…' : 'Save changes'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
