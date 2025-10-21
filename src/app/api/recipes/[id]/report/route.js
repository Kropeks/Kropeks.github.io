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

    const rawRecipeParam = params?.id;
    const itemKey = coerceReason(rawRecipeParam);

    if (!itemKey) {
      return NextResponse.json({ error: 'Invalid recipe identifier' }, { status: 400 });
    }

    const payload = await request.json();
    const rawReason = coerceReason(payload?.reason);
    const rawCategory = coerceReason(payload?.category);

    if (!rawCategory) {
      return NextResponse.json({ error: 'Select a category for this report.' }, { status: 400 });
    }

    if (!rawReason) {
      return NextResponse.json({ error: 'Please describe what is wrong with this recipe.' }, { status: 400 });
    }

    if (rawReason.length > MAX_REASON_LENGTH) {
      return NextResponse.json({ error: `Report reason must be ${MAX_REASON_LENGTH} characters or less.` }, { status: 400 });
    }

    const recipeRow = await queryOne(
      `SELECT id, slug, user_id AS owner_id, title
       FROM recipes
       WHERE id = ? OR slug = ?
       LIMIT 1`,
      [itemKey, itemKey]
    );

    if (!recipeRow?.id) {
      return NextResponse.json({ error: 'Recipe not found.' }, { status: 404 });
    }

    const recipeId = Number.parseInt(recipeRow.id, 10);
    if (!Number.isFinite(recipeId) || recipeId <= 0) {
      return NextResponse.json({ error: 'Recipe not found.' }, { status: 404 });
    }

    if (recipeRow.owner_id != null && Number(recipeRow.owner_id) === reporterId) {
      return NextResponse.json({ error: 'You cannot report your own recipe.' }, { status: 400 });
    }

    const existing = await queryOne(
      `SELECT id, status
       FROM reports
       WHERE reporter_id = ? AND reported_item_id = ? AND reported_item_type = 'recipe'
       ORDER BY created_at DESC
       LIMIT 1`,
      [reporterId, recipeId]
    );

    if (existing && DUPLICATE_STATUSES.has(existing.status)) {
      return NextResponse.json({ error: 'You already reported this recipe and it is under review.' }, { status: 409 });
    }

    const formattedReason = `${rawCategory}: ${rawReason}`;

    const insertResult = await query(
      `INSERT INTO reports (reporter_id, reported_item_id, reported_item_type, reason, status)
       VALUES (?, ?, 'recipe', ?, 'pending')`,
      [reporterId, recipeId, formattedReason]
    );

    const reportId = insertResult?.insertId ?? null;

    const metadata = {
      reportId,
      reportedItemId: recipeId,
      reportedItemType: 'recipe',
      link: `/recipes/${recipeRow.slug || recipeId}`,
      category: rawCategory || null,
    };

    try {
      const notifications = [
        NotificationService.createNotification({
          userId: reporterId,
          actorId: reporterId,
          type: 'report.received',
          title: 'Thanks for your report',
          body: 'We will review this recipe and take appropriate action if necessary.',
          metadata,
        }),
      ];

      const ownerId = Number.parseInt(recipeRow.owner_id, 10);
      if (Number.isFinite(ownerId) && ownerId > 0 && ownerId !== reporterId) {
        notifications.push(
          NotificationService.createNotification({
            userId: ownerId,
            actorId: reporterId,
            type: 'report.flaggedRecipe',
            title: 'Your recipe was reported',
            body: 'Another member reported your recipe. Please review our community guidelines to ensure compliance.',
            metadata,
          })
        );
      }

      await Promise.allSettled(notifications);
    } catch (notificationError) {
      console.error('Failed to send recipe report notifications:', notificationError);
    }

    return NextResponse.json({
      report: {
        id: reportId,
        status: 'pending',
      },
      message: 'Thank you for helping keep our community safe. Our moderators will review this recipe shortly.',
    });
  } catch (error) {
    console.error('Error reporting recipe:', error);
    return NextResponse.json({ error: 'Failed to submit report', message: error.message }, { status: 500 });
  }
}
