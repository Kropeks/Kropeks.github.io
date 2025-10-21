'use client';

import { useCallback, useMemo, useState } from 'react';
import { Loader2, UserCheck, UserPlus } from 'lucide-react';
import { useSession } from 'next-auth/react';

import { useAuthModal } from '@/components/AuthProvider';

const formatCount = (value) => {
  const numeric = Number.isFinite(value) ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

export default function FollowUserButton({
  userId,
  initialFollowerCount = 0,
  initialIsFollowing = false,
  onFollowChange,
  showFollowerCount = true,
}) {
  const { status } = useSession();
  const { requireAuth } = useAuthModal();

  const [isFollowing, setIsFollowing] = useState(Boolean(initialIsFollowing));
  const [followerCount, setFollowerCount] = useState(() => formatCount(initialFollowerCount));
  const [pending, setPending] = useState(false);

  const buttonLabel = useMemo(() => (isFollowing ? 'Following' : 'Follow'), [isFollowing]);

  const toggleFollow = useCallback(async () => {
    if (!userId) {
      return;
    }

    if (status !== 'authenticated') {
      requireAuth('follow community members');
      return;
    }

    const method = isFollowing ? 'DELETE' : 'POST';
    const endpoint = `/api/users/${encodeURIComponent(userId)}/follow`;

    setPending(true);

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = await response.json();

      const nextIsFollowing = Boolean(payload?.viewerFollows);
      const nextFollowerCount = formatCount(payload?.followerCount);

      setIsFollowing(nextIsFollowing);
      setFollowerCount(nextFollowerCount);

      if (typeof onFollowChange === 'function') {
        onFollowChange({ isFollowing: nextIsFollowing, followerCount: nextFollowerCount, userId });
      }
    } catch (error) {
      console.error('Failed to toggle follow state:', error);
    } finally {
      setPending(false);
    }
  }, [isFollowing, onFollowChange, requireAuth, status, userId]);

  const icon = isFollowing ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />;
  const followerLabel = followerCount === 1 ? 'Follower' : 'Followers';

  return (
    <div className="inline-flex flex-col items-center gap-1 text-center">
      <button
        type="button"
        onClick={toggleFollow}
        disabled={pending}
        aria-pressed={isFollowing}
        className={`inline-flex min-w-[160px] items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-400 disabled:cursor-not-allowed disabled:opacity-60 ${
          isFollowing
            ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-300 dark:bg-emerald-400 dark:text-gray-950 dark:hover:bg-emerald-300'
            : 'border-emerald-200 bg-white/85 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-300 dark:bg-emerald-700/60 dark:text-white dark:hover:border-emerald-200 dark:hover:bg-emerald-600/70'
        }`}
        aria-label={`${isFollowing ? 'Unfollow' : 'Follow'} this member`}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
        {pending ? 'Working…' : buttonLabel}
      </button>
      {showFollowerCount ? (
        <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-emerald-800 dark:text-emerald-200">
          {followerCount.toLocaleString()} {followerLabel}
        </span>
      ) : null}
    </div>
  );
}
