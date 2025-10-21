import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { query, queryOne } from '@/lib/db';
import { NotificationService } from '@/lib/notifications/service';

const MAX_REASON_LENGTH = 1000;
const DUPLICATE_STATUSES = new Set(['pending', 'reviewed']);

const coerceReason = (value) => {
  if (!value) {
    return '';
  }

  return value.toString().trim();
};

export async function POST(request, { params }) {
  try {
    const session = await auth();
    const reporterId = Number.parseInt(session?.user?.id, 10);

    if (!Number.isFinite(reporterId) || reporterId <= 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const targetId = Number.parseInt(params?.userId, 10);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      return NextResponse.json({ error: 'Invalid user identifier' }, { status: 400 });
    }

    if (targetId === reporterId) {
      return NextResponse.json({ error: 'You cannot report your own profile.' }, { status: 400 });
    }

    const payload = await request.json();
    const rawReason = coerceReason(payload?.reason);
    const rawCategory = coerceReason(payload?.category);

    if (!rawCategory) {
      return NextResponse.json({ error: 'Select a category for this report.' }, { status: 400 });
    }

    if (!rawReason) {
      return NextResponse.json({ error: 'Please describe what is wrong with this profile.' }, { status: 400 });
    }

    if (rawReason.length > MAX_REASON_LENGTH) {
      return NextResponse.json({ error: `Report reason must be ${MAX_REASON_LENGTH} characters or less.` }, { status: 400 });
    }

    const reportedUser = await queryOne(
      'SELECT id, name FROM users WHERE id = ? LIMIT 1',
      [targetId]
    );

    if (!reportedUser?.id) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const existing = await queryOne(
      `SELECT id, status
       FROM reports
       WHERE reporter_id = ? AND reported_item_id = ? AND reported_item_type = 'user'
       ORDER BY created_at DESC
       LIMIT 1`,
      [reporterId, targetId]
    );

    if (existing && DUPLICATE_STATUSES.has(existing.status)) {
      return NextResponse.json({ error: 'You already reported this profile and it is under review.' }, { status: 409 });
    }

    const formattedReason = `${rawCategory}: ${rawReason}`;

    const insertResult = await query(
      `INSERT INTO reports (reporter_id, reported_item_id, reported_item_type, reason, status)
       VALUES (?, ?, 'user', ?, 'pending')`,
      [reporterId, targetId, formattedReason]
    );

    const reportId = insertResult?.insertId ?? null;

    const metadata = {
      reportId,
      reportedItemId: targetId,
      reportedItemType: 'user',
      link: `/users/${targetId}`,
      category: rawCategory || null,
    };

    try {
      const notifications = [
        NotificationService.createNotification({
          userId: reporterId,
          actorId: reporterId,
          type: 'report.received',
          title: 'Thanks for your report',
          body: 'We will review this user profile and take appropriate action if necessary.',
          metadata,
        }),
      ];

      if (reportedUser.id) {
        notifications.push(
          NotificationService.createNotification({
            userId: reportedUser.id,
            actorId: reporterId,
            type: 'report.flaggedUser',
            title: 'Your profile was reported',
            body: 'Another member reported your profile. Please review our community guidelines to ensure compliance.',
            metadata,
          })
        );
      }

      await Promise.allSettled(notifications);
    } catch (notificationError) {
      console.error('Failed to send user report notifications:', notificationError);
    }

    return NextResponse.json({
      report: {
        id: reportId,
        status: 'pending',
      },
      message: 'Thank you for helping keep our community safe. Our moderators will review this profile shortly.',
    });
  } catch (error) {
    console.error('Error reporting user profile:', error);
    return NextResponse.json({ error: 'Failed to submit report', message: error.message }, { status: 500 });
  }
}
