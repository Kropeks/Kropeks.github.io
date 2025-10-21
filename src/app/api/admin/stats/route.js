import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAdminStats } from '@/lib/actions/admin.actions';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = session.user.email?.toLowerCase();
    const userRole = session.user.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN' || userEmail === 'savoryadmin@example.com';

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const stats = await getAdminStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json({ error: 'Failed to load admin stats' }, { status: 500 });
  }
}
