import jwt from 'jsonwebtoken';

const SECRET = process.env.NOTIFICATIONS_WS_SECRET;
const ISSUER = process.env.NOTIFICATIONS_WS_ISSUER || 'savoryflavors';
const AUDIENCE = process.env.NOTIFICATIONS_WS_AUDIENCE || 'savoryflavors:notifications';
const DEFAULT_TTL = process.env.NOTIFICATIONS_WS_TOKEN_TTL || '15m';

export function signNotificationToken({ userId, sessionId, expiresIn } = {}) {
  if (!SECRET) {
    throw new Error('Missing NOTIFICATIONS_WS_SECRET environment variable');
  }

  if (!userId) {
    throw new Error('signNotificationToken requires a userId');
  }

  const payload = {
    sub: String(userId),
  };

  if (sessionId) {
    payload.sid = sessionId;
  }

  return jwt.sign(payload, SECRET, {
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: expiresIn || DEFAULT_TTL,
  });
}

export function verifyNotificationToken(token) {
  if (!SECRET) {
    throw new Error('Missing NOTIFICATIONS_WS_SECRET environment variable');
  }

  if (!token) {
    throw new Error('No token provided');
  }

  const decoded = jwt.verify(token, SECRET, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  return {
    userId: decoded.sub,
    sessionId: decoded.sid || null,
    issuedAt: decoded.iat ? decoded.iat * 1000 : null,
    expiresAt: decoded.exp ? decoded.exp * 1000 : null,
  };
}
