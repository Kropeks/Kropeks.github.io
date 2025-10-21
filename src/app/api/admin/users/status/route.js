import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { updateUserStatus } from '@/lib/actions/admin.actions';

const ensureAdmin = (session) => {
  if (!session?.user) {
    return { error: 'Unauthorized', status: 401 };
  }

  const userEmail = session.user.email?.toLowerCase();
  const userRole = session.user.role?.toUpperCase();
  const isAdmin = userRole === 'ADMIN' || userEmail === 'savoryadmin@example.com';

  if (!isAdmin) {
    return { error: 'Forbidden', status: 403 };
  }

  return null;
};

export async function POST(request) {
  try {
    const session = await auth();
    const authError = ensureAdmin(session);

    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }

    const body = await request.json();
    const userIdValue = body?.userId;
    const status = body?.status;

    if (!userIdValue || !status) {
      return NextResponse.json({ error: 'userId and status are required' }, { status: 400 });
    }

    const userId = Number.parseInt(userIdValue, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
    }

    const result = await updateUserStatus(userId, status);
    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || 'Failed to update user status';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    console.error('Error updating user status via API:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
