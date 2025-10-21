import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { query, transaction } from '@/lib/db';
import { baseSelectSql, mapPostRow } from '../route';
const resolveUserId = (rawId) => {
  if (rawId === null || rawId === undefined) {
    return null;
  }

  if (typeof rawId === 'number') {
    return Number.isFinite(rawId) ? rawId : null;
  }

  const stringId = rawId.toString().trim();
  if (!stringId) {
    return null;
  }

  const parsed = Number.parseInt(stringId, 10);
  if (!Number.isNaN(parsed) && parsed.toString() === stringId) {
    return parsed;
  }

  return stringId;
};

const fetchPostOwner = async (postId) => {
  const rows = await query(
    'SELECT id, user_id FROM community_posts WHERE id = ? LIMIT 1',
    [postId]
  );
  const record = rows?.[0];
  return record ? { id: record.id, userId: record.user_id } : null;
};

const loadPostForViewer = async (postId, viewerId) => {
  const rows = await query(
    `${baseSelectSql}
    WHERE p.id = ?
    LIMIT 1`,
    [viewerId, viewerId, viewerId, viewerId, viewerId, viewerId, postId]
  );
  return rows?.[0] ? mapPostRow(rows[0]) : null;
};

export async function GET(_request, { params }) {
  try {
    const parsedPostId = Number.parseInt(params?.postId ?? '', 10);
    if (!Number.isFinite(parsedPostId) || parsedPostId <= 0) {
      return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 });
    }

    let viewerId = null;
    try {
      const session = await auth();
      viewerId = resolveUserId(session?.user?.id ?? null);
    } catch (error) {
      console.warn('[community] Unable to resolve session for post GET:', error?.message || error);
      viewerId = null;
    }

    const post = await loadPostForViewer(parsedPostId, viewerId);
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error('Error fetching community post:', error);
    return NextResponse.json(
      { error: 'Failed to fetch post', message: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const viewerId = resolveUserId(session.user.id);
    if (viewerId === null) {
      return NextResponse.json({ error: 'Invalid user context' }, { status: 400 });
    }

    const parsedPostId = Number.parseInt(params?.postId ?? '', 10);
    if (!Number.isFinite(parsedPostId) || parsedPostId <= 0) {
      return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 });
    }

    const existing = await fetchPostOwner(parsedPostId);
    if (!existing) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (existing.userId !== viewerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (error) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const contentRaw = payload?.content?.toString();
    const imageUrlRaw = payload?.imageUrl?.toString();

    if (contentRaw === undefined && imageUrlRaw === undefined) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const setStatements = [];
    const parameters = [];

    if (contentRaw !== undefined) {
      const trimmed = contentRaw.trim();
      if (!trimmed) {
        return NextResponse.json({ error: 'Post content may not be empty' }, { status: 400 });
      }
      if (trimmed.length > 2000) {
        return NextResponse.json({ error: 'Post content exceeds the 2000 character limit' }, { status: 400 });
      }
      setStatements.push('content = ?');
      parameters.push(trimmed);
    }

    if (imageUrlRaw !== undefined) {
      const trimmedUrl = imageUrlRaw.trim();
      setStatements.push('image_url = ?');
      parameters.push(trimmedUrl ? trimmedUrl.slice(0, 500) : null);
    }

    if (!setStatements.length) {
      return NextResponse.json({ error: 'No valid updates supplied' }, { status: 400 });
    }

    await transaction(async (connection) => {
      const sql = `UPDATE community_posts SET ${setStatements.join(', ')}, updated_at = NOW() WHERE id = ?`;
      await connection.query(sql, [...parameters, parsedPostId]);
    });

    const post = await loadPostForViewer(parsedPostId, viewerId);
    if (!post) {
      return NextResponse.json({ error: 'Unable to load updated post' }, { status: 500 });
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error('Error updating community post:', error);
    return NextResponse.json(
      { error: 'Failed to update post', message: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(_request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const viewerId = resolveUserId(session.user.id);
    if (viewerId === null) {
      return NextResponse.json({ error: 'Invalid user context' }, { status: 400 });
    }

    const parsedPostId = Number.parseInt(params?.postId ?? '', 10);
    if (!Number.isFinite(parsedPostId) || parsedPostId <= 0) {
      return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 });
    }

    const post = await fetchPostOwner(parsedPostId);
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.userId !== viewerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await transaction(async (connection) => {
      await connection.query('DELETE FROM community_posts WHERE id = ?', [parsedPostId]);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting community post:', error);
    return NextResponse.json(
      { error: 'Failed to delete post', message: error.message },
      { status: 500 }
    );
  }
}
