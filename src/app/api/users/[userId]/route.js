import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { query, queryOne } from '@/lib/db';

const DEFAULT_RECIPE_LIMIT = 8;
const DEFAULT_POST_LIMIT = 6;

const resolveUserId = (rawId) => {
  if (rawId === null || rawId === undefined) {
    return null;
  }

  if (typeof rawId === 'number') {
    return Number.isFinite(rawId) ? rawId : null;
  }

  const stringId = rawId.toString().trim();
  if (!stringId) {
    return null;
  }

  const parsed = Number.parseInt(stringId, 10);
  if (!Number.isNaN(parsed) && parsed.toString() === stringId) {
    return parsed;
  }

  return stringId;
};

const mapPostRow = (row) => ({
  id: row.id,
  content: row.content,
  imageUrl: row.image_url || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  likeCount: Number(row.like_count ?? 0),
  hasLiked: Boolean(row.has_liked),
  commentCount: Number(row.comment_count ?? 0),
  author: {
    id: row.author_id,
    name: row.author_name || 'Community member',
    image: row.author_image || null
  }
});

const baseSelectSql = `
  SELECT
    p.id,
    p.content,
    COALESCE(
      p.image_url,
      CASE
        WHEN pi.id IS NOT NULL THEN CONCAT('/api/community/posts/', p.id, '/image')
        ELSE NULL
      END
    ) AS image_url,
    p.created_at,
    p.updated_at,
    u.id AS author_id,
    u.name AS author_name,
    u.image AS author_image,
    COALESCE(l.like_count, 0) AS like_count,
    COALESCE(c.comment_count, 0) AS comment_count,
    CASE
      WHEN ? IS NULL THEN 0
      ELSE EXISTS (
        SELECT 1
        FROM community_post_likes l2
        WHERE l2.post_id = p.id
          AND l2.user_id = ?
      )
    END AS has_liked
  FROM community_posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN community_post_images pi ON pi.post_id = p.id
  LEFT JOIN (
    SELECT post_id, COUNT(*) AS like_count
    FROM community_post_likes
    GROUP BY post_id
  ) AS l ON l.post_id = p.id
  LEFT JOIN (
    SELECT post_id, COUNT(*) AS comment_count
    FROM community_post_comments
    GROUP BY post_id
  ) AS c ON c.post_id = p.id
`;

export async function GET(request, { params }) {
  try {
    const { userId: rawUserId } = params;
    const targetUserId = resolveUserId(rawUserId);

    if (targetUserId === null || typeof targetUserId !== 'number') {
      return NextResponse.json({ error: 'Invalid user identifier' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const recipeLimitParam = Number.parseInt(searchParams.get('recipesLimit') ?? '', 10);
    const postLimitParam = Number.parseInt(searchParams.get('postsLimit') ?? '', 10);

    const recipesLimit = Number.isFinite(recipeLimitParam) && recipeLimitParam > 0
      ? Math.min(recipeLimitParam, 24)
      : DEFAULT_RECIPE_LIMIT;

    const postsLimit = Number.isFinite(postLimitParam) && postLimitParam > 0
      ? Math.min(postLimitParam, 24)
      : DEFAULT_POST_LIMIT;

    const userRow = await queryOne(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.role,
         u.image,
         u.created_at,
         up.display_name,
         up.admin_title,
         up.bio,
         up.location
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = ?
       LIMIT 1`,
      [targetUserId]
    );

    if (!userRow) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const [{ recipe_count: totalRecipes = 0 } = {}] = await query(
      `SELECT COUNT(*) AS recipe_count
       FROM recipes
       WHERE user_id = ?
         AND (is_public = 1 OR status = 'PUBLISHED')`,
      [targetUserId]
    );

    const [{ post_count: totalPosts = 0 } = {}] = await query(
      `SELECT COUNT(*) AS post_count
       FROM community_posts
       WHERE user_id = ?`,
      [targetUserId]
    );

    const recipes = await query(
      `SELECT
         r.id,
         r.slug,
         r.title,
         r.description,
         r.image,
         r.category,
         r.cuisine,
         r.created_at,
         r.prep_time,
         r.cook_time
       FROM recipes r
       WHERE r.user_id = ?
         AND (r.is_public = 1 OR r.status = 'PUBLISHED')
       ORDER BY r.created_at DESC
       LIMIT ?`,
      [targetUserId, recipesLimit]
    );

    let viewerId = null;
    try {
      const session = await auth();
      viewerId = resolveUserId(session?.user?.id);
    } catch (error) {
      console.warn('Unable to resolve session for external profile view:', error?.message || error);
    }

    const posts = await query(
      `${baseSelectSql}
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
      LIMIT ?`,
      [viewerId, viewerId, targetUserId, postsLimit]
    );

    const [{ follower_count: followerCount = 0 } = {}] = await query(
      `SELECT COUNT(*) AS follower_count
       FROM user_follows
       WHERE following_id = ?`,
      [targetUserId]
    );

    const [{ following_count: followingCount = 0 } = {}] = await query(
      `SELECT COUNT(*) AS following_count
       FROM user_follows
       WHERE follower_id = ?`,
      [targetUserId]
    );

    const isViewingOwnProfile = viewerId !== null && viewerId === targetUserId;
    let viewerFollowsTarget = false;

    if (!isViewingOwnProfile && viewerId !== null) {
      const followRow = await queryOne(
        `SELECT 1
         FROM user_follows
         WHERE follower_id = ?
           AND following_id = ?
         LIMIT 1`,
        [viewerId, targetUserId]
      );
      viewerFollowsTarget = Boolean(followRow);
    }

    return NextResponse.json({
      user: {
        id: userRow.id,
        name: userRow.name,
        email: userRow.email,
        role: userRow.role,
        image: userRow.image,
        displayName: userRow.display_name || null,
        adminTitle: userRow.admin_title || null,
        bio: userRow.bio || null,
        location: userRow.location || null,
        joinedAt: userRow.created_at,
        recipeCount: Number(totalRecipes ?? 0),
        postCount: Number(totalPosts ?? 0),
        followerCount: Number(followerCount ?? 0),
        followingCount: Number(followingCount ?? 0),
        viewerFollows: viewerFollowsTarget,
        isViewingSelf: isViewingOwnProfile
      },
      recipes: recipes.map((recipe) => ({
        id: recipe.id,
        slug: recipe.slug,
        title: recipe.title,
        description: recipe.description,
        image: recipe.image,
        category: recipe.category,
        cuisine: recipe.cuisine,
        createdAt: recipe.created_at,
        prepTime: recipe.prep_time,
        cookTime: recipe.cook_time
      })),
      posts: posts.map(mapPostRow)
    });
  } catch (error) {
    console.error('Failed to load public user profile:', error);
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}
