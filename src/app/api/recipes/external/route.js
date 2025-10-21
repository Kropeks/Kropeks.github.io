import { NextResponse } from 'next/server'

import recipeAPI from '@/lib/recipeAPI'

const toSlug = (title, fallback = 'recipe') => {
  if (typeof title === 'string' && title.trim().length) {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }
  return fallback
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim()
    const limitParam = Number.parseInt(searchParams.get('limit') || '12', 10)
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 30) : 12

    let recipes = []

    if (search) {
      recipes = await recipeAPI.searchRecipesByNameMealDB(search)
    } else {
      recipes = await recipeAPI.getRandomRecipesMealDB(limit)
    }

    if (!Array.isArray(recipes)) {
      recipes = []
    }

    const enriched = await recipeAPI.enrichRecipesWithNutritionFatSecret(recipes)

    const fallbackEnriched = await Promise.all(
      enriched.map(async (recipe) => {
        if (recipe?.nutrition && Number.isFinite(recipe.nutrition?.calories) && recipe.nutrition.calories > 0) {
          return recipe
        }

        try {
          const ingredientQuery = recipe.ingredients
            ?.slice(0, 5)
            .map((ingredient) => ingredient?.original || ingredient?.name || '')
            .filter(Boolean)
            .join(', ')

          if (ingredientQuery) {
            const nutrition = await recipeAPI.getNutritionInfo(ingredientQuery)
            if (nutrition) {
              recipe.nutrition = {
                calories: nutrition.calories ?? recipe.nutrition?.calories ?? null,
                protein: nutrition.protein ?? recipe.nutrition?.protein ?? null,
                carbs: nutrition.carbs ?? recipe.nutrition?.carbs ?? null,
                fat: nutrition.fat ?? nutrition.fats ?? recipe.nutrition?.fat ?? null,
                fiber: nutrition.fiber ?? recipe.nutrition?.fiber ?? null,
                sugar: nutrition.sugar ?? recipe.nutrition?.sugar ?? null,
                isAutoCalculated: true
              }
            }
          }
        } catch (nutriError) {
          console.warn('Failed to calculate fallback nutrition for MealDB recipe:', nutriError)
        }

        return recipe
      })
    )

    const normalized = fallbackEnriched.slice(0, limit).map((recipe) => {
      const baseId = recipe.id || recipe.originalId || recipe.slug || toSlug(recipe.title)
      const slug = recipe.id || baseId
      return {
        id: `mealdb-${baseId}`,
        slug: slug?.toString() || `mealdb-${baseId}`,
        title: recipe.title || 'Untitled Recipe',
        description: recipe.instructions?.split('\n')?.[0]?.trim() || '',
        category: recipe.category || 'Other',
        cuisine: recipe.cuisine || null,
        image: recipe.image || null,
        servings: recipe.servings ?? null,
        nutrition: recipe.nutrition || null,
        calories: recipe.nutrition?.calories ?? null,
        protein: recipe.nutrition?.protein ?? null,
        carbs: recipe.nutrition?.carbs ?? null,
        fat: recipe.nutrition?.fat ?? recipe.nutrition?.fats ?? null,
        source: 'mealdb'
      }
    })

    return NextResponse.json({ recipes: normalized })
  } catch (error) {
    console.error('Failed to fetch external recipes from MealDB:', error)
    return NextResponse.json({ error: 'Failed to fetch external recipes' }, { status: 500 })
  }
}
