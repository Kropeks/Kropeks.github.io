import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { query, queryOne } from '@/lib/db';
import { NotificationService } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

const ensurePostExists = async (postId) => {
  const row = await queryOne(
    `SELECT p.id, p.user_id, p.content, p.image_url, u.name AS author_name
     FROM community_posts p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE p.id = ?
     LIMIT 1`,
    [postId]
  );
  return row || null;
};

const getLikeSummary = async (postId, viewerId) => {
  const countRow = await queryOne(
    'SELECT COUNT(*) AS like_count FROM community_post_likes WHERE post_id = ? LIMIT 1',
    [postId]
  );

  let hasLiked = false;
  if (viewerId !== null) {
    const likedRow = await queryOne(
      'SELECT 1 FROM community_post_likes WHERE post_id = ? AND user_id = ? LIMIT 1',
      [postId, viewerId]
    );
    hasLiked = Boolean(likedRow);
  }

  return {
    likeCount: Number(countRow?.like_count ?? 0),
    hasLiked,
  };
};

const getSessionUserId = async () => {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  return resolveUserId(session.user.id);
};

export async function POST(_request, { params }) {
  try {
    const postId = parsePostId(params?.postId);
    if (!postId) {
      return NextResponse.json({ error: 'Invalid post identifier' }, { status: 400 });
    }

    const viewerId = await getSessionUserId();
    if (viewerId === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const post = await ensurePostExists(postId);
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const likeResult = await query(
      `INSERT INTO community_post_likes (post_id, user_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE created_at = created_at`,
      [postId, viewerId]
    );

    const postOwnerId = resolveUserId(post?.user_id);
    if (likeResult?.affectedRows === 1 && postOwnerId !== null && postOwnerId !== viewerId) {
      try {
        const actor = await queryOne('SELECT name FROM users WHERE id = ? LIMIT 1', [viewerId]);
        const actorName = actor?.name || 'Someone';
        const previewText = post?.content?.slice(0, 120) || '';

        await NotificationService.createNotification({
          userId: String(postOwnerId),
          actorId: String(viewerId),
          actorName,
          type: 'community_post_like',
          title: `${actorName} liked your community post`,
          metadata: {
            postId,
            previewText,
            postImage: post?.image_url || null,
            actorName,
          },
          aggregation: {
            key: `community_post_like:${postId}`,
            actionSingular: 'liked your community post',
            actionPlural: 'liked your community post',
            maxActors: 3,
          },
        });
      } catch (notifyError) {
        console.warn('[notifications] Failed to create like notification', notifyError);
      }
    }

    const summary = await getLikeSummary(postId, viewerId);

    return NextResponse.json({ postId, ...summary }, { status: 200 });
  } catch (error) {
    console.error('Failed to like community post:', error);
    return NextResponse.json({ error: 'Failed to toggle like', message: error.message }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  try {
    const postId = parsePostId(params?.postId);
    if (!postId) {
      return NextResponse.json({ error: 'Invalid post identifier' }, { status: 400 });
    }

    const viewerId = await getSessionUserId();
    if (viewerId === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const exists = await ensurePostExists(postId);
    if (!exists) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    await query('DELETE FROM community_post_likes WHERE post_id = ? AND user_id = ?', [postId, viewerId]);

    const summary = await getLikeSummary(postId, viewerId);

    return NextResponse.json({ postId, ...summary }, { status: 200 });
  } catch (error) {
    console.error('Failed to remove like from community post:', error);
    return NextResponse.json({ error: 'Failed to toggle like', message: error.message }, { status: 500 });
  }
}
