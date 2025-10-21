import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { signNotificationToken } from '@/lib/notifications/jwt';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST() {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = signNotificationToken({ userId });

    return NextResponse.json({ token });
  } catch (error) {
    console.error('[notifications] auth token error', error);
    return NextResponse.json({ error: 'Failed to issue notification token' }, { status: 500 });
  }
}
