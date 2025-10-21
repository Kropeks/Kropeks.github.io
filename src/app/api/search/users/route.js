import { NextResponse } from 'next/server';

import { query } from '@/lib/db';

const buildLikePattern = (value) => `%${value.replace(/[%_]/g, '\\$&')}%`;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawQuery = (searchParams.get('q') ?? '').trim();
    const limitParam = Number.parseInt(searchParams.get('limit') ?? '8', 10);

    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 25) : 8;

    if (rawQuery.length < 2) {
      return NextResponse.json({ users: [], query: rawQuery, truncated: false });
    }

    const loweredQuery = rawQuery.toLowerCase();
    const likePattern = buildLikePattern(loweredQuery);

    const users = await query(
      `SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.image,
        up.display_name AS displayName,
        up.admin_title AS adminTitle,
        COALESCE(rc.recipe_count, 0) AS recipeCount,
        COALESCE(pc.post_count, 0) AS postCount,
        COALESCE(uc.last_activity, NULL) AS lastActivity
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS recipe_count
        FROM recipes
        WHERE is_public = 1 OR status = 'PUBLISHED'
        GROUP BY user_id
      ) rc ON rc.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS post_count
        FROM community_posts
        GROUP BY user_id
      ) pc ON pc.user_id = u.id
      LEFT JOIN (
        SELECT user_id, MAX(created_at) AS last_activity
        FROM community_posts
        GROUP BY user_id
      ) uc ON uc.user_id = u.id
      WHERE
        u.account_status = 'active'
        AND (
          LOWER(u.name) LIKE ?
          OR LOWER(u.email) LIKE ?
          OR LOWER(COALESCE(up.display_name, '')) LIKE ?
          OR LOWER(COALESCE(up.admin_title, '')) LIKE ?
        )
      ORDER BY recipeCount DESC, postCount DESC, u.created_at DESC
      LIMIT ?`,
      [likePattern, likePattern, likePattern, likePattern, limit]
    );

    const formatted = users.map((user) => ({
      id: user.id,
      name: user.name,
      displayName: user.displayName || null,
      adminTitle: user.adminTitle || null,
      role: user.role,
      email: user.email,
      image: user.image,
      recipeCount: Number(user.recipeCount ?? 0),
      postCount: Number(user.postCount ?? 0),
      lastActivity: user.lastActivity || null,
    }));

    return NextResponse.json({
      users: formatted,
      query: rawQuery,
      truncated: formatted.length === limit,
    });
  } catch (error) {
    console.error('Failed to run user search:', error);
    return NextResponse.json({ error: 'Failed to search users' }, { status: 500 });
  }
}
