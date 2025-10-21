import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getReports, updateReportStatus } from '@/lib/actions/admin.actions';

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
    const status = searchParams.get('status') ?? 'open';
    const type = searchParams.get('type') ?? 'all';
    const search = searchParams.get('search') ?? '';

    const data = await getReports({ page, limit, status, type, search });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching reports:', error);
    const statusCode = error.message === 'Unauthorized' ? 403 : 500;
    const message = statusCode === 403 ? 'Forbidden' : 'Failed to load reports';
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
    const reportIdValue = body?.reportId;
    const statusValue = body?.status;

    if (!reportIdValue || !statusValue) {
      return NextResponse.json({ error: 'reportId and status are required' }, { status: 400 });
    }

    const reportId = Number.parseInt(reportIdValue, 10);
    if (!Number.isFinite(reportId) || reportId <= 0) {
      return NextResponse.json({ error: 'Invalid reportId' }, { status: 400 });
    }

    const result = await updateReportStatus(reportId, statusValue);
    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || 'Failed to update report status';
    const statusCode = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    console.error('Error updating report via API:', error);
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
