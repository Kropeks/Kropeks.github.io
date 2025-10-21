import { NextResponse } from 'next/server'
import path from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'

import { auth } from '@/auth'
import { query, queryOne, transaction } from '@/lib/db'
import { checkUserSubscription } from '@/lib/subscription'
import recipeAPI from '@/lib/recipeAPI'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'recipes')

const toNumberOrNull = (value, parser = Number.parseInt) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = parser(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

const buildIngredientNutritionQuery = (ingredients = []) => {
  return ingredients
    .map((ingredient) => {
      if (!ingredient || typeof ingredient !== 'object') return ''
      const parts = []
      const amount = ingredient.amount?.toString().trim()
      const unit = ingredient.unit?.toString().trim()
      const name = ingredient.name?.toString().trim()

      if (amount) parts.push(amount)
      if (unit) parts.push(unit)
      if (name) parts.push(name)

      return parts.join(' ').trim()
    })
    .filter(Boolean)
    .join(', ')
}

const toDecimalOrNull = (value) => {
  if (value === null || value === undefined) return null
  const stringValue = value?.toString().trim()
  if (!stringValue) return null
  const parsed = Number.parseFloat(stringValue)
  return Number.isFinite(parsed) ? parsed : null
}

const toDecimalTwoPlacesOrNull = (value) => {
  const parsed = toDecimalOrNull(value)
  if (parsed === null) return null
  return Number.parseFloat(parsed.toFixed(2))
}

const normalizeDifficulty = (value) => {
  const normalized = value?.toString().toLowerCase().trim()
  const allowed = new Set(['easy', 'medium', 'hard'])
  return allowed.has(normalized) ? normalized : 'medium'
}

const generateSlug = (title) => {
  const base = title
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const suffix = randomUUID().slice(0, 8)
  const safeBase = base || 'recipe'
  return `${safeBase}-${suffix}`
}

const sanitizeValue = (value) => {
  if (value === undefined || value === null) return null

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  return value
}


let recipePurchasesTableExistsCache = null
let recipePurchasesTableLastChecked = 0
const RECIPE_PURCHASES_TABLE_CACHE_TTL = 60_000

const ensureRecipePurchasesTable = async () => {
  const now = Date.now()
  if (
    recipePurchasesTableExistsCache !== null &&
    now - recipePurchasesTableLastChecked < RECIPE_PURCHASES_TABLE_CACHE_TTL
  ) {
    return recipePurchasesTableExistsCache
  }

  try {
    const result = await queryOne(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'recipe_purchases'
        LIMIT 1`
    )
    recipePurchasesTableExistsCache = Boolean(result?.table_name || result?.TABLE_NAME)
  } catch (error) {
    console.warn('Failed to verify recipe_purchases table presence:', error?.message || error)
    recipePurchasesTableExistsCache = false
  }

  recipePurchasesTableLastChecked = now
  return recipePurchasesTableExistsCache
}

const mapRecipeRow = (row, viewerId = null) => {
  const prepTime = toNumberOrNull(row.prep_time)
  const cookTime = toNumberOrNull(row.cook_time)
  const totalTime = (prepTime ?? 0) + (cookTime ?? 0)
  const readyInMinutes = totalTime > 0 ? totalTime : null

  let ownerId = null
  if (row.user_id !== null && row.user_id !== undefined) {
    const parsedOwnerId = Number.parseInt(row.user_id, 10)
    ownerId = Number.isInteger(parsedOwnerId) ? parsedOwnerId : null
  }

  const isOwner = ownerId !== null && viewerId !== null && ownerId === viewerId

  return {
    id: row.id,
    slug: row.slug || `recipe-${row.id}`,
    title: row.title || 'Untitled Recipe',
    description: row.description || '',
    instructions: row.instructions || 'No instructions provided',
    prepTime: prepTime ?? 0,
    cookTime: cookTime ?? 0,
    readyInMinutes,
    servings: row.servings || 0,
    difficulty: row.difficulty || 'easy',
    category: row.category || 'other',
    cuisine: row.cuisine || '',
    image: row.image || '/placeholder-recipe.jpg',
    isPremium: Boolean(row.is_premium),
    price: row.price !== null && row.price !== undefined ? Number.parseFloat(row.price) : null,
    previewText: row.preview_text || null,
    status: row.status || 'draft',
    isPublic: Boolean(row.is_public),
    approvalStatus: row.approval_status || 'pending',
    creator: {
      id: row.user_id,
      name: row.creator_name || 'Anonymous'
    },
    ownerId,
    hasPurchased: isOwner || Boolean(row.purchase_id),
    purchaseId: row.purchase_id || null,
    purchasedAt: row.purchase_created_at || null,
    isOwner,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    calories: toDecimalOrNull(row.nutrition_calories ?? row.calories ?? row.total_calories),
    protein: toDecimalOrNull(row.nutrition_protein ?? row.protein ?? row.total_protein),
    carbs: toDecimalOrNull(row.nutrition_carbs ?? row.carbs ?? row.total_carbs),
    fat: toDecimalOrNull(row.nutrition_fats ?? row.fat ?? row.total_fat),
    nutrition: row.nutrition_calories !== undefined
      ? {
          calories: toDecimalOrNull(row.nutrition_calories),
          protein: toDecimalOrNull(row.nutrition_protein),
          carbs: toDecimalOrNull(row.nutrition_carbs),
          fat: toDecimalOrNull(row.nutrition_fats),
          fiber: toDecimalOrNull(row.nutrition_fiber),
          sugar: toDecimalOrNull(row.nutrition_sugar),
          sodium: toDecimalOrNull(row.nutrition_sodium),
          cholesterol: toDecimalOrNull(row.nutrition_cholesterol),
          isAutoCalculated: row.nutrition_is_auto_calculated === 1
        }
      : null
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')?.trim()
    const cuisine = searchParams.get('cuisine')?.trim()
    const search = searchParams.get('query')?.trim() || searchParams.get('search')?.trim()
    const mine = searchParams.get('mine') === 'true'
    const purchased = searchParams.get('purchased') === 'true'
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(50, Math.max(1, Number.parseInt(searchParams.get('limit') || '12', 10)))
    const offset = (page - 1) * limit

    const session = await auth()

    let viewerId = null
    if (session?.user?.id !== undefined && session?.user?.id !== null) {
      const parsedViewerId = Number.parseInt(session.user.id, 10)
      if (Number.isInteger(parsedViewerId)) {
        viewerId = parsedViewerId
      }
    }

    if (mine && purchased) {
      return NextResponse.json(
        {
          error: 'Invalid filter combination',
          message: 'You cannot request both personal and purchased recipes simultaneously.'
        },
        { status: 400 }
      )
    }

    const conditions = []
    const params = []

    let userIdFilter = null
    if (mine) {
      if (!viewerId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userIdFilter = viewerId
      conditions.push('r.user_id = ?')
      params.push(userIdFilter)
    }

    const hasRecipePurchasesTable = await ensureRecipePurchasesTable()

    if (purchased) {
      if (!viewerId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      if (!hasRecipePurchasesTable) {
        return NextResponse.json(
          {
            error: 'Missing database table',
            message: "The 'recipe_purchases' table is unavailable. Run the latest database migrations and try again."
          },
          { status: 500 }
        )
      }

      userIdFilter = viewerId
      conditions.push('rp.user_id = ?')
      params.push(viewerId)
    }

    if (!mine && !purchased) {
      conditions.push("r.status = 'PUBLISHED'")
      conditions.push("r.approval_status = 'approved'")
    }

    if (category) {
      conditions.push('r.category = ?')
      params.push(category)
    }

    if (cuisine) {
      conditions.push('r.cuisine = ?')
      params.push(cuisine)
    }

    if (search) {
      conditions.push('(r.title LIKE ? OR r.description LIKE ? OR r.slug LIKE ?)')
      const likeTerm = `%${search}%`
      params.push(likeTerm, likeTerm, likeTerm)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const includePurchaseJoin = Boolean(viewerId && hasRecipePurchasesTable && !purchased)
    const basePurchaseSelect = includePurchaseJoin ? ', rp.id AS purchase_id, rp.created_at AS purchase_created_at' : ''
    const basePurchaseJoin = includePurchaseJoin
      ? 'LEFT JOIN recipe_purchases rp ON rp.recipe_id = r.id AND rp.user_id = ?'
      : ''

    const purchasedSelect = purchased ? ', rp.id AS purchase_id, rp.created_at AS purchase_created_at' : ''
    const purchasedJoin = purchased ? 'INNER JOIN recipe_purchases rp ON rp.recipe_id = r.id' : ''

    const purchaseSelect = purchased ? purchasedSelect : basePurchaseSelect
    const purchaseJoin = purchased ? purchasedJoin : basePurchaseJoin

    const listParams = [...params]
    if (includePurchaseJoin) {
      listParams.push(viewerId)
    }

    const countParams = [...params]
    if (includePurchaseJoin) {
      countParams.push(viewerId)
    }

    const recipes = await query(
      `SELECT
         r.id,
         r.slug,
         r.title,
         r.description,
         r.instructions,
         r.image,
         r.is_premium,
         r.price,
         r.preview_text,
         r.prep_time,
         r.cook_time,
         r.servings,
         r.difficulty,
         r.category,
         r.cuisine,
         r.user_id,
         r.status,
         r.is_public,
         r.approval_status,
         r.submitted_at,
         u.name AS creator_name,
         r.created_at,
         r.updated_at,
         ni.calories AS nutrition_calories,
         ni.protein AS nutrition_protein,
         ni.carbs AS nutrition_carbs,
         ni.fats AS nutrition_fats,
         ni.fiber AS nutrition_fiber,
         ni.sugar AS nutrition_sugar,
         ni.sodium AS nutrition_sodium,
         ni.cholesterol AS nutrition_cholesterol,
         ni.is_auto_calculated AS nutrition_is_auto_calculated
         ${purchaseSelect}
       FROM recipes r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN nutritional_info ni ON ni.recipe_id = r.id
       ${purchaseJoin}
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [...listParams, limit, offset]
    )

    const countResult = await queryOne(
      `SELECT COUNT(r.id) AS total
       FROM recipes r
       ${purchasedJoin}
       ${whereClause}`,
      countParams
    )

    const total = countResult?.total ?? 0

    return NextResponse.json({
      recipes: recipes.map((row) => mapRecipeRow(row, viewerId)),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        mine,
        userId: userIdFilter
      }
    })
  } catch (error) {
    console.error('Error fetching recipes:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch recipes',
        message: error.message
      },
      { status: 500 }
    )
  }
}

export async function POST(request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()

    const title = formData.get('title')?.toString().trim()
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const description = formData.get('description')?.toString().trim() || null
    const instructionsText = formData.get('instructions')?.toString().trim() || ''
    if (!instructionsText) {
      return NextResponse.json({ error: 'Instructions are required' }, { status: 400 })
    }

    const prepTime = toNumberOrNull(formData.get('prepTime'))
    const cookTime = toNumberOrNull(formData.get('cookTime'))
    const servings = toNumberOrNull(formData.get('servings'))
    const difficulty = formData.get('difficulty')?.toString().trim() || 'medium'
    const category = formData.get('category')?.toString().trim() || null
    const cuisine = formData.get('cuisine')?.toString().trim() || null
    const priceInput = toDecimalOrNull(formData.get('price'))
    const previewTextRaw = formData.get('previewText')?.toString().trim() || ''
    const previewText = previewTextRaw ? previewTextRaw.slice(0, 250) : null

    const ingredientsRaw = formData.get('ingredients')?.toString() || '[]'
    let ingredients = []
    try {
      const parsed = JSON.parse(ingredientsRaw)
      if (Array.isArray(parsed)) {
        ingredients = parsed
      }
    } catch (error) {
      console.warn('Unable to parse ingredients payload:', error)
    }

    const nutritionRaw = formData.get('nutrition')?.toString() || '{}'
    let nutritionPayload = {}
    try {
      const parsedNutrition = JSON.parse(nutritionRaw)
      if (parsedNutrition && typeof parsedNutrition === 'object') {
        nutritionPayload = parsedNutrition
      }
    } catch (nutritionError) {
      console.warn('Unable to parse nutrition payload:', nutritionError)
    }

    let nutritionData = {
      calories: toDecimalTwoPlacesOrNull(nutritionPayload.calories),
      protein: toDecimalTwoPlacesOrNull(nutritionPayload.protein),
      carbs: toDecimalTwoPlacesOrNull(nutritionPayload.carbs),
      fats: toDecimalTwoPlacesOrNull(nutritionPayload.fats ?? nutritionPayload.fat),
      fiber: toDecimalTwoPlacesOrNull(nutritionPayload.fiber),
      sugar: toDecimalTwoPlacesOrNull(nutritionPayload.sugar),
      sodium: toDecimalTwoPlacesOrNull(nutritionPayload.sodium),
      cholesterol: toDecimalTwoPlacesOrNull(nutritionPayload.cholesterol),
      isAutoCalculated: nutritionPayload.isAutoCalculated !== false
    }

    if (nutritionData.isAutoCalculated) {
      const ingredientQuery = buildIngredientNutritionQuery(ingredients)

      if (ingredientQuery) {
        try {
          const autoNutrition = await recipeAPI.getNutritionInfo(ingredientQuery)
          if (autoNutrition) {
            nutritionData = {
              calories: toDecimalTwoPlacesOrNull(autoNutrition.calories),
              protein: toDecimalTwoPlacesOrNull(autoNutrition.protein),
              carbs: toDecimalTwoPlacesOrNull(autoNutrition.carbs),
              fats: toDecimalTwoPlacesOrNull(autoNutrition.fat ?? autoNutrition.fats),
              fiber: toDecimalTwoPlacesOrNull(autoNutrition.fiber),
              sugar: toDecimalTwoPlacesOrNull(autoNutrition.sugar),
              sodium: toDecimalTwoPlacesOrNull(autoNutrition.sodium),
              cholesterol: toDecimalTwoPlacesOrNull(autoNutrition.cholesterol),
              isAutoCalculated: true
            }
          } else {
            nutritionData.isAutoCalculated = false
          }
        } catch (autoNutritionError) {
          console.warn('Failed to auto-calculate nutrition:', autoNutritionError?.message || autoNutritionError)
          nutritionData.isAutoCalculated = false
        }
      } else {
        nutritionData.isAutoCalculated = false
      }
    }

    const imageUrl = formData.get('imageUrl')?.toString().trim() || null
    const imageFile = formData.get('image')
    let storedImagePath = imageUrl || null

    if (imageFile && typeof imageFile === 'object' && 'arrayBuffer' in imageFile && imageFile.size > 0) {
      await mkdir(UPLOAD_DIR, { recursive: true })
      const arrayBuffer = await imageFile.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const extension = path.extname(imageFile.name || '') || '.png'
      const fileName = `${randomUUID()}${extension}`
      await writeFile(path.join(UPLOAD_DIR, fileName), buffer)
      storedImagePath = `/uploads/recipes/${fileName}`
    }

    const instructionSteps = instructionsText
      .split(/\r?\n/)
      .map((step) => step.trim())
      .filter(Boolean)

    const now = new Date()
    const normalizedDifficulty = normalizeDifficulty(difficulty)
    const normalizedCategory = category || null
    const normalizedCuisine = cuisine || null

    const parsedUserId = Number.parseInt(session.user.id, 10)
    if (!Number.isInteger(parsedUserId)) {
      throw new Error('Authenticated user does not have a numeric ID required by this database schema.')
    }

    const slug = generateSlug(title)

    const subscription = await checkUserSubscription(parsedUserId)
    const hasPremiumAccess = Boolean(subscription?.isPremium)

    let monetization = {
      isPremium: false,
      price: null,
      previewText: null
    }

    if (priceInput !== null) {
      if (!hasPremiumAccess) {
        return NextResponse.json({ error: 'Premium subscription required to set a price' }, { status: 403 })
      }

      if (priceInput < 0) {
        return NextResponse.json({ error: 'Price must be zero or greater' }, { status: 400 })
      }

      monetization = {
        isPremium: priceInput > 0,
        price: priceInput,
        previewText: null
      }
    }

    if (previewText) {
      if (!hasPremiumAccess) {
        return NextResponse.json({ error: 'Premium subscription required to set preview text' }, { status: 403 })
      }
      monetization.previewText = previewText
    }

    await transaction(async (connection) => {
      const [recipeColumns] = await connection.query('SHOW COLUMNS FROM recipes')
      const recipeColumnSet = new Set(recipeColumns.map((column) => column.Field))

      const addRecipeColumn = (columns, values, column, value) => {
        if (!recipeColumnSet.has(column)) {
          return
        }
        columns.push(`\`${column}\``)
        values.push(sanitizeValue(value))
      }

      let persistedDifficulty = normalizedDifficulty
      const difficultyColumn = recipeColumns.find((column) => column.Field === 'difficulty')
      if (difficultyColumn?.Type?.startsWith('enum')) {
        const enumValues = difficultyColumn.Type
          .slice(difficultyColumn.Type.indexOf('(') + 1, difficultyColumn.Type.lastIndexOf(')'))
          .split(',')
          .map((item) => item.trim().replace(/^'|'$/g, ''))
        const candidateValues = [normalizedDifficulty, normalizedDifficulty.toUpperCase(), normalizedDifficulty.toLowerCase()]
        const matched = candidateValues.find((value) => enumValues.includes(value))
        if (matched) {
          persistedDifficulty = matched
        } else if (enumValues.length) {
          persistedDifficulty = enumValues[0]
        }
      }

      const recipeColumnsToInsert = []
      const recipeValuesToInsert = []

      const idColumn = recipeColumns.find((column) => column.Field === 'id')
      let explicitRecipeId = null
      if (idColumn && !idColumn.Extra?.toLowerCase().includes('auto_increment')) {
        if (idColumn.Type.toLowerCase().includes('char')) {
          explicitRecipeId = randomUUID()
        } else {
          const [nextRows] = await connection.query('SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM recipes')
          explicitRecipeId = nextRows?.[0]?.nextId || 1
        }
        addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'id', explicitRecipeId)
      }

      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'user_id', parsedUserId)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'title', title)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'slug', slug)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'description', description)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'instructions', instructionsText)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'prep_time', prepTime ?? null)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'cook_time', cookTime ?? null)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'servings', servings ?? null)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'difficulty', persistedDifficulty)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'category', normalizedCategory)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'cuisine', normalizedCuisine)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'image', storedImagePath ?? null)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'is_premium', monetization.isPremium ? 1 : 0)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'is_public', 1)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'is_private', 0)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'is_featured', 0)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'is_verified', 0)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'is_active', 1)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'is_approved', recipeColumnSet.has('is_approved') ? 0 : undefined)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'source', 'user')
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'price', monetization.price)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'preview_text', monetization.previewText)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'status', 'PUBLISHED')
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'approval_status', 'pending')
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'views', 0)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'view_count', 0)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'favorite_count', 0)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'created_at', now)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'updated_at', now)
      addRecipeColumn(recipeColumnsToInsert, recipeValuesToInsert, 'submitted_at', now)

      const sanitizedColumns = recipeColumnsToInsert.filter(Boolean)
      const sanitizedValues = recipeValuesToInsert.filter((_, index) => Boolean(recipeColumnsToInsert[index]))
      if (!sanitizedColumns.length) {
        throw new Error('Unable to determine columns for inserting into recipes table.')
      }

      const placeholders = sanitizedColumns.map(() => '?').join(', ')
      const recipeInsertSql = `INSERT INTO recipes (${sanitizedColumns.join(', ')}) VALUES (${placeholders})`
      const [recipeResult] = await connection.query(recipeInsertSql, sanitizedValues)

      let recipeId = explicitRecipeId || recipeResult.insertId
      if (!recipeId) {
        const [rows] = await connection.query(
          'SELECT id FROM recipes WHERE slug = ? ORDER BY created_at DESC LIMIT 1',
          [slug]
        )
        recipeId = rows?.[0]?.id
      }

      if (!recipeId) {
        throw new Error('Failed to determine inserted recipe ID')
      }

      const recipeIdString = recipeId.toString()

      try {
        const [historyTableRows] = await connection.query('SHOW TABLES LIKE ?', ['recipe_status_history'])
        if (historyTableRows.length) {
          await connection.query(
            `INSERT INTO recipe_status_history (
              recipe_id,
              status,
              changed_by,
              notes
            ) VALUES (?, ?, ?, ?)` ,
            [recipeIdString, 'pending', parsedUserId, 'Recipe submitted for moderation']
          )
        }
      } catch (historyError) {
        console.warn('Skipping recipe_status_history insert:', historyError?.message)
      }

      const [ingredientTableRows] = await connection.query('SHOW TABLES LIKE ?', ['recipe_ingredients'])
      let ingredientColumns = []
      let ingredientColumnSet = new Set()
      if (ingredientTableRows.length) {
        const [columns] = await connection.query('SHOW COLUMNS FROM recipe_ingredients')
        ingredientColumns = columns
        ingredientColumnSet = new Set(columns.map((column) => column.Field))
      }

      const addIngredientColumn = (columns, values, column, value) => {
        if (!ingredientColumnSet.has(column)) {
          return
        }
        columns.push(column === 'order' ? '\`order\`' : `\`${column}\``)
        values.push(sanitizeValue(value))
      }

      if (ingredientTableRows.length && ingredients.length) {
        let position = 1
        for (const ingredient of ingredients) {
          if (!ingredient?.name?.trim()) continue

          const rawAmount = ingredient.amount ? Number.parseFloat(ingredient.amount) : null
          const ingredientColumnsToInsert = []
          const ingredientValuesToInsert = []

          addIngredientColumn(ingredientColumnsToInsert, ingredientValuesToInsert, 'recipe_id', recipeIdString)
          addIngredientColumn(ingredientColumnsToInsert, ingredientValuesToInsert, 'name', ingredient.name.trim())
          addIngredientColumn(ingredientColumnsToInsert, ingredientValuesToInsert, 'amount', Number.isFinite(rawAmount) ? rawAmount : null)
          addIngredientColumn(ingredientColumnsToInsert, ingredientValuesToInsert, 'unit', ingredient.unit?.trim() || null)
          addIngredientColumn(ingredientColumnsToInsert, ingredientValuesToInsert, 'notes', ingredient.notes?.trim() || null)
          if (ingredientColumnSet.has('position')) {
            addIngredientColumn(ingredientColumnsToInsert, ingredientValuesToInsert, 'position', position)
          }
          if (ingredientColumnSet.has('order')) {
            addIngredientColumn(ingredientColumnsToInsert, ingredientValuesToInsert, 'order', position)
          }
          addIngredientColumn(ingredientColumnsToInsert, ingredientValuesToInsert, 'is_optional', ingredient.optional ? 1 : 0)
          addIngredientColumn(ingredientColumnsToInsert, ingredientValuesToInsert, 'optional', ingredient.optional ? 1 : 0)
          addIngredientColumn(ingredientColumnsToInsert, ingredientValuesToInsert, 'created_at', now)
          addIngredientColumn(ingredientColumnsToInsert, ingredientValuesToInsert, 'updated_at', now)

          if (ingredientColumnsToInsert.length) {
            const ingredientPlaceholders = ingredientColumnsToInsert.map(() => '?').join(', ')
            const ingredientSql = `INSERT INTO recipe_ingredients (${ingredientColumnsToInsert.join(', ')}) VALUES (${ingredientPlaceholders})`
            await connection.query(ingredientSql, ingredientValuesToInsert)
            position += 1
          }
        }
      }

      const [nutritionTableRows] = await connection.query('SHOW TABLES LIKE ?', ['nutritional_info'])
      if (nutritionTableRows.length) {
        const [nutritionColumns] = await connection.query('SHOW COLUMNS FROM nutritional_info')
        const nutritionColumnSet = new Set(nutritionColumns.map((column) => column.Field))

        const addNutritionColumn = (columns, values, column, value) => {
          if (!nutritionColumnSet.has(column)) {
            return
          }
          columns.push(`\`${column}\``)
          values.push(sanitizeValue(value))
        }

        const nutritionColumnsToInsert = []
        const nutritionValuesToInsert = []

        addNutritionColumn(nutritionColumnsToInsert, nutritionValuesToInsert, 'recipe_id', recipeIdString)
        addNutritionColumn(nutritionColumnsToInsert, nutritionValuesToInsert, 'calories', nutritionData.calories)
        addNutritionColumn(nutritionColumnsToInsert, nutritionValuesToInsert, 'protein', nutritionData.protein)
        addNutritionColumn(nutritionColumnsToInsert, nutritionValuesToInsert, 'carbs', nutritionData.carbs)
        addNutritionColumn(nutritionColumnsToInsert, nutritionValuesToInsert, 'fats', nutritionData.fats)
        addNutritionColumn(nutritionColumnsToInsert, nutritionValuesToInsert, 'fiber', nutritionData.fiber)
        addNutritionColumn(nutritionColumnsToInsert, nutritionValuesToInsert, 'sugar', nutritionData.sugar)
        addNutritionColumn(nutritionColumnsToInsert, nutritionValuesToInsert, 'sodium', nutritionData.sodium)
        addNutritionColumn(nutritionColumnsToInsert, nutritionValuesToInsert, 'cholesterol', nutritionData.cholesterol)
        addNutritionColumn(nutritionColumnsToInsert, nutritionValuesToInsert, 'is_auto_calculated', nutritionData.isAutoCalculated ? 1 : 0)
        addNutritionColumn(nutritionColumnsToInsert, nutritionValuesToInsert, 'updated_at', now)

        if (nutritionColumnsToInsert.length) {
          const nutritionPlaceholders = nutritionColumnsToInsert.map(() => '?').join(', ')
          const nutritionSql = `INSERT INTO nutritional_info (${nutritionColumnsToInsert.join(', ')}) VALUES (${nutritionPlaceholders})`
          await connection.query(nutritionSql, nutritionValuesToInsert)
        }
      }

      const instructionTableCandidates = ['instructions', 'recipe_instructions']
      let instructionTableName = null
      let instructionColumnSet = new Set()

      for (const candidate of instructionTableCandidates) {
        const [tableRows] = await connection.query('SHOW TABLES LIKE ?', [candidate])
        if (tableRows.length) {
          instructionTableName = candidate
          const [columns] = await connection.query(`SHOW COLUMNS FROM ${candidate}`)
          instructionColumnSet = new Set(columns.map((column) => column.Field))
          break
        }
      }

      const addInstructionColumn = (columns, values, column, value) => {
        if (!instructionColumnSet.has(column)) {
          return
        }
        columns.push(`\`${column}\``)
        values.push(sanitizeValue(value))
      }

      if (instructionTableName && instructionSteps.length) {
        let stepNumber = 1
        for (const instruction of instructionSteps) {
          const instructionColumnsToInsert = []
          const instructionValuesToInsert = []

          addInstructionColumn(instructionColumnsToInsert, instructionValuesToInsert, 'recipe_id', recipeIdString)
          addInstructionColumn(instructionColumnsToInsert, instructionValuesToInsert, 'step_number', stepNumber++)
          addInstructionColumn(instructionColumnsToInsert, instructionValuesToInsert, 'instruction', instruction)
          addInstructionColumn(instructionColumnsToInsert, instructionValuesToInsert, 'image', null)
          addInstructionColumn(instructionColumnsToInsert, instructionValuesToInsert, 'created_at', now)
          addInstructionColumn(instructionColumnsToInsert, instructionValuesToInsert, 'updated_at', now)

          if (instructionColumnsToInsert.length) {
            const instructionPlaceholders = instructionColumnsToInsert.map(() => '?').join(', ')
            const instructionSql = `INSERT INTO ${instructionTableName} (${instructionColumnsToInsert.join(', ')}) VALUES (${instructionPlaceholders})`
            await connection.query(instructionSql, instructionValuesToInsert)
          }
        }
      }
    })

    return NextResponse.json(
      {
        success: true,
        recipeId: slug,
        imagePath: storedImagePath,
        approvalStatus: 'pending'
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating recipe:', error)
    return NextResponse.json(
      {
        error: 'Failed to create recipe',
        message: error.message
      },
      { status: 500 }
    )
  }
}
