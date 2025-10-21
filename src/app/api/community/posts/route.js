import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { query, queryOne, transaction } from '@/lib/db';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

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

export const mapPostRow = (row) => ({
  id: row.id,
  content: row.content,
  imageUrl: row.image_url || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  likeCount: Number(row.like_count ?? 0),
  hasLiked: Boolean(row.has_liked),
  commentCount: Number(row.comment_count ?? 0),
  canManage: Boolean(row.can_manage),
  viewerFollowsAuthor: Boolean(row.viewer_follows_author),
  author: {
    id: row.author_id,
    name: row.author_name || 'Community member',
    image: row.author_image || null,
    planName: row.author_plan_name || null,
    planBillingCycle: row.author_plan_billing_cycle || null,
    role: row.author_role || null,
  },
});

export const baseSelectSql = `
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
    u.role AS author_role,
    sub.plan_name AS author_plan_name,
    sub.billing_cycle AS author_plan_billing_cycle,
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
    END AS has_liked,
    CASE
      WHEN ? IS NULL THEN 0
      WHEN p.user_id = ? THEN 1
      ELSE 0
    END AS can_manage,
    CASE
      WHEN ? IS NULL THEN 0
      ELSE EXISTS (
        SELECT 1
        FROM user_follows uf
        WHERE uf.follower_id = ?
          AND uf.following_id = u.id
      )
    END AS viewer_follows_author
  FROM community_posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN (
    SELECT filtered.user_id, filtered.plan_name, filtered.billing_cycle
    FROM (
      SELECT
        s.user_id,
        sp.name AS plan_name,
        sp.billing_cycle,
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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageParam = Number.parseInt(searchParams.get('page') ?? '1', 10);
    const limitParam = Number.parseInt(searchParams.get('limit') ?? DEFAULT_LIMIT.toString(), 10);

    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(1, limitParam), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const offset = (page - 1) * limit;

    let session = null;
    try {
      session = await auth();
    } catch (error) {
      console.warn('Unable to resolve session in community posts GET:', error.message);
    }

    const viewerId = resolveUserId(session?.user?.id);
    const mineParam = (searchParams.get('mine') ?? '').toLowerCase();
    const requestedUserIdParam = searchParams.get('userId');

    const isMine = ['true', '1', 'yes'].includes(mineParam);

    let targetUserId = null;
    if (isMine) {
      if (viewerId === null) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      targetUserId = viewerId;
    } else if (requestedUserIdParam !== null) {
      const resolvedRequested = resolveUserId(requestedUserIdParam);
      if (resolvedRequested === null) {
        return NextResponse.json({ error: 'Invalid user filter' }, { status: 400 });
      }
      targetUserId = resolvedRequested;
    }

    const filters = [];
    const queryParams = [viewerId, viewerId, viewerId, viewerId, viewerId, viewerId];

    if (targetUserId !== null) {
      filters.push('p.user_id = ?');
      queryParams.push(targetUserId);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const posts = await query(
      `${baseSelectSql}
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    const totalParams = targetUserId !== null ? [targetUserId] : [];
    const totalRow = await queryOne(
      `SELECT COUNT(*) AS total FROM community_posts p ${whereClause}`,
      totalParams
    );
    const total = Number(totalRow?.total ?? 0);

    return NextResponse.json({
      posts: posts.map(mapPostRow),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('Error fetching community posts:', error);
    return NextResponse.json(
      { error: 'Failed to load community posts', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const viewerId = resolveUserId(session.user.id);
    if (viewerId === null) {
      return NextResponse.json({ error: 'Invalid user context' }, { status: 400 });
    }

    const contentType = request.headers.get('content-type') || '';

    let content = '';
    let imageUrl = null;
    let imageBuffer = null;
    let imageMimeType = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();

      content = formData.get('content')?.toString().trim() || '';

      const possibleImage = formData.get('image');
      const urlFieldRaw = formData.get('imageUrl')?.toString().trim() || '';

      if (
        possibleImage &&
        typeof possibleImage === 'object' &&
        'arrayBuffer' in possibleImage &&
        Number.isFinite(possibleImage.size) &&
        possibleImage.size > 0
      ) {
        if (!possibleImage.type?.startsWith('image/')) {
          return NextResponse.json({ error: 'Uploaded file must be an image' }, { status: 400 });
        }

        if (possibleImage.size > MAX_IMAGE_SIZE_BYTES) {
          return NextResponse.json({ error: 'Image is too large. Maximum size is 5 MB.' }, { status: 400 });
        }

        const arrayBuffer = await possibleImage.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
        imageMimeType = possibleImage.type || 'application/octet-stream';
        imageUrl = null;
      } else if (urlFieldRaw) {
        imageUrl = urlFieldRaw.slice(0, 500);
      }
    } else {
      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
      }

      content = payload?.content?.toString().trim() || '';
      const imageUrlRaw = payload?.imageUrl?.toString().trim();
      imageUrl = imageUrlRaw ? imageUrlRaw.slice(0, 500) : null;
    }

    if (!content) {
      return NextResponse.json({ error: 'Post content is required' }, { status: 400 });
    }

    if (content.length > 2000) {
      return NextResponse.json({ error: 'Post content exceeds the 2000 character limit' }, { status: 400 });
    }

    const { postId } = await transaction(async (connection) => {
      const [postResult] = await connection.query(
        'INSERT INTO community_posts (user_id, content, image_url) VALUES (?, ?, ?)',
        [viewerId, content, imageUrl]
      );

      const createdPostId = postResult?.insertId;
      if (!createdPostId) {
        throw new Error('Failed to determine inserted post ID');
      }

      if (imageBuffer) {
        await connection.query(
          'INSERT INTO community_post_images (post_id, mime_type, image_data) VALUES (?, ?, ?)',
          [createdPostId, imageMimeType, imageBuffer]
        );
      }

      return { postId: createdPostId };
    });

    const rows = await query(
      `${baseSelectSql}
      WHERE p.id = ?
      LIMIT 1`,
      [viewerId, viewerId, viewerId, viewerId, viewerId, viewerId, postId]
    );

    const post = rows?.[0];
    if (!post) {
      throw new Error('Unable to load newly created post');
    }

    return NextResponse.json({ post: mapPostRow(post) }, { status: 201 });
  } catch (error) {
    console.error('Error creating community post:', error);
    return NextResponse.json(
      { error: 'Failed to create post', message: error.message },
      { status: 500 }
    );
  }
}
