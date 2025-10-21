import { NextResponse } from 'next/server'
import recipeAPI from '@/lib/recipeAPI.js'
import { auth } from '@/auth'
import { queryOne, query } from '@/lib/db'

const toDecimalOrNull = (value) => {
  if (value === null || value === undefined) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

const coerceStringOrNull = (value) => {
  if (value === undefined || value === null) return null
  const trimmed = value.toString().trim()
  return trimmed.length ? trimmed : null
}

export async function GET(request, { params }) {
  try {
    const { id } = params
    const decodedId = decodeURIComponent(id)
    const { searchParams } = new URL(request.url)
    const sourceParam = searchParams.get('source')?.toLowerCase()
    const source = sourceParam || 'community'

    const session = await auth()
    let viewerId = null
    if (session?.user?.id !== undefined && session?.user?.id !== null) {
      const parsedViewerId = Number.parseInt(session.user.id, 10)
      if (Number.isInteger(parsedViewerId)) {
        viewerId = parsedViewerId
      }
    }

    console.log('🔍 API Route - Recipe request:', { id: decodedId, source })

    if (!decodedId) {
      return NextResponse.json(
        { error: 'Recipe ID is required' },
        { status: 400 }
      )
    }

    console.log('🔍 API Route - Checking community database first...')
    const communityRecipe = await recipeAPI.getCommunityRecipeById(decodedId)
    if (communityRecipe) {
      const priceValue = communityRecipe.price !== null && communityRecipe.price !== undefined
        ? Number.parseFloat(communityRecipe.price)
        : null
      const isPremiumRecipe = communityRecipe.isPremium && Number.isFinite(priceValue) && priceValue > 0
      const ownerId = communityRecipe.ownerId ?? communityRecipe.userId ?? null
      const isOwner = ownerId !== null && viewerId !== null && Number(ownerId) === viewerId
      let hasPurchased = false

      if (isPremiumRecipe && !isOwner) {
        if (!viewerId) {
          return NextResponse.json(
            {
              error: 'Authentication required',
              message: 'Sign in and purchase this premium recipe to unlock the full details.',
              requiresAuthentication: true,
              requiresPurchase: true,
              recipe: {
                id: communityRecipe.id,
                slug: communityRecipe.slug,
                title: communityRecipe.title,
                price: priceValue,
                previewText: communityRecipe.previewText || null
              }
            },
            { status: 401 }
          )
        }

        try {
          const purchaseRow = await queryOne(
            'SELECT id FROM recipe_purchases WHERE user_id = ? AND recipe_id = ? LIMIT 1',
            [viewerId, communityRecipe.databaseId]
          )
          hasPurchased = Boolean(purchaseRow?.id)
        } catch (error) {
          if (error?.code === 'ER_NO_SUCH_TABLE') {
            console.warn('recipe_purchases table missing during premium check; treating as not purchased.')
            hasPurchased = false
          } else {
            throw error
          }
        }

        if (!hasPurchased) {
          return NextResponse.json(
            {
              error: 'Payment required',
              message: 'Purchase this premium recipe to unlock the full instructions and ingredient list.',
              requiresPurchase: true,
              recipe: {
                id: communityRecipe.id,
                slug: communityRecipe.slug,
                title: communityRecipe.title,
                price: priceValue,
                previewText: communityRecipe.previewText || null
              }
            },
            { status: 402 }
          )
        }
      }

      communityRecipe.hasPurchased = isOwner || hasPurchased
      communityRecipe.isOwner = isOwner
      communityRecipe.viewerId = viewerId

      console.log('✅ API Route - Found community recipe:', {
        id: communityRecipe.id,
        title: communityRecipe.title
      })

      return NextResponse.json({
        ...communityRecipe,
        source: 'community',
        sourceKey: 'community'
      })
    }

    if (source === 'community') {
      console.warn('⚠️ API Route - Community recipe not found:', decodedId)
      return NextResponse.json(
        {
          error: 'Recipe not found',
          message: 'This recipe was not found in the community database.',
          debug: { id: decodedId, source }
        },
        { status: 404 }
      )
    }

    if (!['mealdb'].includes(source)) {
      return NextResponse.json(
        { error: 'Invalid source. Supported sources: mealdb, community' },
        { status: 400 }
      )
    }

    console.log('🔍 API Route - Fetching from external source:', source)
    const recipe = await recipeAPI.getRecipeWithNutrition(decodedId, source)

    if (!recipe) {
      console.warn('⚠️ API Route - No recipe found in external source')
      return NextResponse.json(
        {
          error: 'Recipe not found',
          message: 'No recipe was found using the provided identifier.',
          debug: { id: decodedId, source }
        },
        { status: 404 }
      )
    }

    console.log('✅ API Route - Recipe found successfully:', {
      id: recipe.id,
      title: recipe.title,
      source: recipe.source,
      hasInstructions: !!recipe.instructions && recipe.instructions.length > 0,
      hasIngredients: !!recipe.ingredients?.length,
      hasNutrition: !!recipe.nutrition
    })

    return NextResponse.json(recipe)
  } catch (error) {
    console.error('❌ API Route - Error fetching recipe:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch recipe',
        details: error.message,
        debug: {
          id: params.id,
          source: request.nextUrl.searchParams.get('source') || 'mealdb',
          stack: error.stack
        }
      },
      { status: 500 }
    )
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = params
    const decodedId = decodeURIComponent(id)

    if (!decodedId) {
      return NextResponse.json({ error: 'Recipe identifier is required' }, { status: 400 })
    }

    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const existing = await queryOne(
      'SELECT id, slug, user_id FROM recipes WHERE slug = ? OR id = ? LIMIT 1',
      [decodedId, decodedId]
    )

    if (!existing) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
    }

    const ownerId = Number.parseInt(existing.user_id, 10)
    if (!Number.isNaN(ownerId) && ownerId !== Number.parseInt(session.user.id, 10)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const payload = await request.json()

    const updates = []
    const paramsList = []

    if (payload.title !== undefined) {
      updates.push('title = ?')
      paramsList.push(coerceStringOrNull(payload.title))
    }

    if (payload.description !== undefined) {
      updates.push('description = ?')
      paramsList.push(coerceStringOrNull(payload.description))
    }

    if (payload.category !== undefined) {
      updates.push('category = ?')
      paramsList.push(coerceStringOrNull(payload.category))
    }

    if (payload.tags && Array.isArray(payload.tags)) {
      updates.push('tags = ?')
      paramsList.push(JSON.stringify(payload.tags))
    }

    if (updates.length) {
      updates.push('updated_at = NOW(3)')
      await query(`UPDATE recipes SET ${updates.join(', ')} WHERE id = ?`, [...paramsList, existing.id])
    }

    if (payload.nutrition && typeof payload.nutrition === 'object') {
      const nutrition = payload.nutrition

      const existingNutrition = await queryOne(
        'SELECT recipe_id FROM nutritional_info WHERE recipe_id = ? LIMIT 1',
        [existing.id]
      )

      const nutritionColumns = [
        toDecimalOrNull(nutrition.calories),
        toDecimalOrNull(nutrition.protein),
        toDecimalOrNull(nutrition.carbs),
        toDecimalOrNull(nutrition.fat ?? nutrition.fats),
        nutrition.isAutoCalculated ? 1 : 0
      ]

      if (existingNutrition) {
        await query(
          `UPDATE nutritional_info
             SET calories = ?, protein = ?, carbs = ?, fats = ?, is_auto_calculated = ?, updated_at = NOW(3)
           WHERE recipe_id = ?`,
          [...nutritionColumns, existing.id]
        )
      } else {
        await query(
          `INSERT INTO nutritional_info (recipe_id, calories, protein, carbs, fats, is_auto_calculated, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW(3))
           ON DUPLICATE KEY UPDATE
             calories = VALUES(calories),
             protein = VALUES(protein),
             carbs = VALUES(carbs),
             fats = VALUES(fats),
             is_auto_calculated = VALUES(is_auto_calculated),
             updated_at = NOW(3)` ,
          [existing.id, ...nutritionColumns]
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ API Route - Error updating recipe:', error)
    return NextResponse.json({ error: error.message || 'Failed to update recipe' }, { status: 500 })
  }
}
