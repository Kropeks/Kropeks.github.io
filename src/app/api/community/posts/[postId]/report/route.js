import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { query, queryOne } from '@/lib/db';
import { NotificationService } from '@/lib/notifications/service';

const MAX_REASON_LENGTH = 1000;
const REPORT_TYPE = 'community_post';
const DUPLICATE_STATUS = ['pending', 'reviewed'];

const toIntId = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

export async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const viewerId = toIntId(session.user.id);
    if (!viewerId) {
      return NextResponse.json({ error: 'Invalid user context' }, { status: 400 });
    }

    const postId = toIntId(params?.postId);
    if (!postId) {
      return NextResponse.json({ error: 'Invalid post identifier' }, { status: 400 });
    }

    const payload = await request.json().catch(() => null);
    const reasonRaw = payload?.reason?.toString() ?? '';
    const reason = reasonRaw.trim();

    if (!reason) {
      return NextResponse.json({ error: 'Please provide a reason for reporting this post.' }, { status: 400 });
    }

    if (reason.length > MAX_REASON_LENGTH) {
      return NextResponse.json(
        { error: `Report reason must be ${MAX_REASON_LENGTH} characters or less.` },
        { status: 400 }
      );
    }

    const post = await queryOne(
      'SELECT id, user_id, content FROM community_posts WHERE id = ? LIMIT 1',
      [postId]
    );
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const existingReport = await queryOne(
      `SELECT id, status
       FROM reports
       WHERE reporter_id = ?
         AND reported_item_id = ?
         AND reported_item_type = ?
         AND status IN (${DUPLICATE_STATUS.map(() => '?').join(', ')})
       LIMIT 1`,
      [viewerId, postId, REPORT_TYPE, ...DUPLICATE_STATUS]
    );

    if (existingReport) {
      return NextResponse.json(
        {
          error: 'You have already reported this post. Our moderators are reviewing it.',
          reportId: existingReport.id,
        },
        { status: 409 }
      );
    }

    const result = await query(
      `INSERT INTO reports (reporter_id, reported_item_id, reported_item_type, reason, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [viewerId, postId, REPORT_TYPE, reason]
    );

    const reportId = result?.insertId ?? null;

    const notifications = [];
    const postOwnerId = Number.isFinite(post?.user_id) ? Number(post.user_id) : null;
    const subjectLink = `/community/posts/${postId}`;

    const metadataBase = {
      reportId,
      reportedItemId: postId,
      reportedItemType: REPORT_TYPE,
      link: subjectLink,
    };

    try {
      notifications.push(
        NotificationService.createNotification({
          userId: viewerId,
          actorId: viewerId,
          type: 'report.received',
          title: 'Thanks for your report',
          body: 'Our moderators will review the post and take action if needed.',
          metadata: {
            ...metadataBase,
            category: payload?.category ?? null,
          },
        })
      );

      if (postOwnerId && postOwnerId !== viewerId) {
        notifications.push(
          NotificationService.createNotification({
            userId: postOwnerId,
            actorId: viewerId,
            type: 'report.flaggedOwner',
            title: 'Your post has been reported',
            body: 'Another community member flagged your post. Please review it to ensure it follows our guidelines.',
            metadata: {
              ...metadataBase,
              category: payload?.category ?? null,
            },
          })
        );
      }

      if (notifications.length) {
        await Promise.allSettled(notifications);
      }
    } catch (notifyError) {
      console.error('Failed to dispatch report notifications:', notifyError);
    }

    return NextResponse.json({
      report: {
        id: reportId,
        status: 'pending',
      },
      message: 'Thank you for letting us know. Our moderators will review this post shortly.',
    });
  } catch (error) {
    console.error('Error reporting community post:', error);
    return NextResponse.json(
      { error: 'Failed to submit report', message: error.message },
      { status: 500 }
    );
  }
}
