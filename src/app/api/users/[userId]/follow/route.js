import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { query, queryOne } from '@/lib/db';
import { NotificationService } from '@/lib/notifications/service';

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

const parseTargetUserId = (value) => {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const getViewerId = async () => {
  const session = await auth();
  const rawId = session?.user?.id ?? null;
  return resolveUserId(rawId);
};

const buildSummary = async ({ viewerId, targetUserId }) => {
  const [{ follower_count: followerCount = 0 } = {}] = await query(
    `SELECT COUNT(*) AS follower_count
     FROM user_follows
     WHERE following_id = ?`,
    [targetUserId]
  );

  let viewerFollows = false;

  if (viewerId !== null && viewerId !== targetUserId) {
    const row = await queryOne(
      `SELECT 1
       FROM user_follows
       WHERE follower_id = ?
         AND following_id = ?
       LIMIT 1`,
      [viewerId, targetUserId]
    );
    viewerFollows = Boolean(row);
  }

  return {
    followerCount: Number(followerCount ?? 0),
    viewerFollows,
  };
};

const ensureTargetExists = async (targetUserId) => {
  const row = await queryOne(
    `SELECT id, name
     FROM users
     WHERE id = ?
       AND account_status = 'active'
     LIMIT 1`,
    [targetUserId]
  );
  return row || null;
};

export async function POST(_request, { params }) {
  try {
    const targetUserId = parseTargetUserId(params?.userId);
    if (!targetUserId) {
      return NextResponse.json({ error: 'Invalid user identifier' }, { status: 400 });
    }

    const viewerId = await getViewerId();
    if (viewerId === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (viewerId === targetUserId) {
      return NextResponse.json({ error: 'You cannot follow yourself' }, { status: 400 });
    }

    const target = await ensureTargetExists(targetUserId);
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await query(
      `INSERT INTO user_follows (id, follower_id, following_id)
       VALUES (UUID(), ?, ?)
       ON DUPLICATE KEY UPDATE follower_id = follower_id`,
      [viewerId, targetUserId]
    );

    if (targetUserId !== viewerId) {
      try {
        const actor = await queryOne('SELECT name FROM users WHERE id = ? LIMIT 1', [viewerId]);
        const actorName = actor?.name || 'Someone';

        await NotificationService.createNotification({
          userId: String(targetUserId),
          actorId: String(viewerId),
          actorName,
          type: 'new_follower',
          title: `${actorName} followed you`,
          metadata: {
            actorName,
          },
          aggregation: {
            key: `new_follower:${targetUserId}`,
            actionSingular: 'followed you',
            actionPlural: 'followed you',
            maxActors: 3,
          },
        });
      } catch (notifyError) {
        console.warn('[follow] Failed to create follow notification', notifyError);
      }
    }

    const summary = await buildSummary({ viewerId, targetUserId });

    return NextResponse.json({
      userId: targetUserId,
      ...summary,
    });
  } catch (error) {
    console.error('Failed to follow user:', error);
    return NextResponse.json({ error: 'Failed to follow user', message: error.message }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  try {
    const targetUserId = parseTargetUserId(params?.userId);
    if (!targetUserId) {
      return NextResponse.json({ error: 'Invalid user identifier' }, { status: 400 });
    }

    const viewerId = await getViewerId();
    if (viewerId === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (viewerId === targetUserId) {
      return NextResponse.json({ error: 'You cannot unfollow yourself' }, { status: 400 });
    }

    await query(
      `DELETE FROM user_follows
       WHERE follower_id = ?
         AND following_id = ?`,
      [viewerId, targetUserId]
    );

    const summary = await buildSummary({ viewerId, targetUserId });

    return NextResponse.json({
      userId: targetUserId,
      ...summary,
    });
  } catch (error) {
    console.error('Failed to unfollow user:', error);
    return NextResponse.json({ error: 'Failed to unfollow user', message: error.message }, { status: 500 });
  }
}
