import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { query } from '@/lib/db';

const toNumberOrNull = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

const ensureAuthenticatedUserId = async () => {
  const session = await auth();
  const rawUserId = session?.user?.id;
  const userId = toNumberOrNull(rawUserId);
  if (!userId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { userId };
};

export async function DELETE(_request, { params }) {
  try {
    const { userId, error } = await ensureAuthenticatedUserId();
    if (error) {
      return error;
    }

    const pathParams = Array.isArray(params?.params) ? params.params : [];
    const recipeParam = pathParams[pathParams.length - 1];
    const recipeId = toNumberOrNull(recipeParam);

    if (recipeId === null) {
      return NextResponse.json({ error: 'recipeId is required' }, { status: 400 });
    }

    const result = await query(
      'DELETE FROM user_favorites WHERE user_id = ? AND recipe_id = ?',
      [userId, recipeId]
    );

    if (!result || result.affectedRows === 0) {
      return NextResponse.json({ error: 'Favorite not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing favorite:', error);
    return NextResponse.json({ error: 'Failed to remove favorite' }, { status: 500 });
  }
}
