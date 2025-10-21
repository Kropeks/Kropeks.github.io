import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { query, queryOne } from '@/lib/db';
import { NotificationService } from '@/lib/notifications/service';

const FAVORITES_SELECT = `
  SELECT
    uf.user_id AS user_id,
    uf.recipe_id AS recipe_id,
    uf.created_at AS favorite_created_at,
    rp.id AS purchase_id,
    rp.created_at AS purchase_created_at,
    r.slug AS recipe_slug,
    r.title AS recipe_title,
    r.description AS recipe_description,
    r.preview_text AS recipe_preview_text,
    r.image AS recipe_image,
    r.prep_time AS recipe_prep_time,
    r.cook_time AS recipe_cook_time,
    r.servings AS recipe_servings,
    r.category AS recipe_category,
    r.cuisine AS recipe_cuisine,
    r.price AS recipe_price,
    r.is_premium AS recipe_is_premium,
    r.user_id AS recipe_owner_id
  FROM user_favorites uf
  LEFT JOIN recipes r ON r.id = uf.recipe_id
  LEFT JOIN recipe_purchases rp ON rp.recipe_id = uf.recipe_id AND rp.user_id = uf.user_id
  WHERE uf.user_id = ?
  ORDER BY uf.created_at DESC
`;

const FAVORITE_BY_ID_SELECT = `
  SELECT
    uf.user_id AS user_id,
    uf.recipe_id AS recipe_id,
    uf.created_at AS favorite_created_at,
    rp.id AS purchase_id,
    rp.created_at AS purchase_created_at,
    r.slug AS recipe_slug,
    r.title AS recipe_title,
    r.description AS recipe_description,
    r.preview_text AS recipe_preview_text,
    r.image AS recipe_image,
    r.prep_time AS recipe_prep_time,
    r.cook_time AS recipe_cook_time,
    r.servings AS recipe_servings,
    r.category AS recipe_category,
    r.cuisine AS recipe_cuisine,
    r.price AS recipe_price,
    r.is_premium AS recipe_is_premium,
    r.user_id AS recipe_owner_id
  FROM user_favorites uf
  LEFT JOIN recipes r ON r.id = uf.recipe_id
  LEFT JOIN recipe_purchases rp ON rp.recipe_id = uf.recipe_id AND rp.user_id = uf.user_id
  WHERE uf.user_id = ? AND uf.recipe_id = ?
  ORDER BY uf.created_at DESC
  LIMIT 1
`;

const toNumberOrNull = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

const mapFavoriteRow = (row = {}, fallback = {}) => {
  const recipeId = toNumberOrNull(row.recipe_id ?? fallback.recipeId ?? fallback.id);
  const slug = row.recipe_slug || fallback.slug || (recipeId !== null ? String(recipeId) : null);
  const prep = toNumberOrNull(row.recipe_prep_time ?? fallback.prepTime ?? fallback.readyInMinutes) || 0;
  const cook = toNumberOrNull(row.recipe_cook_time ?? fallback.cookTime) || 0;
  const readyInMinutes = fallback.readyInMinutes ?? (prep + cook > 0 ? prep + cook : null);
  const servings = row.recipe_servings ?? fallback.servings ?? null;
  const title = row.recipe_title || fallback.title || 'Untitled Recipe';
  const description = row.recipe_description || fallback.description || row.recipe_preview_text || '';
  const image = row.recipe_image || fallback.image || '/placeholder-recipe.jpg';
  const category = row.recipe_category || fallback.category || null;
  const cuisine = row.recipe_cuisine || fallback.cuisine || null;
  const createdAt = row.favorite_created_at || fallback.createdAt || new Date().toISOString();
  const rawPrice = row.recipe_price ?? fallback.price ?? null;
  const price = rawPrice !== null && rawPrice !== undefined ? Number.parseFloat(rawPrice) : null;
  const hasValidPrice = Number.isFinite(price) && price > 0;
  const isPremium = Boolean(row.recipe_is_premium ?? fallback.isPremium ?? hasValidPrice);
  const ownerId = toNumberOrNull(row.recipe_owner_id ?? fallback.ownerId);
  const purchaseId = toNumberOrNull(row.purchase_id ?? fallback.purchaseId);
  const hasPurchased = Boolean(purchaseId) || (ownerId !== null && fallback.viewerId !== undefined && ownerId === fallback.viewerId);

  const sourceKey = fallback.sourceKey || 'community';
  const href = fallback.href || (slug ? `/recipes/${encodeURIComponent(slug)}?source=${encodeURIComponent(sourceKey)}` : '/recipes');

  return {
    id: recipeId !== null ? String(recipeId) : (fallback.id ? String(fallback.id) : String(Date.now())),
    recipeId: recipeId,
    slug,
    title,
    description,
    image,
    readyInMinutes,
    servings,
    category,
    cuisine,
    sourceKey,
    href,
    createdAt,
    price: hasValidPrice ? price : null,
    isPremium,
    hasPurchased
  };
};

const ensureAuthenticatedUserId = async () => {
  const session = await auth();
  const rawUserId = session?.user?.id;
  const userId = toNumberOrNull(rawUserId);
  if (!userId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { userId };
};

export async function GET() {
  try {
    const { userId, error } = await ensureAuthenticatedUserId();
    if (error) {
      return error;
    }

    const rows = await query(FAVORITES_SELECT, [userId]);
    const favorites = Array.isArray(rows) ? rows.map((row) => mapFavoriteRow(row, { viewerId: userId })) : [];

    return NextResponse.json({ favorites });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { userId, error } = await ensureAuthenticatedUserId();
    if (error) {
      return error;
    }

    const body = await request.json().catch(() => null);
    if (!body || (body.recipeId === undefined && body.id === undefined)) {
      return NextResponse.json({ error: 'recipeId is required' }, { status: 400 });
    }

    const fallbackPayload = typeof body === 'object' && body !== null ? body.payload || body.favorite || body : {};
    fallbackPayload.viewerId = userId;
    const recipeId = toNumberOrNull(body.recipeId ?? body.id ?? fallbackPayload.recipeId ?? fallbackPayload.id);

    if (recipeId === null) {
      return NextResponse.json({ error: 'recipeId must be a valid numeric identifier' }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO user_favorites (user_id, recipe_id, created_at)
       VALUES (?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE created_at = VALUES(created_at)`,
      [userId, recipeId]
    );

    const row = await queryOne(FAVORITE_BY_ID_SELECT, [userId, recipeId]);
    const favorite = mapFavoriteRow(row || {}, fallbackPayload);

    if (result?.affectedRows === 1) {
      const recipeOwnerId = row?.user_id ?? fallbackPayload?.ownerId ?? null;
      const resolvedOwnerId = recipeOwnerId !== null ? Number.parseInt(recipeOwnerId, 10) : null;

      if (resolvedOwnerId && resolvedOwnerId !== userId) {
        try {
          const actor = await queryOne('SELECT name FROM users WHERE id = ? LIMIT 1', [userId]);
          const actorName = actor?.name || 'Someone';
          const previewText = favorite?.description?.slice(0, 160) || favorite?.title || '';
          const postImage = favorite?.image || null;

          await NotificationService.createNotification({
            userId: String(resolvedOwnerId),
            actorId: String(userId),
            type: 'recipe_saved',
            title: 'Someone saved your recipe',
            metadata: {
              recipeId: favorite.recipeId,
              recipeSlug: favorite.slug,
              previewText,
              postImage,
              actorName,
            },
          });
        } catch (notifyError) {
          console.warn('[notifications] Failed to create favorites notification', notifyError);
        }
      }
    }

    return NextResponse.json({ favorite }, { status: row ? 201 : 200 });
  } catch (error) {
    console.error('Error adding favorite:', error);
    if (error?.code === 'ER_NO_REFERENCED_ROW_2' || error?.errno === 1452) {
      return NextResponse.json({ error: 'Recipe not found for favorites sync' }, { status: 422 });
    }
    return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 });
  }
}
