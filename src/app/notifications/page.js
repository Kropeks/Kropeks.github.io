'use client';

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Bell, Check, Loader2, RefreshCw } from 'lucide-react';

import { useNotifications } from '@/context/NotificationsContext';

const formatRelativeTime = (timestamp) => {
  if (!timestamp) {
    return '';
  }

  const created = new Date(timestamp);
  if (Number.isNaN(created.getTime())) {
    return '';
  }

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - created.getTime());

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  return created.toLocaleDateString();
};

const typeLabels = {
  new_follower: 'New follower',
  recipe_comment: 'Recipe comment',
  recipe_like: 'Recipe like',
  recipe_share: 'Recipe share',
  admin_message: 'Admin message',
  system: 'System notice',
};

function NotificationRow({ item, onMarkRead }) {
  const subtitle = typeLabels[item.type] ?? 'Notification';
  const markRead = useCallback(() => {
    if (!item.isRead) {
      onMarkRead(item.id);
    }
  }, [item.id, item.isRead, onMarkRead]);

  return (
    <li
      className={`rounded-2xl border px-4 py-3 transition-colors ${
        item.isRead
          ? 'border-transparent bg-white dark:bg-gray-900'
          : 'border-emerald-500/40 bg-emerald-50 dark:border-emerald-400/40 dark:bg-emerald-900/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
              {subtitle}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatRelativeTime(item.createdAt)}
            </span>
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{item.title}</p>
          {item.body ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">{item.body}</p>
          ) : null}
          {item.metadata?.title ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-300">{item.metadata.title}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-emerald-500 px-3 py-1 text-xs font-medium text-emerald-600 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-emerald-900/40 dark:disabled:border-gray-700 dark:disabled:text-gray-500"
          onClick={markRead}
          disabled={item.isRead}
        >
          <Check className="h-3.5 w-3.5" />
          {item.isRead ? 'Read' : 'Mark read'}
        </button>
      </div>
    </li>
  );
}

export default function NotificationsPage() {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    hasMore,
    loadingMore,
    loadMore,
    markAllAsRead,
    markAsRead,
    refresh,
  } = useNotifications();

  const handleMarkRead = useCallback(
    (id) => {
      markAsRead([id]);
    },
    [markAsRead]
  );

  const emptyState = useMemo(() => !loading && notifications.length === 0, [loading, notifications.length]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Notifications</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Stay up to date with activity from the Savory Flavors community.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-emerald-500 px-3 py-1 text-xs font-semibold text-emerald-600 dark:border-emerald-400 dark:text-emerald-300">
            {unreadCount} unread
          </span>
          <button
            type="button"
            onClick={() => markAllAsRead()}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-500 px-4 py-2 text-sm font-medium text-emerald-600 transition hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
            disabled={notifications.length === 0 || unreadCount === 0}
          >
            <Check className="h-4 w-4" />
            Mark all read
          </button>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-900/30 dark:text-red-200">
          Failed to load notifications. Please try again.
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center gap-2 text-gray-600 dark:text-gray-300">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading notifications…
        </div>
      ) : null}

      {emptyState ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-900">
          <Bell className="h-8 w-8 text-gray-400" />
          <div className="space-y-1">
            <p className="text-base font-semibold text-gray-800 dark:text-gray-100">You are all caught up</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Notifications will show here when someone interacts with your recipes and posts.
            </p>
          </div>
          <Link
            href="/community"
            className="rounded-full border border-emerald-500 px-4 py-2 text-sm font-medium text-emerald-600 transition hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
          >
            Explore the community
          </Link>
        </div>
      ) : null}

      {!emptyState ? (
        <section className="space-y-4">
          <ul className="space-y-3">
            {notifications.map((item) => (
              <NotificationRow key={item.id} item={item} onMarkRead={handleMarkRead} />
            ))}
          </ul>

          {hasMore ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-500 px-5 py-2 text-sm font-medium text-emerald-600 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                disabled={loadingMore}
              >
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
