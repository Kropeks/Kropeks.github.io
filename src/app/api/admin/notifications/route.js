import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { query } from '@/lib/db';
import { NotificationService } from '@/lib/notifications/service';

const ADMIN_EMAIL_FALLBACK = 'savoryadmin@example.com';
const ALLOWED_TYPES = new Set(['admin_message', 'system']);
const INSERT_BATCH_SIZE = 500;
const TITLE_MAX_LENGTH = 120;
const BODY_MAX_LENGTH = 1000;

async function ensureAdmin() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  const role = session?.user?.role?.toUpperCase();

  const isAdmin = role === 'ADMIN' || email === ADMIN_EMAIL_FALLBACK;
  if (!isAdmin) {
    return { ok: false };
  }

  return { ok: true, userId: session.user.id };
}

function sanitizeUserIds(rawIds) {
  if (!Array.isArray(rawIds)) {
    return [];
  }

  const deduped = new Set();
  for (const value of rawIds) {
    if (value === null || value === undefined) {
      continue;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      deduped.add(parsed);
    }
  }

  return Array.from(deduped);
}

async function fetchTargetUserIds(specifiedIds) {
  if (specifiedIds.length > 0) {
    return specifiedIds;
  }

  const rows = await query(
    `SELECT id
     FROM users`
  );

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => {
      const id = Number.parseInt(row?.id, 10);
      return Number.isNaN(id) ? null : id;
    })
    .filter((id) => id !== null);
}

function normalizeMetadata(raw) {
  if (raw === null || raw === undefined) {
    return { value: null };
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { value: null };
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        return { value: parsed };
      }
      return { error: 'Metadata must be a JSON object' };
    } catch (error) {
      return { error: 'Metadata must be valid JSON' };
    }
  }

  if (typeof raw === 'object') {
    try {
      return { value: JSON.parse(JSON.stringify(raw)) };
    } catch (error) {
      console.warn('[admin notifications] Failed to serialize metadata', error);
      return { error: 'Unable to serialize metadata object' };
    }
  }

  return { error: 'Unsupported metadata format' };
}

async function broadcastNotifications(targetIds, payload) {
  let total = 0;

  for (let index = 0; index < targetIds.length; index += INSERT_BATCH_SIZE) {
    const slice = targetIds.slice(index, index + INSERT_BATCH_SIZE);

    const entries = slice.map((id) => ({
      userId: String(id),
      actorId: payload.actorId ?? null,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      metadata: payload.metadata,
      notify: payload.notify,
    }));

    const created = await NotificationService.createNotificationsBulk(entries);
    total += created.length;
  }

  return total;
}

async function logBroadcast({ adminId, type, title, body, metadataJson, targetCount, createdCount, notify }) {
  try {
    await query(
      `INSERT INTO admin_notifications_log (admin_id, type, title, body, metadata, target_count, created_count, notify)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adminId ? Number.parseInt(adminId, 10) || null : null,
        type,
        title,
        body,
        metadataJson,
        targetCount,
        createdCount,
        notify ? 1 : 0,
      ]
    );
  } catch (error) {
    console.warn('[admin notifications] Failed to log broadcast', error);
  }
}

export async function POST(request) {
  try {
    const authStatus = await ensureAdmin();
    if (!authStatus.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const title = body?.title?.toString().trim();
    const message = body?.body?.toString() ?? null;
    const rawType = body?.type?.toString().trim().toLowerCase();
    const type = ALLOWED_TYPES.has(rawType) ? rawType : 'admin_message';
    const notify = body?.notify !== false;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    if (title.length > TITLE_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Title exceeds maximum length of ${TITLE_MAX_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (typeof message === 'string' && message.length > BODY_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Body exceeds maximum length of ${BODY_MAX_LENGTH} characters` },
        { status: 400 }
      );
    }

    const metadataResult = normalizeMetadata(body?.metadata ?? null);
    if (metadataResult.error) {
      return NextResponse.json({ error: metadataResult.error }, { status: 400 });
    }

    const metadata = metadataResult.value;
    const specifiedIds = sanitizeUserIds(body?.userIds ?? []);

    const targetIds = await fetchTargetUserIds(specifiedIds);
    if (!targetIds.length) {
      return NextResponse.json({ error: 'No target users found' }, { status: 400 });
    }

    const createdCount = await broadcastNotifications(targetIds, {
      actorId: authStatus.userId ? String(authStatus.userId) : null,
      type,
      title,
      body: message,
      metadata,
      notify,
    });

    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    await logBroadcast({
      adminId: authStatus.userId,
      type,
      title,
      body: message,
      metadataJson,
      targetCount: targetIds.length,
      createdCount,
      notify,
    });

    return NextResponse.json({
      status: 'ok',
      created: createdCount,
      recipients: targetIds.length,
      type,
    });
  } catch (error) {
    console.error('[admin notifications] broadcast error', error);
    return NextResponse.json({ error: 'Failed to broadcast notifications' }, { status: 500 });
  }
}
