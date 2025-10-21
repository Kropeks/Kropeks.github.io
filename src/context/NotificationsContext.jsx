'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';

const NotificationsContext = createContext(null);

const WS_RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 20000];

export function NotificationsProvider({ children }) {
  const { data: session, status } = useSession();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const wsRef = useRef(null);
  const reconnectIndexRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const tokenRef = useRef(null);
  const isMountedRef = useRef(false);

  const userId = session?.user?.id;
  const isAuthenticated = status === 'authenticated' && !!userId;

  const resetConnectionState = useCallback(() => {
    reconnectIndexRef.current = 0;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (closeError) {
        console.warn('[notifications] Failed to close websocket', closeError);
      }
      wsRef.current = null;
    }
    resetConnectionState();
  }, [resetConnectionState]);

  const connectWebSocketRef = useRef(null);

  const mergeNotifications = useCallback((incoming, mode = 'prepend') => {
    if (!incoming) {
      return;
    }

    const list = Array.isArray(incoming) ? incoming : [incoming];
    if (list.length === 0) {
      return;
    }

    setNotifications((prev) => {
      let ordered;
      if (mode === 'replace') {
        ordered = [...list];
      } else if (mode === 'append') {
        ordered = [...prev, ...list];
      } else {
        ordered = [...list, ...prev];
      }

      const seen = new Set();
      const deduped = [];

      for (const item of ordered) {
        if (!item || !item.id) {
          continue;
        }

        if (seen.has(item.id)) {
          continue;
        }

        const normalized = {
          ...item,
          isRead: Boolean(item.isRead),
          readAt: item.readAt ?? null,
        };

        deduped.push(normalized);
        seen.add(item.id);
      }

      return deduped;
    });
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!isAuthenticated) {
      return;
    }

    const index = reconnectIndexRef.current;
    const delay = WS_RECONNECT_DELAYS[Math.min(index, WS_RECONNECT_DELAYS.length - 1)];
    reconnectIndexRef.current = Math.min(index + 1, WS_RECONNECT_DELAYS.length - 1);

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (typeof connectWebSocketRef.current === 'function') {
        connectWebSocketRef.current();
      }
    }, delay);
  }, [isAuthenticated]);

  const handleSocketMessage = useCallback((event) => {
    try {
      const parsed = JSON.parse(event.data);
      if (!parsed?.type) {
        return;
      }

      if (parsed.type === 'notification') {
        const notification = parsed.payload;
        mergeNotifications(notification, 'prepend');
        setUnreadCount((prev) => prev + 1);
      } else if (parsed.type === 'notifications') {
        const incoming = Array.isArray(parsed.payload) ? parsed.payload : [];
        if (!incoming.length) {
          return;
        }

        mergeNotifications(incoming, 'prepend');
        setUnreadCount((prev) => prev + incoming.length);
      } else if (parsed.type === 'chat-message') {
        const detail = parsed.payload;
        if (!detail) {
          return;
        }

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sf:chatMessage', { detail }));
        }
      } else if (parsed.type === 'connected' && parsed.payload?.userId) {
        resetConnectionState();
      }
    } catch (messageError) {
      console.warn('[notifications] Failed to parse websocket message', messageError);
    }
  }, [resetConnectionState]);

  const connectWebSocket = useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }

    try {
      if (!tokenRef.current) {
        const response = await fetch('/api/notifications/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.status === 401) {
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch notification auth token');
        }

        const data = await response.json();
        if (!data?.token) {
          throw new Error('Notification auth token missing from response');
        }

        tokenRef.current = data.token;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = new WebSocket(`${protocol}://${window.location.host}/ws/notifications?token=${encodeURIComponent(tokenRef.current)}`);

      socket.addEventListener('open', () => {
        resetConnectionState();
      });

      socket.addEventListener('message', handleSocketMessage);

      socket.addEventListener('close', (event) => {
        wsRef.current = null;
        if (!event.wasClean) {
          scheduleReconnect();
        }
      });

      socket.addEventListener('error', (event) => {
        console.warn('[notifications] Websocket error', event);
        socket.close();
      });

      wsRef.current = socket;
    } catch (connectError) {
      console.error('[notifications] websocket connect error', connectError);
      scheduleReconnect();
    }
  }, [handleSocketMessage, isAuthenticated, resetConnectionState, scheduleReconnect]);

  connectWebSocketRef.current = connectWebSocket;

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      setNotifications([]);
      setUnreadCount(0);
      setHasMore(false);
      setNextCursor(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/notifications?limit=20', { cache: 'no-store' });
      if (response.status === 401) {
        if (isMountedRef.current) {
          setNotifications([]);
          setUnreadCount(0);
          setHasMore(false);
          setNextCursor(null);
          setError(null);
        }
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to load notifications');
      }

      const data = await response.json();
      const list = Array.isArray(data?.notifications) ? data.notifications : [];
      mergeNotifications(list, 'replace');
      setUnreadCount(Number(data?.unreadCount ?? 0));
      setHasMore(Boolean(data?.hasMore));
      setNextCursor(data?.nextCursor ?? null);
    } catch (fetchError) {
      console.error('[notifications] load error', fetchError);
      setError(fetchError);
      setNotifications([]);
      setUnreadCount(0);
      setHasMore(false);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, mergeNotifications]);

  const loadMore = useCallback(async () => {
    if (!isAuthenticated || !hasMore || !nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);
    try {
      const url = new URL('/api/notifications', window.location.origin);
      url.searchParams.set('limit', '20');
      url.searchParams.set('cursor', nextCursor);

      const response = await fetch(url.toString(), { cache: 'no-store' });
      if (response.status === 401) {
        if (isMountedRef.current) {
          setHasMore(false);
          setNextCursor(null);
        }
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to load more notifications');
      }

      const data = await response.json();
      const list = Array.isArray(data?.notifications) ? data.notifications : [];
      mergeNotifications(list, 'append');
      setHasMore(Boolean(data?.hasMore));
      setNextCursor(data?.nextCursor ?? null);
    } catch (moreError) {
      console.error('[notifications] loadMore error', moreError);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, isAuthenticated, loadingMore, mergeNotifications, nextCursor]);

  const refresh = useCallback(() => fetchNotifications(), [fetchNotifications]);

  const markAsRead = useCallback(async (ids = []) => {
    if (!isAuthenticated) {
      return { updated: 0 };
    }

    const safeIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
    if (!safeIds.length) {
      return { updated: 0 };
    }

    try {
      const response = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: safeIds }),
      });

      if (response.status === 401) {
        return { updated: 0 };
      }

      if (!response.ok) {
        throw new Error('Failed to mark notifications read');
      }

      const result = await response.json();

      if (isMountedRef.current) {
        setNotifications((prev) =>
          prev.map((item) =>
            safeIds.includes(item.id)
              ? { ...item, isRead: true, readAt: new Date().toISOString() }
              : item
          )
        );
        setUnreadCount(Number(result?.unreadCount ?? 0));
      }

      return { updated: Number(result?.updated ?? 0) };
    } catch (markError) {
      console.error('[notifications] markAsRead failed', markError);
      return { updated: 0, error: markError };
    }
  }, [isAuthenticated, isMountedRef]);

  const markAllAsRead = useCallback(async () => {
    if (!isAuthenticated) {
      return { updated: 0 };
    }

    try {
      const response = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      });

      if (response.status === 401) {
        return { updated: 0 };
      }

      if (!response.ok) {
        throw new Error('Failed to mark notifications read');
      }

      const result = await response.json();

      if (isMountedRef.current) {
        setNotifications((prev) =>
          prev.map((item) => ({ ...item, isRead: true, readAt: new Date().toISOString() }))
        );
        setUnreadCount(Number(result?.unreadCount ?? 0));
      }

      return { updated: Number(result?.updated ?? 0) };
    } catch (markError) {
      console.error('[notifications] markAllAsRead failed', markError);
      return { updated: 0, error: markError };
    }
  }, [isAuthenticated, isMountedRef]);

  useEffect(() => {
    isMountedRef.current = true;

    if (!isAuthenticated) {
      disconnectWebSocket();
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      setHasMore(false);
      setNextCursor(null);

      return () => {
        isMountedRef.current = false;
        disconnectWebSocket();
      };
    }

    fetchNotifications().then(() => {
      connectWebSocket();
    });

    return () => {
      isMountedRef.current = false;
      disconnectWebSocket();
    };
  }, [connectWebSocket, disconnectWebSocket, fetchNotifications, isAuthenticated]);

  const value = useMemo(() => ({
    notifications,
    unreadCount,
    loading,
    error,
    hasMore,
    nextCursor,
    loadingMore,
    markAsRead,
    markAllAsRead,
    loadMore,
    refresh,
  }), [
    notifications,
    unreadCount,
    loading,
    error,
    hasMore,
    nextCursor,
    loadingMore,
    markAsRead,
    markAllAsRead,
    loadMore,
    refresh,
  ]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (context === null) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}
