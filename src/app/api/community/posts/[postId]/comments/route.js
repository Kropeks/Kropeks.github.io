import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { query, queryOne } from '@/lib/db';
import { NotificationService } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_COMMENT_LENGTH = 1000;

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

const parsePostId = (rawPostId) => {
  const numeric = Number.parseInt(rawPostId ?? '', 10);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
};

const getPostRecord = async (postId) =>
  queryOne(
    `SELECT p.id, p.user_id, p.content, p.image_url, u.name AS author_name
     FROM community_posts p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE p.id = ?
     LIMIT 1`,
    [postId]
  );

const mapCommentRow = (row) => ({
  id: row.id,
  content: row.content,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  author: {
    id: row.author_id,
    name: row.author_name || 'Community member',
    image: row.author_image || null,
  },
});

const getCommentCount = async (postId) => {
  const row = await queryOne(
    'SELECT COUNT(*) AS total FROM community_post_comments WHERE post_id = ?',
    [postId]
  );
  return Number(row?.total ?? 0);
};

const getSessionUserId = async () => {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  return resolveUserId(session.user.id);
};

export async function GET(request, { params }) {
  try {
    const postId = parsePostId(params?.postId);
    if (!postId) {
      return NextResponse.json({ error: 'Invalid post identifier' }, { status: 400 });
    }

    const post = await getPostRecord(postId);
    if (!post?.id) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const pageParam = Number.parseInt(searchParams.get('page') ?? '1', 10);
    const limitParam = Number.parseInt(searchParams.get('limit') ?? DEFAULT_LIMIT.toString(), 10);

    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(1, limitParam), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const offset = (page - 1) * limit;

    const comments = await query(
      `SELECT
         c.id,
         c.content,
         c.created_at,
         c.updated_at,
         u.id AS author_id,
         u.name AS author_name,
         u.image AS author_image
       FROM community_post_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ?
       ORDER BY c.created_at ASC
       LIMIT ? OFFSET ?`,
      [postId, limit, offset]
    );

    const total = await getCommentCount(postId);

    return NextResponse.json({
      comments: comments.map(mapCommentRow),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('Error fetching community post comments:', error);
    return NextResponse.json(
      { error: 'Failed to load comments', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  try {
    const postId = parsePostId(params?.postId);
    if (!postId) {
      return NextResponse.json({ error: 'Invalid post identifier' }, { status: 400 });
    }

    const viewerId = await getSessionUserId();
    if (viewerId === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const post = await getPostRecord(postId);
    if (!post?.id) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (error) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const content = payload?.content?.toString().trim() || '';
    if (!content) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 });
    }

    if (content.length > MAX_COMMENT_LENGTH) {
      return NextResponse.json(
        { error: `Comments are limited to ${MAX_COMMENT_LENGTH} characters` },
        { status: 400 }
      );
    }

    const insertResult = await query(
      'INSERT INTO community_post_comments (post_id, user_id, content) VALUES (?, ?, ?)',
      [postId, viewerId, content]
    );

    const insertedId = insertResult?.insertId;
    if (!insertedId) {
      throw new Error('Failed to determine inserted comment ID');
    }

    const row = await queryOne(
      `SELECT
         c.id,
         c.content,
         c.created_at,
         c.updated_at,
         u.id AS author_id,
         u.name AS author_name,
         u.image AS author_image
       FROM community_post_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = ?
       LIMIT 1`,
      [insertedId]
    );

    if (!row) {
      throw new Error('Unable to load newly created comment');
    }

    const total = await getCommentCount(postId);

    if (post.user_id && post.user_id !== viewerId) {
      try {
        const actor = await queryOne('SELECT name FROM users WHERE id = ? LIMIT 1', [viewerId]);
        const actorName = actor?.name || 'Someone';
        const previewText = post?.content?.slice(0, 120) || '';

        await NotificationService.createNotification({
          userId: String(post.user_id),
          actorId: String(viewerId),
          actorName,
          type: 'recipe_comment',
          title: `${actorName} commented on your community post`,
          body: content,
          metadata: {
            postId,
            commentId: row.id,
            previewText,
            postImage: post?.image_url || null,
            actorName,
            latestCommentId: row.id,
          },
          aggregation: {
            key: `community_post_comment:${postId}`,
            actionSingular: 'commented on your community post',
            actionPlural: 'commented on your community post',
            maxActors: 3,
          },
        });
      } catch (notifyError) {
        console.warn('[notifications] Failed to create comment notification', notifyError);
      }
    }

    return NextResponse.json(
      {
        comment: mapCommentRow(row),
        counts: { total },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating community post comment:', error);
    return NextResponse.json(
      { error: 'Failed to create comment', message: error.message },
      { status: 500 }
    );
  }
}
