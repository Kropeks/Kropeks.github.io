const userConnections = new Map();

function registerConnection(userId, socket) {
  if (!userId || !socket) {
    return;
  }

  const key = String(userId);
  if (!userConnections.has(key)) {
    userConnections.set(key, new Set());
  }

  const sockets = userConnections.get(key);
  sockets.add(socket);

  socket.on('close', () => {
    sockets.delete(socket);
    if (sockets.size === 0) {
      userConnections.delete(key);
    }
  });
}

function removeConnection(socket) {
  if (!socket) {
    return;
  }

  for (const [userId, sockets] of userConnections.entries()) {
    if (sockets.has(socket)) {
      sockets.delete(socket);
      if (sockets.size === 0) {
        userConnections.delete(userId);
      }
      break;
    }
  }
}

function broadcastToUser(userId, payload) {
  if (!userId) {
    return 0;
  }

  const sockets = userConnections.get(String(userId));
  if (!sockets || sockets.size === 0) {
    return 0;
  }

  const message = JSON.stringify(payload);
  let delivered = 0;

  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(message);
      delivered += 1;
    }
  }

  return delivered;
}

function broadcastBulk(map) {
  if (!map || typeof map !== 'object') {
    return;
  }

  for (const [userId, notifications] of Object.entries(map)) {
    if (!Array.isArray(notifications) || notifications.length === 0) {
      continue;
    }

    broadcastToUser(userId, {
      type: 'notifications',
      payload: notifications,
    });
  }
}

export const NotificationHub = {
  registerConnection,
  removeConnection,
  broadcastNotification(userId, notification) {
    if (!notification) {
      return 0;
    }

    return broadcastToUser(userId, {
      type: 'notification',
      payload: notification,
    });
  },
  broadcastBulk,
  sendPayload(userId, payload) {
    if (!payload) {
      return 0;
    }

    return broadcastToUser(userId, payload);
  },
  sendPayloadBulk(userIds, payload) {
    if (!Array.isArray(userIds) || userIds.length === 0 || !payload) {
      return 0;
    }

    let delivered = 0;
    for (const id of userIds) {
      delivered += broadcastToUser(id, payload);
    }

    return delivered;
  },
  connectionCount() {
    let total = 0;
    for (const sockets of userConnections.values()) {
      total += sockets.size;
    }
    return total;
  },
};
