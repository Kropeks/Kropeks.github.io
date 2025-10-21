import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getSubscriptions, updateSubscription } from '@/lib/actions/admin.actions';

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
    const status = searchParams.get('status') ?? 'active';
    const search = searchParams.get('search') ?? '';

    const data = await getSubscriptions({ page, limit, status, search });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    const statusCode = error.message === 'Unauthorized' ? 403 : 500;
    const message = statusCode === 403 ? 'Forbidden' : 'Failed to load subscriptions';
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}

export async function PATCH(request) {
  try {
    const session = await auth();
    const authError = ensureAdmin(session);

    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }

    const body = await request.json();
    const subscriptionIdValue = body?.subscriptionId;
    const updateData = body?.data ?? {};

    if (!subscriptionIdValue) {
      return NextResponse.json({ error: 'subscriptionId is required' }, { status: 400 });
    }

    const subscriptionId = Number.parseInt(subscriptionIdValue, 10);
    if (!Number.isFinite(subscriptionId) || subscriptionId <= 0) {
      return NextResponse.json({ error: 'Invalid subscriptionId' }, { status: 400 });
    }

    const result = await updateSubscription(subscriptionId, updateData);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating subscription:', error);
    const message = error.message || 'Failed to update subscription';
    const statusCode = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
