import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUsers } from '@/lib/actions/admin.actions';

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

export async function GET(request) {
  try {
    const session = await auth();
    const authError = ensureAdmin(session);

    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }

    const { searchParams } = new URL(request.url);

    const page = Number.parseInt(searchParams.get('page') ?? '1', 10) || 1;
    const limit = Number.parseInt(searchParams.get('limit') ?? '10', 10) || 10;
    const status = searchParams.get('status') ?? 'all';
    const search = searchParams.get('search') ?? '';

    const data = await getUsers({ page, limit, status, search });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in admin users API:', error);
    const status = error.message === 'Unauthorized' ? 403 : 500;
    const message = status === 403 ? 'Forbidden' : 'Failed to load users';
    return NextResponse.json({ error: message }, { status });
  }
}
