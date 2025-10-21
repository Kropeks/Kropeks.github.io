import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { NotificationService } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getSessionUserId() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return null;
  }
  return String(userId);
}

export async function POST(request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let payload = {};
    try {
      payload = await request.json();
    } catch (error) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const markAll = payload?.all === true || payload?.markAll === true;
    const ids = Array.isArray(payload?.ids) ? payload.ids.filter(Boolean) : [];

    if (!markAll && ids.length === 0) {
      return NextResponse.json({ error: 'Provide notification ids or set markAll=true' }, { status: 400 });
    }

    const result = markAll
      ? await NotificationService.markAllNotificationsRead(userId)
      : await NotificationService.markNotificationsRead(userId, ids);

    const unreadCount = await NotificationService.getUnreadCount(userId);

    return NextResponse.json({ updated: result.updated ?? 0, unreadCount });
  } catch (error) {
    console.error('[notifications] mark-read error', error);
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
  }
}
