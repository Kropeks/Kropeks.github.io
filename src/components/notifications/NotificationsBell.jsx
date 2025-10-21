'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Bell, Check, Loader2 } from 'lucide-react';

import { useNotifications } from '@/context/NotificationsContext';

const MAX_VISIBLE = 6;

const formatAge = (timestamp) => {
  if (!timestamp) {
    return '';
  }

  const created = new Date(timestamp);
  const now = new Date();
  const diff = Math.max(0, now.getTime() - created.getTime());

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

const resolveNotificationHref = (item) => {
  const meta = item?.metadata || {};
  if (meta.postId) {
    const commentId = meta.commentId || meta.latestCommentId || null;
    if (commentId) {
      return `/community/posts/${meta.postId}?commentId=${commentId}`;
    }
    return `/community/posts/${meta.postId}`;
  }
  if (meta.href) {
    return meta.href;
  }
  return null;
};

const NotificationItem = ({ item, isLast, onNavigate }) => {
  const metadataTitle = item?.metadata?.title;
  const previewText = item?.metadata?.previewText;
  const previewActor = item?.metadata?.actorName;
  const previewImage = item?.metadata?.postImage;
  const actors = item?.metadata?.actors;
  const aggregatedCount = item?.metadata?.count;
  const showActorStack = Array.isArray(actors) && actors.length > 0;
  const stripAccent = item?.isRead
    ? 'border-l border-transparent hover:bg-emerald-50/50 dark:border-gray-800 dark:hover:bg-emerald-900/30'
    : 'border-l-2 border-emerald-500 bg-emerald-50/80 hover:bg-emerald-100/80 dark:border-emerald-500 dark:bg-emerald-900/25 dark:hover:bg-emerald-900/40';
  const divider = isLast ? '' : 'border-b border-gray-100 dark:border-gray-800';
  const href = resolveNotificationHref(item);

  const content = (
    <div className={`group relative flex gap-3 px-3 py-2 transition ${stripAccent} ${divider}`}>
      {previewImage ? (
        <div className="mt-0.5 h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border border-emerald-200/60 shadow-sm dark:border-emerald-700/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewImage}
            alt="Post preview"
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-gray-900 transition group-hover:text-emerald-700 dark:text-gray-50 dark:group-hover:text-emerald-300">
              {item.title}
            </p>
            {showActorStack ? (
              <div className="flex flex-wrap items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                {actors.slice(0, 3).map((name) => (
                  <span key={name} className="font-medium">
                    {name}
                  </span>
                ))}
                {aggregatedCount && aggregatedCount > actors.length ? (
                  <span className="text-gray-600 dark:text-gray-400">+{aggregatedCount - actors.length}</span>
                ) : null}
              </div>
            ) : null}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
            {formatAge(item.createdAt)}
          </span>
        </div>

        {metadataTitle ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-300">
            {metadataTitle}
          </p>
        ) : null}

        {previewActor || previewText || item.body ? (
          <div className="flex flex-wrap items-center gap-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
            {previewActor ? <span className="font-medium text-emerald-700 dark:text-emerald-200">{previewActor}</span> : null}
            {previewText ? <span className="line-clamp-2 flex-1">{previewText}</span> : null}
            {!previewText && item.body ? <span className="line-clamp-2 flex-1">{item.body}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        {content}
      </Link>
    );
  }

  return content;
};

export function NotificationsBell() {
  const {
    notifications,
    unreadCount,
    loading,
    markAllAsRead,
  } = useNotifications();

  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const hasNotifications = notifications.length > 0;

  useEffect(() => {
    const handler = (event) => {
      if (!open) return;
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);

    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const visibleNotifications = useMemo(() => notifications.slice(0, MAX_VISIBLE), [notifications]);

  const handleToggle = () => {
    setOpen((prev) => !prev);
  };

  const handleMarkAll = async () => {
    await markAllAsRead();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:border-emerald-400 hover:text-emerald-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-500 px-1 text-[0.625rem] font-semibold text-white shadow">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-x-4 top-24 z-50 mx-auto w-auto max-w-md max-h-[75vh] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-900 sm:inset-x-8 sm:max-w-lg md:absolute md:inset-auto md:top-12 md:right-0 md:mx-0 md:w-[420px] md:max-h-[520px]">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Stay up to date with activity</p>
            </div>
            <button
              type="button"
              onClick={handleMarkAll}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-500 px-2.5 py-1 text-xs font-medium text-emerald-600 transition hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
              disabled={!hasNotifications || unreadCount === 0}
            >
              <Check className="h-3.5 w-3.5" />
              Mark all read
            </button>
          </div>

          <div className="max-h-[55vh] overflow-y-auto px-3 py-2 md:max-h-[360px]">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-600 dark:text-gray-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : null}

            {!loading && !hasNotifications ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                <Bell className="h-6 w-6 text-gray-400" />
                <p>No notifications yet.</p>
              </div>
            ) : null}

            <div className="flex flex-col">
              {visibleNotifications.map((item, index) => (
                <NotificationItem
                  key={item.id}
                  item={item}
                  isLast={index === visibleNotifications.length - 1}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <span>
              Showing {visibleNotifications.length} of {notifications.length}
            </span>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-300 dark:hover:text-emerald-200"
            >
              View all
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
