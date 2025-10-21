import { v4 as uuidv4 } from 'uuid';

import { query, queryOne } from '@/lib/db';
import { broadcastNotification, broadcastBulkNotifications } from './transport.js';

const BASE_SELECT = `
  SELECT
    id,
    user_id,
    actor_id,
    type,
    title,
    body,
    metadata,
    is_read,
    read_at,
    created_at
  FROM notifications
`;

const DEFAULT_MAX_DISPLAY_ACTORS = 3;

const toUniqueList = (items = []) => {
  const seen = new Set();
  const result = [];
  for (const value of items) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

const formatAggregatedTitle = ({ actors = [], count = 1, aggregation = {}, fallback, actorName }) => {
  const singular = aggregation.actionSingular;
  const plural = aggregation.actionPlural ?? singular;

  if (!singular) {
    return fallback;
  }

  const names = actors.length ? actors : actorName ? [actorName] : [];
  if (!names.length || count <= 1) {
    const name = names[0];
    return name ? `${name} ${singular}` : fallback;
  }

  if (count === 2 || names.length === 2) {
    return `${names[0]} and ${names[1]} ${plural}`;
  }

  const others = count - 1;
  return `${names[0]} and ${others} others ${plural}`;
};

const mapNotificationRow = (row = {}) => {
  let metadata = null;
  if (row.metadata) {
    try {
      metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    } catch (error) {
      console.warn('[notifications] Failed to parse metadata JSON', error);
    }
  }

  return {
    id: row.id,
    userId: row.user_id,
    actorId: row.actor_id,
    type: row.type,
    title: row.title,
    body: row.body,
    metadata,
    isRead: Boolean(row.is_read),
    readAt: row.read_at,
    createdAt: row.created_at,
  };
};

const buildFilters = (filter = {}) => {
  const clauses = [];
  const params = [];

  if (filter.userId) {
    clauses.push('user_id = ?');
    params.push(filter.userId);
  }

  if (filter.onlyUnread) {
    clauses.push('is_read = 0');
  }

  if (filter.before) {
    clauses.push('created_at < ?');
    params.push(filter.before);
  }

  return { clauses, params };
};

async function listNotifications(userId, { limit = 20, cursor, filter } = {}) {
  if (!userId) {
    throw new Error('listNotifications requires userId');
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const filters = buildFilters({ userId, onlyUnread: filter === 'unread', before: cursor });

  let sql = BASE_SELECT;
  if (filters.clauses.length) {
    sql += ` WHERE ${filters.clauses.join(' AND ')}`;
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';

  const rows = await query(sql, [...filters.params, safeLimit + 1]);
  const result = Array.isArray(rows) ? rows : [];

  const hasMore = result.length > safeLimit;
  if (hasMore) {
    result.pop();
  }

  const notifications = result.map(mapNotificationRow);
  const nextCursor = hasMore ? notifications[notifications.length - 1]?.createdAt : null;

  const unreadCountRow = await queryOne(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0',
    [userId]
  );

  return {
    notifications,
    hasMore,
    nextCursor,
    unreadCount: Number(unreadCountRow?.total ?? 0),
  };
}

async function getUnreadCount(userId) {
  if (!userId) {
    throw new Error('getUnreadCount requires userId');
  }

  const row = await queryOne(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0',
    [userId]
  );

  return Number(row?.total ?? 0);
}

async function createNotification(payload) {
  const {
    userId,
    actorId = null,
    type,
    title,
    body = null,
    metadata: rawMetadata = null,
    notify = true,
    aggregation = null,
    actorName: explicitActorName = null,
  } = payload || {};

  if (!userId || !type || !title) {
    throw new Error('createNotification requires userId, type, and title');
  }

  let finalTitle = title;
  let finalBody = body;

  const baseMetadata = rawMetadata ? { ...rawMetadata } : {};
  const actorName = explicitActorName ?? baseMetadata.actorName ?? null;
  const aggregationConfig = aggregation ?? baseMetadata.aggregation ?? null;
  const aggregationKey = aggregationConfig?.key ?? baseMetadata.aggregationKey ?? null;
  const maxActors = Number.isFinite(Number(aggregationConfig?.maxActors))
    ? Number(aggregationConfig.maxActors)
    : DEFAULT_MAX_DISPLAY_ACTORS;
  const incrementAmount = Number.isFinite(Number(aggregationConfig?.increment))
    ? Number(aggregationConfig.increment)
    : 1;

  if (aggregationKey) {
    const existingRow = await queryOne(
      `${BASE_SELECT}
       WHERE user_id = ?
         AND type = ?
         AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.aggregationKey')) = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, type, aggregationKey]
    );

    if (existingRow) {
      const existing = mapNotificationRow(existingRow);
      const existingMeta = existing.metadata || {};

      const priorActors = Array.isArray(existingMeta.actors)
        ? existingMeta.actors
        : existingMeta.actorName
          ? [existingMeta.actorName]
          : [];
      const nextActors = toUniqueList([actorName, ...priorActors].filter(Boolean)).slice(0, maxActors);
      const priorCount = Number(existingMeta.count ?? 1) || 1;
      const newCount = priorCount + incrementAmount;

      const mergedMetadata = {
        ...existingMeta,
        ...baseMetadata,
        actorName,
        actors: nextActors,
        count: newCount,
        aggregationKey,
        aggregation: {
          ...existingMeta.aggregation,
          ...aggregationConfig,
        },
      };

      const updatedTitle =
        formatAggregatedTitle({
          actors: nextActors,
          count: newCount,
          aggregation: mergedMetadata.aggregation || {},
          fallback: title ?? existing.title,
          actorName,
        }) || title || existing.title;

      const updatedBody = finalBody ?? existing.body ?? null;

      await query(
        `UPDATE notifications
         SET title = ?,
             body = ?,
             metadata = ?,
             is_read = 0,
             read_at = NULL,
             created_at = NOW(3)
         WHERE id = ?`,
        [updatedTitle, updatedBody, JSON.stringify(mergedMetadata), existing.id]
      );

      const row = await queryOne(`${BASE_SELECT} WHERE id = ? LIMIT 1`, [existing.id]);
      const notification = mapNotificationRow(row || existingRow);

      if (notify) {
        await broadcastNotification(userId, notification);
      }

      return notification;
    }

    baseMetadata.aggregationKey = aggregationKey;
    baseMetadata.aggregation = {
      ...aggregationConfig,
    };

    const initialActors = actorName ? [actorName] : [];
    baseMetadata.actors = toUniqueList(initialActors).slice(0, maxActors);
    baseMetadata.count = Number(baseMetadata.count ?? 0) > 0 ? Number(baseMetadata.count) : 1;

    const formattedInitialTitle = formatAggregatedTitle({
      actors: baseMetadata.actors,
      count: baseMetadata.count,
      aggregation: baseMetadata.aggregation || {},
      fallback: finalTitle,
      actorName,
    });

    if (formattedInitialTitle) {
      finalTitle = formattedInitialTitle;
    }
  }

  baseMetadata.actorName = actorName;

  const id = uuidv4();
  const metadataJson = Object.keys(baseMetadata).length ? JSON.stringify(baseMetadata) : null;

  await query(
    `INSERT INTO notifications (id, user_id, actor_id, type, title, body, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, actorId, type, finalTitle, finalBody, metadataJson]
  );

  const row = await queryOne(`${BASE_SELECT} WHERE id = ? LIMIT 1`, [id]);
  const notification = mapNotificationRow(
    row || {
      id,
      user_id: userId,
      actor_id: actorId,
      type,
      title: finalTitle,
      body: finalBody,
      metadata: metadataJson,
      is_read: 0,
      created_at: new Date().toISOString(),
    }
  );

  if (notify) {
    await broadcastNotification(userId, notification);
  }

  return notification;
}

async function createNotificationsBulk(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return [];
  }

  const values = [];
  const notificationsByUser = {};

  for (const entry of items) {
    const {
      userId,
      actorId = null,
      type,
      title,
      body = null,
      metadata = null,
      notify = true,
    } = entry || {};

    if (!userId || !type || !title) {
      continue;
    }

    const id = uuidv4();
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    values.push([id, userId, actorId, type, title, body, metadataJson]);

    const notification = {
      id,
      userId,
      actorId,
      type,
      title,
      body,
      metadata,
      isRead: false,
      createdAt: new Date().toISOString(),
      readAt: null,
    };

    if (notify) {
      if (!notificationsByUser[userId]) {
        notificationsByUser[userId] = [];
      }
      notificationsByUser[userId].push(notification);
    }
  }

  if (!values.length) {
    return [];
  }

  const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
  const flat = values.flat();

  await query(
    `INSERT INTO notifications (id, user_id, actor_id, type, title, body, metadata)
     VALUES ${placeholders}`,
    flat
  );

  if (Object.keys(notificationsByUser).length) {
    await broadcastBulkNotifications(notificationsByUser);
  }

  return values.map(([id, userId]) => ({ id, userId }));
}

async function markNotificationsRead(userId, ids = []) {
  if (!userId) {
    throw new Error('markNotificationsRead requires userId');
  }

  if (!Array.isArray(ids) || !ids.length) {
    return { updated: 0 };
  }

  const placeholders = ids.map(() => '?').join(',');
  const params = [userId, ...ids];

  const result = await query(
    `UPDATE notifications
     SET is_read = 1,
         read_at = NOW(3)
     WHERE user_id = ?
       AND id IN (${placeholders})
       AND is_read = 0`,
    params
  );

  return { updated: result?.affectedRows ?? 0 };
}

async function markAllNotificationsRead(userId) {
  if (!userId) {
    throw new Error('markAllNotificationsRead requires userId');
  }

  const result = await query(
    `UPDATE notifications
     SET is_read = 1,
         read_at = NOW(3)
     WHERE user_id = ?
       AND is_read = 0`,
    [userId]
  );

  return { updated: result?.affectedRows ?? 0 };
}

export const NotificationService = {
  listNotifications,
  createNotification,
  createNotificationsBulk,
  markNotificationsRead,
  markAllNotificationsRead,
  getUnreadCount,
};
