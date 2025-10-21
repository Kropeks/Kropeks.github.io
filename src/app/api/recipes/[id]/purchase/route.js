import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

import { auth } from '@/auth'
import { query, queryOne } from '@/lib/db'
import { NotificationService } from '@/lib/notifications/service'

const parseViewerId = (session) => {
  const rawId = session?.user?.id
  if (rawId === undefined || rawId === null) {
    return null
  }
  const parsed = Number.parseInt(rawId, 10)
  return Number.isInteger(parsed) ? parsed : null
}

const RECIPE_PURCHASES_SCHEMA_CACHE_TTL = 60_000
let recipePurchasesSchemaCache = null
let recipePurchasesSchemaLastChecked = 0

const ensureRecipePurchasesTable = async () => {
  const result = await queryOne("SHOW TABLES LIKE 'recipe_purchases'")
  return Boolean(result)
}

const getRecipePurchasesSchema = async () => {
  const now = Date.now()
  if (
    recipePurchasesSchemaCache !== null &&
    now - recipePurchasesSchemaLastChecked < RECIPE_PURCHASES_SCHEMA_CACHE_TTL
  ) {
    return recipePurchasesSchemaCache
  }

  const columns = await query(
    'SHOW COLUMNS FROM recipe_purchases'
  )

  const schema = columns.reduce((acc, column) => {
    acc[column.Field] = true
    return acc
  }, {})

  recipePurchasesSchemaCache = schema
  recipePurchasesSchemaLastChecked = now
  return schema
}

export async function POST(request, { params }) {
  try {
    const session = await auth()
    const viewerId = parseViewerId(session)

    if (!viewerId) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'You must be signed in to purchase premium recipes.'
        },
        { status: 401 }
      )
    }

    let payload
    try {
      payload = await request.json()
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Invalid JSON payload',
          message: 'The request body must be valid JSON.'
        },
        { status: 400 }
      )
    }

    const {
      paymentMethod = 'card',
      buyer = {},
      cardDetails = {}
    } = payload || {}

    if (!['card', 'gcash'].includes(paymentMethod)) {
      return NextResponse.json(
        {
          error: 'Unsupported payment method',
          message: 'Only card and GCash payments are supported in the sandbox.'
        },
        { status: 400 }
      )
    }

    if (paymentMethod === 'card') {
      const requiredFields = ['cardNumber', 'expMonth', 'expYear', 'cvc']
      const missing = requiredFields.filter((field) => {
        const value = cardDetails?.[field]
        return value === undefined || value === null || String(value).trim().length === 0
      })

      if (missing.length) {
        return NextResponse.json(
          {
            error: 'Incomplete card details',
            message: `Missing required card fields: ${missing.join(', ')}`
          },
          { status: 400 }
        )
      }
    }

    const rawId = params?.id ? decodeURIComponent(params.id) : null
    if (!rawId) {
      return NextResponse.json(
        {
          error: 'Recipe identifier required',
          message: 'A valid recipe identifier must be provided in the request URL.'
        },
        { status: 400 }
      )
    }

    const numericId = Number.parseInt(rawId, 10)
    const fallbackId = Number.isNaN(numericId) ? -1 : numericId

    const recipe = await queryOne(
      `SELECT id, slug, title, description, preview_text, image, user_id, price, is_premium
         FROM recipes
        WHERE slug = ? OR id = ?
        LIMIT 1`,
      [rawId, fallbackId]
    )

    if (!recipe) {
      return NextResponse.json(
        {
          error: 'Recipe not found',
          message: 'Unable to locate the requested recipe.'
        },
        { status: 404 }
      )
    }

    const recipeOwnerId = parseViewerId({ user: { id: recipe.user_id } })
    if (recipeOwnerId && recipeOwnerId === viewerId) {
      return NextResponse.json(
        {
          error: 'Cannot purchase own recipe',
          message: 'Recipe owners already have full access to their content.'
        },
        { status: 400 }
      )
    }

    const price = recipe.price !== null && recipe.price !== undefined ? Number.parseFloat(recipe.price) : 0
    const isPremiumRecipe = recipe.is_premium === 1 || recipe.is_premium === true || price > 0

    if (!isPremiumRecipe || !(price > 0)) {
      return NextResponse.json(
        {
          error: 'Purchase not required',
          message: 'This recipe does not require a purchase to access.'
        },
        { status: 400 }
      )
    }

    const purchasesTableExists = await ensureRecipePurchasesTable()
    if (!purchasesTableExists) {
      return NextResponse.json(
        {
          error: 'Missing database table',
          message: "The 'recipe_purchases' table is missing. Run the latest database migrations and try again."
        },
        { status: 500 }
      )
    }

    const existingPurchase = await queryOne(
      `SELECT id
         FROM recipe_purchases
        WHERE user_id = ? AND recipe_id = ?
        LIMIT 1`,
      [viewerId, recipe.id]
    )

    if (existingPurchase) {
      return NextResponse.json({
        success: true,
        alreadyPurchased: true,
        recipeId: recipe.id,
        recipeSlug: recipe.slug,
        amountPaid: price,
        message: 'You already own this recipe. Enjoy cooking!'
      })
    }

    const transactionId = `sandbox_${randomUUID()}`
    const buyerName = typeof buyer?.name === 'string' ? buyer.name.trim() : null
    const buyerEmail = typeof buyer?.email === 'string' ? buyer.email.trim() : null

    const schema = await getRecipePurchasesSchema()

    const insertColumns = ['user_id', 'recipe_id']
    const placeholders = ['?', '?']
    const insertValues = [viewerId, recipe.id]

    if (schema.amount_paid) {
      insertColumns.push('amount_paid')
      placeholders.push('?')
      insertValues.push(price)
    }

    if (schema.payment_method) {
      insertColumns.push('payment_method')
      placeholders.push('?')
      insertValues.push(paymentMethod)
    }

    if (schema.transaction_id) {
      insertColumns.push('transaction_id')
      placeholders.push('?')
      insertValues.push(transactionId)
    }

    if (schema.purchase_date) {
      insertColumns.push('purchase_date')
      placeholders.push('?')
      insertValues.push(new Date())
    }

    if (schema.created_at && !schema.purchase_date) {
      insertColumns.push('created_at')
      placeholders.push('?')
      insertValues.push(new Date())
    }

    if (schema.updated_at) {
      insertColumns.push('updated_at')
      placeholders.push('?')
      insertValues.push(new Date())
    }

    const insertSql = `INSERT INTO recipe_purchases (${insertColumns.join(', ')}) VALUES (${placeholders.join(', ')})`
    const insertResult = await query(insertSql, insertValues)

    if (insertResult?.affectedRows === 1 && recipeOwnerId && recipeOwnerId !== viewerId) {
      try {
        const actor = await queryOne('SELECT name FROM users WHERE id = ? LIMIT 1', [viewerId])
        const actorName = actor?.name || 'Someone'
        const previewText = recipe?.preview_text || recipe?.description || recipe?.title || ''
        const postImage = recipe?.image || null

        await NotificationService.createNotification({
          userId: String(recipeOwnerId),
          actorId: String(viewerId),
          type: 'recipe_purchase',
          title: 'Your recipe was purchased',
          metadata: {
            recipeId: recipe.id,
            recipeSlug: recipe.slug,
            transactionId,
            amountPaid: price,
            previewText,
            postImage,
            actorName,
          },
        })
      } catch (notifyError) {
        console.warn('[notifications] Failed to create purchase notification', notifyError)
      }
    }

    return NextResponse.json({
      success: true,
      recipeId: recipe.id,
      recipeSlug: recipe.slug,
      transactionId,
      amountPaid: price,
      paymentMethod,
      buyer: {
        name: buyerName,
        email: buyerEmail
      },
      message: 'Payment recorded. You now have access to the full recipe.'
    })
  } catch (error) {
    console.error('Error processing recipe purchase:', error)
    return NextResponse.json(
      {
        error: 'Failed to process recipe purchase',
        message: error?.message || 'An unexpected error occurred.'
      },
      { status: 500 }
    )
  }
}
