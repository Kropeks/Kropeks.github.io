'use client'

import { useAuthModal } from '@/components/AuthProvider';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, Plus, Clock, Users, Utensils, Heart } from 'lucide-react';
import RecipePurchaseModal from '@/components/recipes/RecipePurchaseModal';
import { useFavorites } from '@/context/FavoritesContext';

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP'
});

const ADDITIONAL_CATEGORY_OPTIONS = [
  'Appetizer',
  'Beverages',
  'Bread',
  'Brunch',
  'Comfort Food',
  'Grilled',
  'Healthy',
  'Holiday',
  'Quick & Easy',
  'Salad',
  'Slow Cooker',
  'Snack',
  'Soup',
  'Stew',
  'Sweet Treats'
];

const buildCategoryOptions = (apiCategories = []) => {
  const additionalCategories = ADDITIONAL_CATEGORY_OPTIONS.map((name, index) => ({
    idCategory: `additional-${index}`,
    strCategory: name,
    strCategoryDescription: '',
    strCategoryThumb: null
  }));

  const seen = new Set();
  const merged = [];

  [...apiCategories, ...additionalCategories].forEach((category) => {
    const label = category?.strCategory?.toString().trim();
    if (!label) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({
      ...category,
      strCategory: label
    });
  });

  merged.sort((a, b) => a.strCategory.localeCompare(b.strCategory));

  return merged;
};

export default function Recipes() {
  const { requireAuth } = useAuthModal();
  const router = useRouter();
  const { addToFavorites, isFavorite } = useFavorites();
  const searchParams = useSearchParams();
  const [recipes, setRecipes] = useState([])
  const [categories, setCategories] = useState([])
  const [cuisines, setCuisines] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedCuisine, setSelectedCuisine] = useState('')
  const [selectedIngredient, setSelectedIngredient] = useState('')
  const [debouncedIngredient, setDebouncedIngredient] = useState('')
  const [selectedSource, setSelectedSource] = useState('all')
  const [dietFilter, setDietFilter] = useState('')
  const [nutritionFilter, setNutritionFilter] = useState('')
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [filtersInitialized, setFiltersInitialized] = useState(false)
  const requestIdRef = useRef(0)
  const [purchaseRecipe, setPurchaseRecipe] = useState(null)

  const sources = [
    { value: 'all', label: 'All Sources' },
    { value: 'community', label: 'Community' },
    { value: 'mealdb', label: 'MealDB' }
  ]

  const dietOptions = [
    { value: '', label: 'All Diets' },
    { value: 'vegetarian', label: 'Vegetarian' },
    { value: 'vegan', label: 'Vegan' },
    { value: 'gluten-free', label: 'Gluten Free' },
    { value: 'keto', label: 'Keto' },
    { value: 'paleo', label: 'Paleo' },
    { value: 'low-carb', label: 'Low Carb' }
  ]

  const nutritionOptions = [
    { value: '', label: 'All Nutrition' },
    { value: 'high-protein', label: 'High Protein' },
    { value: 'low-calorie', label: 'Low Calorie' },
    { value: 'high-fiber', label: 'High Fiber' },
    { value: 'low-sugar', label: 'Low Sugar' }
  ]

  useEffect(() => {
    fetchInitialData()
  }, [])

  // Initialize filters from URL parameters
  useEffect(() => {
    const cuisine = searchParams.get('cuisine')
    const category = searchParams.get('category')
    const query = searchParams.get('query')
    const source = searchParams.get('source')

    if (cuisine) setSelectedCuisine(cuisine)
    if (category) setSelectedCategory(category)
    if (query) setSearchTerm(query)
    if (source && ['all', 'mealdb'].includes(source)) {
      setSelectedSource(source)
    }

    setFiltersInitialized(true)
  }, [searchParams])

  // Debounced ingredient search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedIngredient(selectedIngredient)
    }, 500) // Wait 500ms after user stops typing

    return () => clearTimeout(timer)
  }, [selectedIngredient])

  useEffect(() => {
    if (!filtersInitialized) {
      return
    }

    fetchRecipes()
  }, [filtersInitialized, searchTerm, selectedCategory, selectedCuisine, selectedSource, dietFilter, nutritionFilter, debouncedIngredient])

  const fetchInitialData = async () => {
    let apiCategories = [];
    try {
      // Fetch categories from MealDB
      const categoriesResponse = await fetch('/api/mealdb?type=categories')
      if (categoriesResponse.ok) {
        const categoriesData = await categoriesResponse.json()
        if (Array.isArray(categoriesData)) {
          apiCategories = categoriesData
        }
      }

      // Fetch cuisines
      const cuisinesResponse = await fetch('/api/mealdb?type=cuisines')
      if (cuisinesResponse.ok) {
        const cuisinesData = await cuisinesResponse.json()
        setCuisines(cuisinesData)
      }
    } catch (error) {
      console.error('Error fetching initial data:', error)
    } finally {
      setCategories(buildCategoryOptions(apiCategories))
    }
  }

  const fetchRecipes = async (loadMore = false) => {
    const requestId = ++requestIdRef.current
    try {
      // Set loading states
      if (loadMore) {
        setIsLoadingMore(true)
      }

      const currentPage = loadMore ? page + 1 : 1
      const itemsPerPage = 12

      const combinedResults = []
      const seen = new Set()

      console.log('🔍 Fetching recipes with params:', {
        searchTerm,
        selectedCategory,
        selectedCuisine,
        selectedSource,
        currentPage,
        itemsPerPage
      })

      const formatSourceLabel = (key) => {
        if (key === 'mealdb') return 'MealDB'
        if (key === 'community') return 'Community'
        return key.charAt(0).toUpperCase() + key.slice(1)
      }

      const addRecipes = (incoming = []) => {
        incoming.forEach((recipe = {}) => {
          const rawSourceKey = recipe.sourceKey || recipe.source || 'mealdb'
          const normalizedSourceKey = rawSourceKey.toString().toLowerCase()
          const identifier = `${normalizedSourceKey}-${recipe.id}-${recipe.title?.toLowerCase()}`
          if (seen.has(identifier)) {
            return
          }
          seen.add(identifier)

          const hasImage = typeof recipe.image === 'string' && recipe.image.trim().length > 0
          const displaySource = formatSourceLabel(normalizedSourceKey)
          const safeImage = hasImage ? recipe.image : '/placeholder-recipe.jpg'

          const numericReadyInMinutes = Number(recipe.readyInMinutes)
          const hasReadyInMinutes = Number.isFinite(numericReadyInMinutes) && numericReadyInMinutes > 0
          const prepMinutes = Number(recipe.prepTime)
          const cookMinutes = Number(recipe.cookTime)
          const fallbackTotal = [prepMinutes, cookMinutes]
            .filter((value) => Number.isFinite(value) && value > 0)
            .reduce((total, value) => total + value, 0)

          combinedResults.push({
            ...recipe,
            image: safeImage,
            hasImage,
            source: displaySource,
            sourceKey: normalizedSourceKey,
            readyInMinutes: hasReadyInMinutes ? numericReadyInMinutes : (fallbackTotal > 0 ? fallbackTotal : null),
            servings: recipe.servings || null
          })
        })
      }

      // Fetch community recipes if 'all' or 'community' is selected
      if (selectedSource === 'community' || selectedSource === 'all') {
        try {
          const communityParams = new URLSearchParams({
            page: currentPage,
            limit: itemsPerPage
          })
          
          // Add filters if they exist
          if (searchTerm) communityParams.append('search', searchTerm)
          if (selectedCategory) communityParams.append('category', selectedCategory)
          if (selectedCuisine) communityParams.append('cuisine', selectedCuisine)
          
          console.log('🌐 Fetching community recipes with params:', communityParams.toString())
          
          const communityResponse = await fetch(`/api/recipes?${communityParams.toString()}`)
          
          if (!communityResponse.ok) {
            const errorData = await communityResponse.text()
            console.error('❌ Error fetching community recipes:', {
              status: communityResponse.status,
              statusText: communityResponse.statusText,
              error: errorData
            })
            throw new Error(`Failed to fetch community recipes: ${communityResponse.statusText}`)
          }
          
          const communityData = await communityResponse.json()
          console.log('📦 Received community recipes:', communityData)
          
          if (communityData.recipes && Array.isArray(communityData.recipes)) {
            console.log(`✅ Found ${communityData.recipes.length} community recipes`)
            const formattedCommunityRecipes = communityData.recipes.map(recipe => {
              const formatted = {
                ...recipe,
                source: 'community',
                sourceKey: 'community',
                // Ensure required fields have default values
                title: recipe.title || 'Untitled Recipe',
                image: recipe.image || '/placeholder-recipe.jpg'
              }
              console.log('📝 Formatted recipe:', { id: recipe.id, title: recipe.title })
              return formatted
            })
            addRecipes(formattedCommunityRecipes)
          } else {
            console.warn('⚠️ No recipes array in community data:', communityData)
          }
        } catch (error) {
          console.error('Error fetching community recipes:', error)
        }
      }

      // Fetch external recipes if 'all' or 'mealdb' is selected
      let externalHasMore = false
      if (selectedSource === 'mealdb' || selectedSource === 'all') {
        try {
          const externalParams = new URLSearchParams()
          if (searchTerm) externalParams.append('query', searchTerm)
          if (selectedCategory) externalParams.append('category', selectedCategory)
          if (selectedCuisine) externalParams.append('cuisine', selectedCuisine)
          if (debouncedIngredient) externalParams.append('ingredient', debouncedIngredient)
          if (dietFilter) externalParams.append('diet', dietFilter)
          if (nutritionFilter) externalParams.append('nutrition', nutritionFilter)
          externalParams.append('source', 'mealdb')
          externalParams.append('number', itemsPerPage)
          externalParams.append('offset', String((currentPage - 1) * itemsPerPage))

          const externalResponse = await fetch(`/api/external/recipes?${externalParams.toString()}`)
          const externalData = await externalResponse.json()

          if (externalData.error) {
            console.warn('MealDB API returned error:', externalData.error)
          } else {
            addRecipes(externalData.recipes || [])
            externalHasMore = (externalData.recipes || []).length === itemsPerPage
          }
        } catch (error) {
          console.error('Error fetching external recipes:', error)
        }
      }

      // Sort by title if needed
      if (combinedResults.length > 1) {
        combinedResults.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
      }

      console.log('📊 Combined results:', {
        total: combinedResults.length,
        recipes: combinedResults.map(r => ({ id: r.id, title: r.title }))
      })

      if (requestId === requestIdRef.current) {
        if (loadMore) {
          setRecipes((prevRecipes) => {
            const newRecipes = [...prevRecipes, ...combinedResults]
            console.log('🔄 Updated recipes (load more):', newRecipes.length)
            return newRecipes
          })
        } else {
          console.log('🆕 Set new recipes:', combinedResults.length)
          setRecipes(combinedResults)
        }

        setPage(currentPage)
        const nextHasMore = externalHasMore
        setHasMore(nextHasMore)

        if (isInitialLoad) {
          setIsInitialLoad(false)
        }
      } else {
        console.log('⏭️ Ignoring stale recipe response for request', requestId)
      }
    } catch (error) {
      console.error('Error fetching recipes:', error)
      if (!loadMore) { // Only show error message on initial load, not on 'load more'
        // Don't load demo data; instead, show an error message
        setRecipes([])
      }
    } finally {
      setIsLoadingMore(false)
    }
  }

  const loadMoreRecipes = async () => {
    if (isLoadingMore || !hasMore) return
    await fetchRecipes(true)
  }

  const handleOpenPurchase = (recipe) => {
    if (!recipe) return
    if (!requireAuth('purchase premium recipes')) {
      return
    }

    const priceValue = Number.parseFloat(recipe.price)
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      return
    }

    setPurchaseRecipe({
      id: recipe.id,
      slug: recipe.slug,
      title: recipe.title,
      price: priceValue,
      hasPurchased: Boolean(recipe.hasPurchased)
    })
  }

  const handleClosePurchase = () => {
    setPurchaseRecipe(null)
  }

  const handlePurchaseSuccess = (result) => {
    if (!result) {
      return
    }

    setRecipes((prev) =>
      prev.map((item) => {
        const matchesId = result.recipeId && String(item.id) === String(result.recipeId)
        const matchesSlug = result.recipeSlug && item.slug && item.slug === result.recipeSlug
        if (matchesId || matchesSlug) {
          return {
            ...item,
            hasPurchased: true
          }
        }
        return item
      })
    )

    setPurchaseRecipe((prev) => (prev ? { ...prev, hasPurchased: true } : prev))
  }

  const getRecipeFavoriteId = (recipe = {}) => {
    if (!recipe) return null

    const sourceKey = recipe.sourceKey || recipe.source || recipe.sourceLabel
    if (typeof sourceKey === 'string' && sourceKey.toLowerCase() === 'community') {
      const rawId = recipe.id ?? recipe.recipeId
      const numericId = Number.parseInt(rawId, 10)
      if (Number.isFinite(numericId)) {
        return numericId
      }
    }

    const baseId = recipe.slug || recipe.originalId || recipe.href
    return baseId ? String(baseId) : null
  }

  const buildFavoritePayload = (recipe = {}, favoriteId) => {
    const sourceKeyRaw = recipe.sourceKey || recipe.source
    const sourceKey = typeof sourceKeyRaw === 'string' ? sourceKeyRaw.toLowerCase() : null
    const readyMinutes = recipe.readyInMinutes ?? (() => {
      const prep = Number.parseInt(recipe.prepTime, 10)
      const cook = Number.parseInt(recipe.cookTime, 10)
      const total = [prep, cook]
        .filter((value) => Number.isFinite(value) && value > 0)
        .reduce((sum, value) => sum + value, 0)
      return total > 0 ? total : null
    })()

    const parsedPrice = Number.parseFloat(recipe.price)
    const price = Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null
    const isPremium = Boolean(recipe.isPremium)
    const hasPurchased = Boolean(recipe.hasPurchased)

    let href = recipe.href
    if (!href) {
      if (favoriteId) {
        const query = sourceKey ? `?source=${encodeURIComponent(sourceKey)}` : ''
        href = `/recipes/${encodeURIComponent(favoriteId)}${query}`
      } else {
        href = '/recipes'
      }
    }

    return {
      id: favoriteId,
      recipeId: favoriteId,
      originalId: recipe.id,
      slug: recipe.slug || null,
      title: recipe.title || 'Untitled Recipe',
      image: recipe.image || '/placeholder-recipe.jpg',
      description: recipe.description || recipe.category || '',
      readyInMinutes: readyMinutes,
      servings: recipe.servings ?? null,
      healthScore: recipe.healthScore ?? null,
      sourceKey,
      href,
      price,
      isPremium,
      hasPurchased
    }
  }

  const handleFavoriteRedirect = (recipe) => {
    const favoriteId = getRecipeFavoriteId(recipe)
    if (!favoriteId) {
      return
    }

    if (!requireAuth('save favorite recipes')) {
      return
    }

    if (!isFavorite(favoriteId)) {
      const payload = buildFavoritePayload(recipe, favoriteId)
      addToFavorites(payload)
    }
  }

  const getNutritionBadge = (recipe) => {
    if (!recipe.nutrition) return null

    const { calories = 0, protein = 0, carbs = 0, fat = 0 } = recipe.nutrition

    if (protein >= 20) return { type: 'protein', label: 'High Protein', color: 'bg-green-100 text-green-800' }
    if (calories < 300) return { type: 'calorie', label: 'Low Cal', color: 'bg-blue-100 text-blue-800' }
    if (fat < 10) return { type: 'low-fat', label: 'Low Fat', color: 'bg-yellow-100 text-yellow-800' }
    return null
  }

  const RecipeCard = ({ recipe, onPurchase }) => {
    const [imageSrc, setImageSrc] = useState(recipe.image || '/placeholder-recipe.jpg')
    const [imageLoaded, setImageLoaded] = useState(false)
    const [imageError, setImageError] = useState(false)
    const favoriteId = getRecipeFavoriteId(recipe)
    const isRecipeFavorite = favoriteId ? isFavorite(favoriteId) : false

    useEffect(() => {
      let isMounted = true
      let objectUrl = null

      const resolveImage = async () => {
        const rawUrl = recipe.image?.toString() || ''

        if (!rawUrl) {
          if (isMounted) {
            setImageSrc('/placeholder-recipe.jpg')
            setImageLoaded(false)
            setImageError(false)
          }
          return
        }

        if (/^https?:/i.test(rawUrl) || /^data:/i.test(rawUrl)) {
          if (isMounted) {
            setImageSrc(rawUrl)
            setImageLoaded(false)
            setImageError(false)
          }
          return
        }

        try {
          const response = await fetch(rawUrl, { cache: 'no-store' })
          if (!response.ok) {
            throw new Error(`Failed to fetch recipe image (${response.status})`)
          }
          const blob = await response.blob()
          objectUrl = URL.createObjectURL(blob)
          if (isMounted) {
            setImageSrc(objectUrl)
            setImageLoaded(false)
            setImageError(false)
          }
        } catch (error) {
          console.error('Unable to resolve recipe image:', error)
          if (isMounted) {
            setImageSrc('/placeholder-recipe.jpg')
            setImageLoaded(false)
            setImageError(true)
          }
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl)
            objectUrl = null
          }
        }
      }

      resolveImage()

      return () => {
        isMounted = false
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl)
        }
      }
    }, [recipe.image])

    const nutritionBadge = getNutritionBadge(recipe)
    const normalizedSourceKey = (recipe.sourceKey || recipe.source || '').toString().toLowerCase()
    const rawPrice = recipe.price !== null && recipe.price !== undefined ? Number.parseFloat(recipe.price) : NaN
    const isCommunityRecipe = normalizedSourceKey === 'community'
    const alreadyPurchased = Boolean(recipe.hasPurchased)
    const isPremiumRecipe = isCommunityRecipe && Boolean(recipe.isPremium)
    const hasValidPrice = Number.isFinite(rawPrice) && rawPrice > 0
    const showPrice = isPremiumRecipe && hasValidPrice
    const formattedPrice = showPrice ? pesoFormatter.format(rawPrice) : null
    const requiresPurchase = showPrice && !alreadyPurchased

    const toMinutes = (value) => {
      if (typeof value === 'number') return value
      const parsed = Number.parseInt(value, 10)
      return Number.isFinite(parsed) ? parsed : null
    }

    const readyMinutes = toMinutes(recipe.readyInMinutes)
    const prepMinutes = toMinutes(recipe.prepTime)
    const cookMinutes = toMinutes(recipe.cookTime)
    const fallbackMinutes = (prepMinutes ?? 0) + (cookMinutes ?? 0)
    const displayReadyMinutes = readyMinutes ?? (fallbackMinutes > 0 ? fallbackMinutes : null)
    const isMealdb = normalizedSourceKey === 'mealdb'
    const showCookingTime = !isMealdb && displayReadyMinutes !== null
    const showServings = !isMealdb && (recipe.servings || recipe.servings === 0)

    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-transparent dark:border-gray-800 h-full flex flex-col">
        <div className="relative w-full flex-shrink-0 overflow-hidden aspect-[4/3]">
          <img
            src={imageSrc}
            alt={recipe.title}
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
            style={{ opacity: imageLoaded ? 1 : 0, transition: 'opacity 200ms ease-in-out' }}
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              if (!imageError) {
                setImageSrc('/placeholder-recipe.jpg')
                setImageLoaded(false)
                setImageError(true)
              }
            }}
          />
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              handleFavoriteRedirect(recipe)
            }}
            aria-label={isRecipeFavorite ? 'View favorites' : 'Add to favorites'}
            className={`absolute top-2 left-2 z-10 p-2 rounded-full transition-colors ${
              isRecipeFavorite
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-white/80 text-gray-700 hover:bg-red-100 dark:bg-gray-900/60 dark:text-gray-100'
            }`}
          >
            <Heart className="w-5 h-5" fill={isRecipeFavorite ? 'currentColor' : 'none'} />
          </button>
          <div className="absolute top-2 right-2 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-full">
            {recipe.source || 'MealDB'}
          </div>
        </div>
        <div className="p-5 flex flex-col flex-1">
          <h3 className="text-lg font-bold mb-2 line-clamp-2 text-olive-900 dark:text-olive-200">
            {recipe.title}
          </h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {nutritionBadge && (
              <span className={`text-xs px-2 py-1 rounded-full ${nutritionBadge.color}`}>
                {nutritionBadge.label}
              </span>
            )}
            {recipe.dietLabels && recipe.dietLabels.length > 0 && (
              <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 px-2 py-1 rounded-full">
                {recipe.dietLabels[0]}
              </span>
            )}
            {recipe.healthLabels && recipe.healthLabels.length > 0 && (
              <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 px-2 py-1 rounded-full">
                {recipe.healthLabels[0]}
              </span>
            )}
            {recipe.category && (
              <span className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 px-2 py-1 rounded-full">
                {recipe.category}
              </span>
            )}
            {recipe.cuisine && (
              <span className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200 px-2 py-1 rounded-full">
                {recipe.cuisine}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-sm text-olive-700 dark:text-olive-200 mb-4 flex-wrap gap-4">
            {showCookingTime && (
              <div className="flex items-center">
                <Clock className="w-4 h-4 mr-1 text-green-600" />
                <span>{displayReadyMinutes} min</span>
              </div>
            )}
            {showServings && (
              <div className="flex items-center">
                <Users className="w-4 h-4 mr-1 text-green-600" />
                <span>{recipe.servings || 4} servings</span>
              </div>
            )}
          </div>
          <div
            className={`flex items-center mt-auto gap-3 ${showPrice ? 'justify-between' : 'justify-end'}`}
          >
            {showPrice && (
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Price
                </span>
                <span className="text-lg font-semibold text-olive-800 dark:text-olive-200">
                  {formattedPrice}
                </span>
                {alreadyPurchased && (
                  <span className="text-xs font-medium text-green-600 dark:text-green-300">
                    Purchased
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              {requiresPurchase ? (
                <button
                  type="button"
                  onClick={() => onPurchase?.(recipe)}
                  className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium flex items-center group"
                >
                  Preview & Buy
                  <svg
                    className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <Link
                  href={`/recipes/${encodeURIComponent(
                    normalizedSourceKey === 'community'
                      ? recipe.slug || recipe.id
                      : recipe.id || recipe.originalId || recipe.slug
                  )}?source=${encodeURIComponent(recipe.sourceKey || recipe.source?.toLowerCase() || 'mealdb')}`}
                  className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium flex items-center group"
                >
                  View Recipe
                  <svg
                    className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen pt-20 bg-soft-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-olive-800 dark:text-olive-200 mb-4 font-fredoka">Recipes</h1>
            <p className="text-lg text-olive-700 dark:text-olive-200/80 font-fredoka">
              Discover amazing recipes from trusted food APIs
            </p>
        </div>

        {/* Search and Filters */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md border border-soft-200 dark:border-gray-800 p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-4">
            {/* Search */}
            <div className="relative xl:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-olive-500 h-5 w-5" />
              <input
                type="text"
                placeholder="Search recipes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input w-full pl-10 pr-4 py-2 border border-soft-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-olive-500 bg-white dark:bg-gray-800 text-olive-800 dark:text-gray-100 placeholder-olive-600 dark:placeholder-gray-400 font-fredoka"
              />
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="filter-input px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
            >
              <option value="">All Categories</option>
              {categories.map((category) => (
                <option key={category.idCategory} value={category.strCategory}>
                  {category.strCategory}
                </option>
              ))}
            </select>

            {/* Cuisine Filter */}
            <select
              value={selectedCuisine}
              onChange={(e) => setSelectedCuisine(e.target.value)}
              className="filter-input px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
            >
              <option value="">All Cuisines</option>
              {cuisines.map((cuisine) => (
                <option key={cuisine.strArea} value={cuisine.strArea}>
                  {cuisine.strArea}
                </option>
              ))}
            </select>

            {/* Ingredient Filter */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search by ingredient..."
                value={selectedIngredient}
                onChange={(e) => setSelectedIngredient(e.target.value)}
                className="filter-input px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent w-full bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400"
              />
              {selectedIngredient && selectedIngredient !== debouncedIngredient && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-400">
                  Searching...
                </div>
              )}
            </div>

            {/* Source Filter */}
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="filter-input px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
            >
              {sources.map((source) => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
            </select>

            {/* Diet Filter */}
            <select
              value={dietFilter}
              onChange={(e) => setDietFilter(e.target.value)}
              className="filter-input px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
            >
              {dietOptions.map((diet) => (
                <option key={diet.value} value={diet.value}>
                  {diet.label}
                </option>
              ))}
            </select>
          </div>

          {/* Nutrition Filter */}
          <div className="mb-4">
            <select
              value={nutritionFilter}
              onChange={(e) => setNutritionFilter(e.target.value)}
              className="filter-input px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
            >
              {nutritionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex flex-wrap gap-2 items-center">
              <p className="text-olive-700 dark:text-olive-200 font-fredoka">
                {recipes.length} recipe{recipes.length !== 1 ? 's' : ''} found
                {selectedSource !== 'all' && ` from ${sources.find(s => s.value === selectedSource)?.label}`}
              </p>

              {/* Active Filters Display */}
              <div className="flex flex-wrap gap-1 ml-4">
                {searchTerm && (
                  <span className="bg-olive-100 text-olive-800 dark:bg-olive-900/40 dark:text-olive-200 px-2 py-1 rounded-full text-xs">
                    Search: "{searchTerm}"
                  </span>
                )}
                {selectedCategory && (
                  <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 px-2 py-1 rounded-full text-xs">
                    Category: {selectedCategory}
                  </span>
                )}
                {selectedCuisine && (
                  <span className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 px-2 py-1 rounded-full text-xs">
                    Cuisine: {selectedCuisine}
                  </span>
                )}
                {debouncedIngredient && (
                  <span className="bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 px-2 py-1 rounded-full text-xs">
                    Ingredient: {debouncedIngredient}
                  </span>
                )}
                {dietFilter && (
                  <span className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200 px-2 py-1 rounded-full text-xs">
                    Diet: {dietOptions.find(d => d.value === dietFilter)?.label}
                  </span>
                )}
                {nutritionFilter && (
                  <span className="bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200 px-2 py-1 rounded-full text-xs">
                    Nutrition: {nutritionOptions.find(n => n.value === nutritionFilter)?.label}
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Link href="/cuisines" className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-2">
                <Utensils className="h-4 w-4" />
                Browse Cuisines
              </Link>
              <Link href="/recipes/create" className="bg-olive-600 text-white px-4 py-2 rounded-lg hover:bg-olive-700 transition-colors flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Recipe
              </Link>
            </div>
          </div>
        </div>

        {/* Recipes Grid */}
        {recipes.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-gray-400 dark:text-gray-500 mb-4">
              <Search className="h-16 w-16 mx-auto" />
            </div>
            <h3 className="text-xl font-semibold text-olive-800 dark:text-olive-200 mb-2">
              No recipes found
            </h3>
            <p className="text-olive-600 dark:text-olive-200/80 mb-4">
              {isInitialLoad
                ? 'Unable to load recipes. Please check your internet connection or try again later.'
                : 'Try adjusting your search criteria'
              }
            </p>
            <div className="flex justify-center gap-4">
              <Link href="/cuisines" className="text-olive-600 hover:text-olive-700 dark:text-olive-200 dark:hover:text-olive-100 font-medium">
                Browse cuisines →
              </Link>
              <button
                onClick={() => {
                  setSearchTerm('')
                  setSelectedCategory('')
                  setSelectedCuisine('')
                  setDietFilter('')
                  setNutritionFilter('')
                  setSelectedSource('mealdb')
                  setSelectedIngredient('')
                  setDebouncedIngredient('')
                }}
                className="text-olive-600 hover:text-olive-700 dark:text-olive-200 dark:hover:text-olive-100 font-medium"
              >
                Clear all filters →
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8 auto-rows-[minmax(26rem,_auto)]">
              {recipes.map((recipe, index) => (
                <RecipeCard
                  key={`${recipe.id}-${index}`}
                  recipe={recipe}
                  onPurchase={handleOpenPurchase}
                />
              ))}
            </div>

            {/* Load More Button */}
            {hasMore && !isInitialLoad && (
              <div className="text-center mt-8">
                <button
                  onClick={loadMoreRecipes}
                  disabled={isLoadingMore}
                  className={`px-6 py-3 text-white rounded-lg transition-colors flex items-center justify-center gap-2 font-medium mx-auto ${
                    isLoadingMore 
                      ? 'bg-olive-500 cursor-not-allowed' 
                      : 'bg-olive-600 hover:bg-olive-700'
                  }`}
                >
                  {isLoadingMore ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Loading...
                    </>
                  ) : (
                    'Load More Recipes'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      </div>
      {purchaseRecipe && (
        <RecipePurchaseModal
          isOpen={Boolean(purchaseRecipe)}
          onClose={handleClosePurchase}
          recipeId={purchaseRecipe.slug || purchaseRecipe.id}
          recipeTitle={purchaseRecipe.title}
          price={purchaseRecipe.price}
          onSuccess={handlePurchaseSuccess}
          requireAuth={requireAuth}
        />
      )}
    </>
  )
}
