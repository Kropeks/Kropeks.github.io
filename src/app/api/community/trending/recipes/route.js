import { NextResponse } from 'next/server';

import { query } from '@/lib/db';
import { getMealById } from '@/lib/api/mealdb';
import { auth } from '@/auth';

const DEFAULT_LIMIT = 4;
const MAX_LIMIT = 20;

const fetchInternalTrending = async ({ limit, viewerId }) => {
  try {
    const viewerParam = Number.isFinite(viewerId) ? viewerId : null;
    const rows = await query(
      `
      SELECT
        r.id,
        r.user_id,
        r.title,
        r.slug,
        r.image,
        r.is_premium,
        r.price,
        r.updated_at,
        COALESCE(favorites.favorite_count, 0) AS favorite_count,
        favorites.latest_favorited_at,
        CASE WHEN rp.user_id IS NOT NULL THEN 1 ELSE 0 END AS viewer_has_purchased
      FROM recipes r
      LEFT JOIN (
        SELECT
          uf.recipe_id,
          COUNT(*) AS favorite_count,
          MAX(uf.created_at) AS latest_favorited_at
        FROM user_favorites uf
        GROUP BY uf.recipe_id
      ) AS favorites ON favorites.recipe_id = r.id
      LEFT JOIN recipe_purchases rp
        ON rp.recipe_id = r.id AND rp.user_id = ?
      WHERE r.status = 'PUBLISHED'
        AND r.is_public = 1
        AND r.is_private = 0
      ORDER BY favorite_count DESC, favorites.latest_favorited_at DESC, r.updated_at DESC
      LIMIT ?
      `,
      [viewerParam, limit]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }

    return rows.map((row) => {
      const favoriteCount = Number(row.favorite_count ?? 0);
      const ownerId = row.user_id != null ? Number(row.user_id) : null;
      return {
        id: `community:${row.id}`,
        source: 'community',
        communityId: row.id,
        ownerId,
        title: row.title || 'Untitled recipe',
        slug: row.slug || String(row.id),
        image: row.image || null,
        favoriteCount,
        isPremium: Boolean(Number(row.is_premium ?? 0)),
        price: row.price !== null && row.price !== undefined ? Number(row.price) : null,
        isOwner: viewerParam !== null && ownerId !== null ? Number(ownerId) === Number(viewerParam) : false,
        hasPurchased: Boolean(row.viewer_has_purchased),
        viewerHasFavorited: false,
        updatedAt: row.latest_favorited_at || row.updated_at || null,
      };
    });
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('[trending recipes] Failed to load internal favorites:', error);
    }
    return [];
  }
};

const fetchExternalFavorites = async ({ limit }) => {
  try {
    const rows = await query(
      `
      SELECT
        external_id,
        favorite_count,
        meal_name,
        meal_thumb,
        updated_at
      FROM external_recipe_favorites
      ORDER BY favorite_count DESC, updated_at DESC
      LIMIT ?
      `,
      [limit]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }

    const enriched = await Promise.all(
      rows.map(async (row) => {
        let mealName = row.meal_name ?? null;
        let mealThumb = row.meal_thumb ?? null;

        if (!mealName || !mealThumb) {
          try {
            const meal = await getMealById(row.external_id);
            if (meal) {
              mealName = mealName || meal?.strMeal || null;
              mealThumb = mealThumb || meal?.strMealThumb || null;
            }
          } catch (error) {
            console.warn('[trending recipes] Failed to enrich MealDB favorite', error);
          }
        }

        return {
          id: `mealdb:${row.external_id}`,
          source: 'mealdb',
          externalId: row.external_id,
          title: mealName || 'MealDB Recipe',
          image: mealThumb || null,
          favoriteCount: Number(row.favorite_count ?? 0),
          isPremium: false,
          price: null,
          isOwner: false,
          hasPurchased: false,
          viewerHasFavorited: false,
          updatedAt: row.updated_at,
        };
      })
    );

    return enriched;
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('[trending recipes] Failed to load external favorites:', error);
    }
    return [];
  }
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = Number.parseInt(searchParams.get('limit') ?? DEFAULT_LIMIT.toString(), 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : DEFAULT_LIMIT;

    const internalLimit = Math.min(2, Math.max(0, limit));
    const externalLimit = Math.min(2, Math.max(0, limit));

    let viewerId = null;
    try {
      const session = await auth();
      const rawId = session?.user?.id;
      if (rawId !== null && rawId !== undefined) {
        const parsed = Number.parseInt(String(rawId), 10);
        viewerId = Number.isFinite(parsed) ? parsed : null;
      }
    } catch (authError) {
      console.warn('[trending recipes] Unable to resolve viewer session:', authError?.message || authError);
    }

    const [internalTrending, externalTrending] = await Promise.all([
      fetchInternalTrending({ limit: internalLimit, viewerId }),
      fetchExternalFavorites({ limit: externalLimit })
    ]);

    const combined = [...internalTrending, ...externalTrending]
      .sort((a, b) => {
        const diff = Number(b.favoriteCount ?? 0) - Number(a.favoriteCount ?? 0);
        if (diff !== 0) {
          return diff;
        }
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, limit);

    return NextResponse.json(
      {
        recipes: combined,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Failed to load trending recipes:', error);
    return NextResponse.json(
      { error: 'Failed to load trending recipes', message: error.message },
      { status: 500 }
    );
  }
}
