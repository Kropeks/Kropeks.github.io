import { env } from 'node:process';

const DEFAULT_PORT = env.NOTIFICATIONS_WS_PORT || '4001';
const DEFAULT_HOST = env.NOTIFICATIONS_WS_HOST || 'localhost';
const NOTIFY_PATH = '/api/notify';
const CHAT_PATH = '/api/chat/broadcast';

const buildDefaultBroadcastUrl = (path) => {
  const protocol = env.NOTIFICATIONS_WS_USE_TLS === 'true' ? 'https' : 'http';
  return `${protocol}://${DEFAULT_HOST}:${DEFAULT_PORT}${path}`;
};

const broadcastUrl = env.NOTIFICATIONS_WS_BROADCAST_URL || buildDefaultBroadcastUrl(NOTIFY_PATH);
const chatBroadcastUrl = env.NOTIFICATIONS_WS_CHAT_BROADCAST_URL || buildDefaultBroadcastUrl(CHAT_PATH);
const secret = env.NOTIFICATIONS_WS_SECRET;

export async function broadcastNotification(userId, notification) {
  if (!secret) {
    console.warn('[notifications] Missing NOTIFICATIONS_WS_SECRET; skipping broadcast');
    return;
  }

  try {
    const response = await fetch(broadcastUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-notify-secret': secret,
      },
      body: JSON.stringify({ userId, notification }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      console.warn('[notifications] Broadcast request failed:', response.status, text);
    }
  } catch (error) {
    console.warn('[notifications] Broadcast request error:', error);
  }
}

export async function broadcastBulkNotifications(notificationsByUser) {
  if (!secret) {
    console.warn('[notifications] Missing NOTIFICATIONS_WS_SECRET; skipping broadcast');
    return;
  }

  try {
    const response = await fetch(broadcastUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-notify-secret': secret,
      },
      body: JSON.stringify({ notifications: notificationsByUser }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      console.warn('[notifications] Bulk broadcast request failed:', response.status, text);
    }
  } catch (error) {
    console.warn('[notifications] Bulk broadcast request error:', error);
  }
}

export async function broadcastChatMessage(participantIds, conversationId, message) {
  if (!secret) {
    console.warn('[notifications] Missing NOTIFICATIONS_WS_SECRET; skipping broadcast');
    return;
  }

  const ids = Array.isArray(participantIds) ? participantIds.filter(Boolean) : [];
  if (!ids.length || !conversationId || !message) {
    return;
  }

  try {
    const response = await fetch(chatBroadcastUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-notify-secret': secret,
      },
      body: JSON.stringify({ type: 'chat', participantIds: ids, conversationId, message }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      console.warn('[notifications] Chat broadcast request failed:', response.status, text);
    }
  } catch (error) {
    console.warn('[notifications] Chat broadcast request error:', error);
  }
}
