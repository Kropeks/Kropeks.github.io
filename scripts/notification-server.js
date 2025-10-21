import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { NotificationHub } from '../src/lib/notifications/hub.js';
import { verifyNotificationToken } from '../src/lib/notifications/jwt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env'), override: false });
loadEnv({ path: path.resolve(__dirname, '..', '.env.local'), override: true });

const PORT = Number(process.env.NOTIFICATIONS_WS_PORT || 4001);
const HOST = process.env.NOTIFICATIONS_WS_HOST || '0.0.0.0';
const SECRET = process.env.NOTIFICATIONS_WS_SECRET;

if (!SECRET) {
  console.warn('[notification-server] WARN: NOTIFICATIONS_WS_SECRET is not set; socket auth will fail.');
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || (req.url !== '/api/notify' && req.url !== '/api/chat/broadcast')) {
    res.writeHead(404).end();
    return;
  }

  if (!SECRET) {
    res.writeHead(503).end('Server misconfigured');
    return;
  }

  if (req.headers['x-notify-secret'] !== SECRET) {
    res.writeHead(401).end('Unauthorized');
    return;
  }

  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    const payload = JSON.parse(body || '{}');

    if (payload.notifications && typeof payload.notifications === 'object') {
      NotificationHub.broadcastBulk(payload.notifications);
    } else if (payload.userId && payload.notification) {
      NotificationHub.broadcastNotification(payload.userId, payload.notification);
    } else if (payload.type === 'chat' && payload.conversationId && Array.isArray(payload.participantIds)) {
      NotificationHub.sendPayloadBulk(payload.participantIds, {
        type: 'chat-message',
        payload: {
          conversationId: payload.conversationId,
          message: payload.message,
        },
      });
    }

    res.writeHead(204).end();
  } catch (error) {
    console.error('[notification-server] Broadcast error', error);
    res.writeHead(500).end('Internal Server Error');
  }
});

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (socket, request, context) => {
  const { userId } = context;
  NotificationHub.registerConnection(userId, socket);

  socket.send(JSON.stringify({ type: 'connected', payload: { userId } }));

  socket.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (!parsed || parsed.type !== 'ping') {
        return;
      }
      socket.send(JSON.stringify({ type: 'pong', payload: Date.now() }));
    } catch (error) {
      console.warn('[notification-server] Failed to parse incoming message');
    }
  });
});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname !== '/ws/notifications') {
    socket.destroy();
    return;
  }

  const token = url.searchParams.get('token');

  if (!token) {
    socket.destroy();
    return;
  }

  try {
    const { userId } = verifyNotificationToken(token);
    if (!userId) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, { userId });
    });
  } catch (error) {
    console.warn('[notification-server] Auth failed:', error.message);
    socket.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[notification-server] Listening on http://${HOST}:${PORT}`);
});
