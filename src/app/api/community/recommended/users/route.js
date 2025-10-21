import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { query } from '@/lib/db';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = Number.parseInt(searchParams.get('limit') ?? DEFAULT_LIMIT.toString(), 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : DEFAULT_LIMIT;

    let viewerId = null;
    try {
      const session = await auth();
      viewerId = session?.user?.id ? String(session.user.id).trim() : null;
    } catch (error) {
      console.warn('recommended users: unable to resolve session', error?.message || error);
    }

    const rows = await query(
      `
      SELECT
        u.id,
        u.name,
        u.image,
        u.role,
        up.display_name,
        up.bio,
        up.location,
        sub.plan_name,
        sub.plan_billing_cycle,
        COALESCE(f.follower_count, 0) AS follower_count,
        COALESCE(r.public_recipe_count, 0) AS public_recipe_count,
        COALESCE(r.total_favorites, 0) AS total_favorites,
        COALESCE(r.total_ratings, 0) AS total_ratings,
        COALESCE(r.total_comments, 0) AS total_comments,
        COALESCE(cp.post_count, 0) AS post_count,
        cp.recent_post,
        CASE
          WHEN ? IS NULL THEN 0
          ELSE EXISTS (
            SELECT 1
            FROM user_follows uf
            WHERE uf.follower_id = ?
              AND uf.following_id = u.id
          )
        END AS viewer_follows,
        (
          COALESCE(f.follower_count, 0) * 5 +
          COALESCE(r.total_favorites, 0) * 3 +
          COALESCE(r.total_ratings, 0) * 2 +
          COALESCE(r.public_recipe_count, 0) +
          COALESCE(cp.post_count, 0)
        ) AS score
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      LEFT JOIN (
        SELECT filtered.user_id, filtered.plan_name, filtered.plan_billing_cycle
        FROM (
          SELECT
            s.user_id,
            sp.name AS plan_name,
            sp.billing_cycle AS plan_billing_cycle,
            ROW_NUMBER() OVER (
              PARTITION BY s.user_id
              ORDER BY COALESCE(s.end_date, TIMESTAMP '9999-12-31 23:59:59') DESC, s.created_at DESC
            ) AS rn
          FROM subscriptions s
          JOIN subscription_plans sp ON sp.id = s.plan_id
          WHERE s.status = 'active'
            AND (s.end_date IS NULL OR s.end_date >= NOW())
        ) AS filtered
        WHERE filtered.rn = 1
      ) AS sub ON sub.user_id = u.id
      LEFT JOIN (
        SELECT following_id AS user_id, COUNT(*) AS follower_count
        FROM user_follows
        GROUP BY following_id
      ) AS f ON f.user_id = u.id
      LEFT JOIN (
        SELECT
          v.user_id,
          COUNT(*) AS public_recipe_count,
          SUM(COALESCE(v.favorite_count, 0)) AS total_favorites,
          SUM(COALESCE(v.rating_count, 0)) AS total_ratings,
          SUM(COALESCE(v.comment_count, 0)) AS total_comments
        FROM vw_recipe_details v
        GROUP BY v.user_id
      ) AS r ON r.user_id = u.id
      LEFT JOIN (
        SELECT
          user_id,
          COUNT(*) AS post_count,
          MAX(created_at) AS recent_post
        FROM community_posts
        GROUP BY user_id
      ) AS cp ON cp.user_id = u.id
      WHERE u.account_status = 'active'
        AND (u.role = 'USER' OR u.role = 'ADMIN')
      ORDER BY score DESC, cp.recent_post DESC, u.created_at DESC
      LIMIT ?
      `,
      [viewerId, viewerId, limit]
    );

    const users = rows.map((row) => ({
      id: row.id,
      name: row.name,
      displayName: row.display_name || row.name,
      image: row.image || null,
      bio: row.bio || null,
      location: row.location || null,
      role: row.role || null,
      followerCount: Number(row.follower_count ?? 0),
      publicRecipeCount: Number(row.public_recipe_count ?? 0),
      totalFavorites: Number(row.total_favorites ?? 0),
      totalRatings: Number(row.total_ratings ?? 0),
      totalComments: Number(row.total_comments ?? 0),
      postCount: Number(row.post_count ?? 0),
      recentPostAt: row.recent_post,
      score: Number(row.score ?? 0),
      viewerFollows: Boolean(row.viewer_follows),
      planName: row.plan_name || null,
      planBillingCycle: row.plan_billing_cycle || null,
    }));

    return NextResponse.json(
      {
        users,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Failed to load recommended users:', error);
    return NextResponse.json(
      { error: 'Failed to load recommended users', message: error.message },
      { status: 500 }
    );
  }
}
