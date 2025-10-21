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

export async function GET(request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Number.parseInt(searchParams.get('limit') || '20', 10);
    const cursor = searchParams.get('cursor') || undefined;
    const filter = searchParams.get('filter') || undefined;

    const data = await NotificationService.listNotifications(userId, {
      limit,
      cursor,
      filter,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('[notifications] GET error', error);
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
  }
}
