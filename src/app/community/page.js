'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthModal } from '@/components/AuthProvider';
import PricingModalWrapper from '@/components/PricingModalWrapper.jsx';
import RecipePurchaseModal from '@/components/recipes/RecipePurchaseModal.jsx';
import { usePricingModal } from '@/context/PricingModalContext.jsx';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MoreHorizontal,
  Heart,
  MessageSquare,
  Share2,
  Bookmark,
  ImagePlus,
  X,
  Loader2,
  Flag,
  UserCheck,
  UserX,
  Sparkles,
  Gem,
  ShieldCheck,
} from 'lucide-react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';

import FollowUserButton from '../users/[id]/FollowUserButton';

const FEED_LIMIT = 20;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const REPORT_REASON_OPTIONS = [
  'Spam or misleading',
  'Harassment or bullying',
  'Hate speech or symbols',
  'Inappropriate or explicit content',
  'Scam, fraud, or phishing',
  'Self-harm or suicide',
  'Dangerous or illegal activities',
  'Misinformation or false claims',
  'Intellectual property violation',
  'Privacy violation',
  'Other',
];

const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function getSubscriptionTierMeta(planName, planBillingCycle) {
  const normalizedName = (planName ?? '').toString().trim().toLowerCase();
  const normalizedCycle = (planBillingCycle ?? '').toString().trim().toLowerCase();

  if (normalizedName !== 'premium') {
    return null;
  }

  if (['yearly', 'annual', 'annually'].includes(normalizedCycle)) {
    return {
      Icon: Gem,
      iconClassName: 'h-4 w-4 text-amber-500 drop-shadow dark:text-amber-200',
      label: 'Royal Premium member',
    };
  }

  if (normalizedCycle === 'monthly') {
    return {
      Icon: Sparkles,
      iconClassName: 'h-4 w-4 text-violet-500 dark:text-violet-300',
      label: 'Premium member',
    };
  }

  return null;
}

function formatTimeAgo(dateInput) {
  if (!dateInput) {
    return 'Just now';
  }

  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  const diffInSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const divisions = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.34524, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' },
  ];

  let duration = diffInSeconds;
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return relativeTimeFormatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }

  return 'Just now';
}

async function getErrorMessage(response) {
  try {
    const data = await response.json();
    if (typeof data?.error === 'string') {
      return data.error;
    }
    if (typeof data?.message === 'string') {
      return data.message;
    }
    if (data?.errors && Array.isArray(data.errors)) {
      const entry = data.errors.find((item) => typeof item === 'string');
      if (entry) {
        return entry;
      }
    }
    return response.statusText;
  } catch (error) {
    console.error('Failed to parse error message:', error);
  }
}

function AvatarImage({
  src,
  alt,
  fallbackInitial,
  className = 'h-full w-full object-cover',
  fallbackClassName = 'h-full w-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-sm',
}) {
  const [resolvedSrc, setResolvedSrc] = useState('');
  const [hadError, setHadError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let objectUrl = null;
    const rawInput = (src ?? '').toString().trim();

    const cleanup = () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };

    if (!rawInput) {
      setResolvedSrc('');
      setHadError(true);
      setIsLoaded(false);
      return cleanup;
    }

    setResolvedSrc('');
    setHadError(false);
    setIsLoaded(false);

    if (/^data:/i.test(rawInput) || /^blob:/i.test(rawInput) || /^https?:/i.test(rawInput)) {
      setResolvedSrc(rawInput);
      return cleanup;
    }

    const requestUrl = rawInput.startsWith('/')
      ? rawInput
      : `/${rawInput.replace(/^\/+/u, '')}`;

    const resolveImage = async () => {
      try {
        const response = await fetch(requestUrl, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to fetch avatar image (${response.status})`);
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        if (!isMounted) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        setResolvedSrc(objectUrl);
      } catch (error) {
        console.error('Unable to resolve avatar image:', error);
        if (isMounted) {
          setResolvedSrc('');
          setHadError(true);
          setIsLoaded(false);
        }
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
      }
    };

    resolveImage();

    return cleanup;
  }, [src]);

  const fallbackCharacter =
    fallbackInitial?.toString().trim().charAt(0)?.toUpperCase() || '?';

  if (!resolvedSrc || hadError) {
    return (
      <div
        className={fallbackClassName}
        role="img"
        aria-label={alt}
      >
        {fallbackCharacter}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      style={{
        opacity: isLoaded ? 1 : 0.4,
        transition: 'opacity 200ms ease-in-out',
      }}
      onLoad={() => {
        setIsLoaded(true);
      }}
      onError={() => {
        setHadError(true);
        setResolvedSrc('');
        setIsLoaded(false);
      }}
      loading="lazy"
      decoding="async"
    />
  );
}

function CommentList({
  comments,
  isLoading,
  onLoadMore,
  hasMore,
  isLoadingMore,
  highlightCommentId = null,
}) {
  if (isLoading) {
    return (
      <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-300">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading comments…</span>
      </div>
    );
  }

  if (!comments.length) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Be the first to comment.</p>;
  }

  return (
    <div className="space-y-4">
      {comments.map((comment) => {
        const isHighlighted =
          highlightCommentId !== null && Number(comment.id) === Number(highlightCommentId);

        return (
          <div
            key={comment.id}
            id={`comment-${comment.id}`}
            className={`flex space-x-3 transition ${
              isHighlighted
                ? 'rounded-2xl ring-2 ring-emerald-400 ring-offset-2 ring-offset-emerald-100 dark:ring-offset-emerald-900'
                : ''
            }`}
          >
            <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <AvatarImage
                src={comment.author?.image}
                alt={comment.author?.name || 'Community member'}
                fallbackInitial={(comment.author?.name || '?').charAt(0).toUpperCase()}
                className="h-full w-full object-cover"
                fallbackClassName="h-full w-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-xs"
              />
            </div>
            <div
              className={`flex-1 rounded-2xl px-4 py-2 ${
                isHighlighted
                  ? 'bg-emerald-50/70 dark:bg-emerald-900/30'
                  : 'bg-gray-100 dark:bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {comment.author?.name || 'Community member'}
                </p>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatTimeAgo(comment.createdAt)}
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{comment.content}</p>
            </div>
          </div>
        );
      })}
      {hasMore ? (
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="text-sm font-medium text-green-600 hover:text-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoadingMore ? 'Loading more…' : 'Load more comments'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CommentComposer({ onSubmit, isSubmitting }) {
  const { requireAuth } = useAuthModal();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!requireAuth('add comments to community posts')) {
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      setError('Please enter a comment.');
      return;
    }

    onSubmit(trimmed, {
      onSuccess: () => {
        setValue('');
        setError('');
      },
      onError: (message) => {
        setError(message || 'Unable to post comment. Try again.');
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (error) {
            setError('');
          }
        }}
        rows={2}
        placeholder="Share your thoughts…"
        className="w-full resize-none rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
        disabled={isSubmitting}
      />
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="text-right">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-full bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          <span>{isSubmitting ? 'Posting…' : 'Comment'}</span>
        </button>
      </div>
    </form>
  );
}

function isAdminRole(role) {
  return (role ?? '').toString().trim().toUpperCase() === 'ADMIN';
}

export function PostCard({
  post,
  onPostUpdated,
  onPostDeleted,
  initiallyOpenComments = false,
  highlightCommentId = null,
}) {
  const { requireAuth } = useAuthModal();
  const { data: session } = useSession();
  const authorName = post?.author?.name || 'Community member';
  const authorImage = post?.author?.image || null;
  const authorInitial = authorName.charAt(0).toUpperCase();
  const authorSubscription = useMemo(
    () => getSubscriptionTierMeta(post?.author?.planName, post?.author?.planBillingCycle),
    [post?.author?.planName, post?.author?.planBillingCycle]
  );
  const authorIsAdmin = useMemo(() => isAdminRole(post?.author?.role), [post?.author?.role]);
  const timeAgo = formatTimeAgo(post?.createdAt);
  const likeCount = Number.isFinite(post?.likeCount) ? Number(post.likeCount) : 0;
  const commentsCount = Number.isFinite(post?.commentCount) ? Number(post.commentCount) : 0;
  const sharesCount = Number.isFinite(post?.shareCount) ? Number(post?.shareCount) : 0;
  const [resolvedImageSrc, setResolvedImageSrc] = useState(post?.imageUrl || '');
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [localLikeState, setLocalLikeState] = useState({
    likeCount,
    hasLiked: Boolean(post?.hasLiked),
  });
  const [isCommentsOpen, setIsCommentsOpen] = useState(Boolean(initiallyOpenComments));
  const [comments, setComments] = useState([]);
  const [commentsPage, setCommentsPage] = useState(1);
  const [commentsPagination, setCommentsPagination] = useState({ total: commentsCount, pages: 1 });
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsLoadingMore, setCommentsLoadingMore] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [isUserReportDialogOpen, setIsUserReportDialogOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportCategory, setReportCategory] = useState('');
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [userReportReason, setUserReportReason] = useState('');
  const [userReportCategory, setUserReportCategory] = useState('');
  const [userReportError, setUserReportError] = useState('');
  const [userReportSuccess, setUserReportSuccess] = useState('');
  const [isReportingUser, setIsReportingUser] = useState(false);

  const viewerId = session?.user?.id != null ? String(session.user.id) : null;
  const postOwnerId = post?.author?.id != null ? String(post.author.id) : null;
  const isOwner = viewerId !== null && postOwnerId === viewerId;
  const isFollowingAuthor = !isOwner && Boolean(post?.viewerFollowsAuthor);

  useEffect(() => {
    let objectUrl = null;
    let isMounted = true;

    const loadImage = async () => {
      const rawUrl = post?.imageUrl?.toString() || '';
      if (!rawUrl) {
        setResolvedImageSrc('');
        setImageError(false);
        setImageLoaded(false);
        return;
      }

      // If the URL already looks like a data URL or absolute path, use it directly.
      if (/^data:/i.test(rawUrl) || /^https?:/i.test(rawUrl)) {
        setResolvedImageSrc(rawUrl);
        setImageError(false);
        setImageLoaded(false);
        return;
      }

      try {
        const requestUrl = rawUrl.startsWith('/')
          ? rawUrl
          : `/${rawUrl.replace(/^\/+/, '')}`;
        const response = await fetch(requestUrl, { cache: 'no-store' });
        if (response.status === 404) {
          if (isMounted) {
            setResolvedImageSrc('');
            setImageError(true);
            setImageLoaded(false);
          }
          return;
        }
        if (!response.ok) {
          throw new Error(`Failed to fetch image (${response.status})`);
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (isMounted) {
          setResolvedImageSrc(objectUrl);
          setImageError(false);
          setImageLoaded(false);
        }
      } catch (error) {
        console.error('Unable to resolve community post image:', error);
        if (isMounted) {
          setResolvedImageSrc('');
          setImageError(true);
          setImageLoaded(false);
        }
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
      }
    };

    loadImage();

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [post?.imageUrl]);

  const refreshComments = useCallback(
    async (pageToLoad = 1, append = false) => {
      try {
        if (!append) {
          setCommentsLoading(true);
        } else {
          setCommentsLoadingMore(true);
        }

        const response = await fetch(`/api/community/posts/${post.id}/comments?page=${pageToLoad}`);
        if (!response.ok) {
          throw new Error('Failed to load comments');
        }
        const data = await response.json();
        const loadedComments = Array.isArray(data?.comments) ? data.comments : [];
        const pagination = data?.pagination || { page: pageToLoad, pages: 1, total: loadedComments.length };

        setComments((previous) => (append ? [...previous, ...loadedComments] : loadedComments));
        setCommentsPage(pagination.page || pageToLoad);
        setCommentsPagination({ total: Number(pagination.total ?? loadedComments.length), pages: pagination.pages || 1 });
      } catch (error) {
        console.error('Failed to refresh comments:', error);
      } finally {
        setCommentsLoading(false);
        setCommentsLoadingMore(false);
      }
    },
    [post.id]
  );

  useEffect(() => {
    if (!isCommentsOpen) {
      return;
    }
    refreshComments(1, false);
  }, [isCommentsOpen, refreshComments]);

  useEffect(() => {
    if (highlightCommentId && !isCommentsOpen) {
      setIsCommentsOpen(true);
    }
  }, [highlightCommentId, isCommentsOpen]);

  useEffect(() => {
    setLocalLikeState({
      likeCount,
      hasLiked: Boolean(post?.hasLiked),
    });
    setCommentsPagination((previous) => ({ ...previous, total: commentsCount }));
  }, [post?.hasLiked, likeCount, commentsCount]);

  useEffect(() => {
    if (!isDeleteDialogOpen) {
      setDeleteError('');
    }
  }, [isDeleteDialogOpen]);

  useEffect(() => {
    if (!isReportDialogOpen) {
      setReportReason('');
      setReportCategory('');
      setReportError('');
      setReportSuccess('');
      setIsReporting(false);
    }
  }, [isReportDialogOpen]);

  useEffect(() => {
    if (!isUserReportDialogOpen) {
      setUserReportReason('');
      setUserReportCategory('');
      setUserReportError('');
      setUserReportSuccess('');
      setIsReportingUser(false);
    }
  }, [isUserReportDialogOpen]);

  const handleDeletePost = useCallback(async () => {
    if (!requireAuth('delete your community post')) {
      return;
    }

    if (isDeleting) {
      return;
    }

    setIsDeleting(true);
    setDeleteError('');

    try {
      const response = await fetch(`/api/community/posts/${post.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const message = await getErrorMessage(response);
        throw new Error(message || 'Failed to delete post.');
      }

      setIsDeleteDialogOpen(false);
      onPostDeleted?.(post.id);
    } catch (error) {
      console.error('Failed to delete community post:', error);
      setDeleteError(error.message || 'Failed to delete post. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  }, [requireAuth, isDeleting, post.id, onPostDeleted]);

  const handleSubmitReport = useCallback(async (event) => {
    event.preventDefault();
    if (!requireAuth('report community posts for review')) {
      return;
    }

    const trimmedReason = reportReason.trim();
    if (!trimmedReason) {
      setReportError('Please tell us what is wrong with this post.');
      return;
    }

    if (!reportCategory) {
      setReportError('Select the category that best describes this issue.');
      return;
    }

    setIsReporting(true);
    setReportError('');
    setReportSuccess('');

    try {
      const response = await fetch(`/api/community/posts/${post.id}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: trimmedReason, category: reportCategory }),
      });

      if (!response.ok) {
        const message = await getErrorMessage(response);
        throw new Error(message || 'Failed to submit report.');
      }

      const data = await response.json();
      setReportSuccess(data?.message || 'Thanks! Our moderators will review this post.');
      setReportReason('');
      setReportCategory('');
    } catch (error) {
      console.error('Failed to report community post:', error);
      setReportError(error.message || 'Failed to submit report. Please try again.');
    } finally {
      setIsReporting(false);
    }
  }, [post.id, reportReason, reportCategory, requireAuth]);

  const handleSubmitUserReport = useCallback(async (event) => {
    event.preventDefault();
    if (!requireAuth('report user profiles for review')) {
      return;
    }

    if (!postOwnerId) {
      setUserReportError('Unable to determine the profile to report.');
      return;
    }

    const trimmedReason = userReportReason.trim();
    if (!trimmedReason) {
      setUserReportError('Please describe what is inappropriate about this profile.');
      return;
    }

    if (!userReportCategory) {
      setUserReportError('Select the category that best describes this issue.');
      return;
    }

    setIsReportingUser(true);
    setUserReportError('');
    setUserReportSuccess('');

    try {
      const response = await fetch(`/api/users/${postOwnerId}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: trimmedReason, category: userReportCategory }),
      });

      if (!response.ok) {
        const message = await getErrorMessage(response);
        throw new Error(message || 'Failed to submit report.');
      }

      const data = await response.json();
      setUserReportSuccess(data?.message || 'Thanks! Our moderators will review this profile.');
      setUserReportReason('');
      setUserReportCategory('');
    } catch (error) {
      console.error('Failed to report user profile:', error);
      setUserReportError(error.message || 'Failed to submit report. Please try again.');
    } finally {
      setIsReportingUser(false);
    }
  }, [postOwnerId, requireAuth, userReportCategory, userReportReason]);

  const handleToggleLike = async () => {
    if (!requireAuth('like posts and interact with community')) {
      return;
    }

    if (isLiking) {
      return;
    }

    setIsLiking(true);
    const targetHasLiked = !localLikeState.hasLiked;
    const optimistic = {
      likeCount: Math.max(0, localLikeState.likeCount + (targetHasLiked ? 1 : -1)),
      hasLiked: targetHasLiked,
    };
    setLocalLikeState(optimistic);

    try {
      const method = targetHasLiked ? 'POST' : 'DELETE';
      const response = await fetch(`/api/community/posts/${post.id}/likes`, { method });
      if (!response.ok) {
        throw new Error('Failed to update like');
      }
      const data = await response.json();
      setLocalLikeState({
        likeCount: Number(data?.likeCount ?? optimistic.likeCount),
        hasLiked: Boolean(data?.hasLiked ?? optimistic.hasLiked),
      });
      onPostUpdated?.(
        post.id,
        {
          likeCount: Number(data?.likeCount ?? optimistic.likeCount),
          hasLiked: Boolean(data?.hasLiked ?? optimistic.hasLiked),
        },
        'likes'
      );
    } catch (error) {
      console.error('Failed to toggle like on post:', error);
      setLocalLikeState({
        likeCount,
        hasLiked: Boolean(post?.hasLiked),
      });
    } finally {
      setIsLiking(false);
    }
  };

  const handleSubmitComment = async (content, callbacks) => {
    if (!requireAuth('add comments to community posts')) {
      return;
    }

    setCommentSubmitting(true);
    try {
      const response = await fetch(`/api/community/posts/${post.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const payload = await getErrorMessage(response);
        callbacks?.onError?.(payload || 'Failed to publish your comment. Please try again.');
        return;
      }

      const data = await response.json();
      if (data?.comment) {
        setComments((previous) => [data.comment, ...previous]);
        setCommentsPagination((previous) => ({ ...previous, total: Number(data?.counts?.total ?? previous.total + 1) }));
        callbacks?.onSuccess?.();
        onPostUpdated?.(
          post.id,
          {
            commentCount: Number(data?.counts?.total ?? commentsCount + 1),
          },
          'comments'
        );
      }
    } catch (error) {
      console.error('Failed to submit comment:', error);
      callbacks?.onError?.('Failed to publish your comment. Please try again later.');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleLoadMoreComments = () => {
    if (commentsLoadingMore) {
      return;
    }
    const nextPage = commentsPage + 1;
    if (commentsPagination.pages && nextPage > commentsPagination.pages) {
      return;
    }
    refreshComments(nextPage, true);
  };

  const hasMoreComments = useMemo(() => {
    if (!commentsPagination.total) {
      return false;
    }
    const loaded = comments.length;
    return loaded < commentsPagination.total;
  }, [comments.length, commentsPagination.total]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden mb-6 border border-gray-100 dark:border-gray-700">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <AvatarImage
                src={authorImage}
                alt={authorName}
                fallbackInitial={authorInitial}
                className="h-full w-full object-cover"
                fallbackClassName="h-full w-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-sm"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-gray-900 dark:text-white">
                  <span className="inline-flex items-center gap-1">
                    {authorName}
                    {authorIsAdmin ? (
                      <ShieldCheck
                        className="h-4 w-4 text-sky-500 dark:text-sky-300"
                        aria-label="SavoryFlavors admin"
                        title="SavoryFlavors admin"
                      />
                    ) : null}
                    {authorSubscription ? (
                      <authorSubscription.Icon
                        className={authorSubscription.iconClassName}
                        aria-label={authorSubscription.label}
                        title={authorSubscription.label}
                      />
                    ) : null}
                  </span>
                </h4>
                {isFollowingAuthor ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-600 dark:border-emerald-400/60 dark:bg-emerald-500/20 dark:text-emerald-200">
                    <UserCheck className="h-3 w-3" />
                    Following
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{timeAgo}</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isOwner ? (
                <DropdownMenuItem
                  className="text-red-600 focus:bg-red-50 dark:focus:bg-red-600/10"
                  onSelect={(event) => {
                    event.preventDefault();
                    if (!requireAuth('delete your community post')) {
                      return;
                    }
                    setIsDeleteDialogOpen(true);
                  }}
                >
                  Delete post
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem
                    className="flex items-center gap-2"
                    onSelect={(event) => {
                      event.preventDefault();
                      if (!requireAuth('report user profiles for review')) {
                        return;
                      }
                      setIsUserReportDialogOpen(true);
                    }}
                  >
                    <UserX className="h-4 w-4" />
                    Report user
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex items-center gap-2"
                    onSelect={(event) => {
                      event.preventDefault();
                      if (!requireAuth('report community posts for review')) {
                        return;
                      }
                      setIsReportDialogOpen(true);
                    }}
                  >
                    <Flag className="h-4 w-4" />
                    Report post
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete post?</DialogTitle>
              <DialogDescription>
                This will remove your post and its interactions. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {deleteError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>
            ) : null}
            <DialogFooter className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
              <DialogClose asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
              </DialogClose>
              <button
                type="button"
                onClick={handleDeletePost}
                className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={isUserReportDialogOpen} onOpenChange={setIsUserReportDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Report user profile</DialogTitle>
              <DialogDescription>
                Tell us what violates our guidelines. Reports are reviewed by our moderators.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleSubmitUserReport}>
              <div className="space-y-2">
                <label htmlFor={`user-report-category-${post.id}`} className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Category
                </label>
                <Select
                  value={userReportCategory}
                  onValueChange={(value) => {
                    setUserReportCategory(value);
                    if (userReportError) {
                      setUserReportError('');
                    }
                  }}
                  disabled={isReportingUser}
                  required
                >
                  <SelectTrigger id={`user-report-category-${post.id}`}>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_REASON_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor={`user-report-reason-${post.id}`} className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Reason
                </label>
                <textarea
                  id={`user-report-reason-${post.id}`}
                  value={userReportReason}
                  onChange={(event) => {
                    setUserReportReason(event.target.value);
                    if (userReportError) {
                      setUserReportError('');
                    }
                  }}
                  rows={4}
                  maxLength={1000}
                  className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-800 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  placeholder="Describe what is inappropriate or problematic about this profile."
                  disabled={isReportingUser}
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">Up to 1000 characters.</p>
                {userReportError ? (
                  <p className="text-sm text-red-600 dark:text-red-400">{userReportError}</p>
                ) : null}
                {userReportSuccess ? (
                  <p className="text-sm text-green-600 dark:text-green-400">{userReportSuccess}</p>
                ) : null}
              </div>
              <DialogFooter className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
                <DialogClose asChild>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                    disabled={isReportingUser}
                  >
                    Cancel
                  </button>
                </DialogClose>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isReportingUser}
                >
                  {isReportingUser ? 'Submitting…' : 'Submit report'}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Report community post</DialogTitle>
              <DialogDescription>
                Tell us what violates our guidelines. Reports are reviewed by our moderators.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleSubmitReport}>
              <div className="space-y-2">
                <label htmlFor={`report-category-${post.id}`} className="text-sm.font-medium text-gray-700 dark:text-gray-200">
                  Category
                </label>
                <Select
                  value={reportCategory}
                  onValueChange={(value) => {
                    setReportCategory(value);
                    if (reportError) {
                      setReportError('');
                    }
                  }}
                  disabled={isReporting}
                  required
                >
                  <SelectTrigger id={`report-category-${post.id}`}>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_REASON_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor={`report-reason-${post.id}`} className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Reason
                </label>
                <textarea
                  id={`report-reason-${post.id}`}
                  value={reportReason}
                  onChange={(event) => {
                    setReportReason(event.target.value);
                    if (reportError) {
                      setReportError('');
                    }
                  }}
                  rows={4}
                  maxLength={1000}
                  className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-800 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  placeholder="Describe what is inappropriate or problematic about this post."
                  disabled={isReporting}
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">Up to 1000 characters.</p>
                {reportError ? (
                  <p className="text-sm text-red-600 dark:text-red-400">{reportError}</p>
                ) : null}
                {reportSuccess ? (
                  <p className="text-sm text-green-600 dark:text-green-400">{reportSuccess}</p>
                ) : null}
              </div>
              <DialogFooter className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
                <DialogClose asChild>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                    disabled={isReporting}
                  >
                    Cancel
                  </button>
                </DialogClose>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isReporting}
                >
                  {isReporting ? 'Submitting…' : 'Submit report'}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <p className="text-gray-800 dark:text-gray-100 mb-4 whitespace-pre-wrap">{post?.content}</p>
        {resolvedImageSrc && !imageError && (
          <div className="relative mb-4 overflow-hidden rounded-lg">
            <div className="relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-900" style={{ paddingTop: '66.6667%' }}>
              <img
                src={resolvedImageSrc}
                alt="Post content"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                style={{ opacity: imageLoaded ? 1 : 0, transition: 'opacity 200ms ease-in-out' }}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.style.display = 'none';
                  setImageError(true);
                }}
                onLoad={() => setImageLoaded(true)}
              />
            </div>
          </div>
        )}
        {imageError && (
          <div className="rounded-lg overflow-hidden mb-4 bg-gray-200 dark:bg-gray-700 text-center text-sm text-gray-600 dark:text-gray-300 py-8">
            Image unavailable
          </div>
        )}
        <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 text-sm">
          <div className="flex space-x-4">
            <button
              className={`flex items-center space-x-1 transition-colors ${localLikeState.hasLiked ? 'text-red-500' : 'hover:text-red-500'}`}
              onClick={handleToggleLike}
              disabled={isLiking}
            >
              <Heart className={`h-5 w-5 ${localLikeState.hasLiked ? 'fill-current' : ''}`} />
              <span>{localLikeState.likeCount}</span>
            </button>
            <button
              onClick={() => setIsCommentsOpen((previous) => !previous)}
              className={`flex items-center space-x-1 transition-colors ${isCommentsOpen ? 'text-blue-500' : 'hover:text-blue-500'}`}
            >
              <MessageSquare className="h-5 w-5" />
              <span>{commentsCount}</span>
            </button>
            <button className="flex items-center space-x-1 hover:text-green-500">
              <Share2 className="h-5 w-5" />
              <span>{sharesCount}</span>
            </button>
          </div>
          <button className="hover:text-yellow-500">
            <Bookmark className="h-5 w-5" />
          </button>
        </div>
        {isCommentsOpen ? (
          <div className="border-t border-gray-100 dark:border-gray-700 pt-4 mt-4 space-y-4">
            <CommentComposer onSubmit={handleSubmitComment} isSubmitting={commentSubmitting} />
            <CommentList
              comments={comments}
              isLoading={commentsLoading}
              onLoadMore={handleLoadMoreComments}
              hasMore={hasMoreComments}
              isLoadingMore={commentsLoadingMore}
              highlightCommentId={highlightCommentId}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function CommunityPageWithPricing() {
  return (
    <PricingModalWrapper>
      <CommunityPage />
    </PricingModalWrapper>
  );
}

function CreatePost({ onPostCreated }) {
  const { requireAuth } = useAuthModal();
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
  }, [imagePreview]);

  const resetImage = useCallback(() => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImageFile(null);
    setImagePreview('');
    if (fileInputRef.current) {
      // eslint-disable-next-line no-param-reassign
      fileInputRef.current.value = '';
    }
  }, [imagePreview]);

  const handleFileSelection = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type?.startsWith('image/')) {
      setError('Only image files are supported.');
      resetImage();
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError('Image is too large. Please choose a file under 5 MB.');
      resetImage();
      return;
    }

    setError('');
    const previewUrl = URL.createObjectURL(file);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImageFile(file);
    setImagePreview(previewUrl);
  };

  const openFilePicker = () => {
    if (!requireAuth('share images with the community')) {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!requireAuth('share posts in the community')) {
      return;
    }

    const trimmedContent = content.trim();

    if (!trimmedContent) {
      setError('Please share a message or recipe tip before posting.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('content', trimmedContent);
      if (imageFile) {
        formData.append('image', imageFile, imageFile.name);
      }

      const response = await fetch('/api/community/posts', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const message = await getErrorMessage(response);
        setError(message || 'Failed to publish your post. Please try again.');
        return;
      }

      const data = await response.json();
      if (data?.post) {
        onPostCreated?.(data.post);
        setContent('');
        resetImage();
      }
    } catch (submitError) {
      console.error('Failed to create community post:', submitError);
      setError('Failed to publish your post. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden mb-6 border border-gray-100 dark:border-gray-700">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelection}
          disabled={isSubmitting}
        />
        <div className="flex items-start space-x-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 text-white flex items-center justify-center font-semibold">
            SF
          </div>
          <div className="flex-1 space-y-3">
            <textarea
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                if (error) {
                  setError('');
                }
              }}
              rows={3}
              placeholder="What's cooking? Share a kitchen win, tip, or new recipe..."
              className="w-full resize-none bg-gray-50 dark:bg-gray-700 rounded-2xl px-4 py-3 text-gray-800 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
              disabled={isSubmitting}
            />
            {imagePreview && (
              <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Selected upload preview"
                  className="w-auto max-w-full h-auto max-h-[70vh] object-contain"
                />
                <button
                  type="button"
                  onClick={resetImage}
                  className="absolute top-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 px-1">{error}</p>
        )}

        <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-700 pt-3">
          <button
            type="button"
            onClick={openFilePicker}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            disabled={isSubmitting}
          >
            <ImagePlus className="h-4 w-4" />
            Add photo
          </button>
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-full text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CommunityPage() {
  const { data: session } = useSession();
  const { requireAuth } = useAuthModal();
  const { openModal: openPricingModal } = usePricingModal();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [trendingRecipes, setTrendingRecipes] = useState([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState('');
  const [purchaseRecipe, setPurchaseRecipe] = useState(null);
  const [recommendedUsers, setRecommendedUsers] = useState([]);
  const [recommendedLoading, setRecommendedLoading] = useState(true);
  const [recommendedError, setRecommendedError] = useState('');

  const loadPosts = useCallback(async (pageToLoad = 1, append = false) => {
    try {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setLoading(true);
      }

      setFetchError('');

      const response = await fetch(`/api/community/posts?page=${pageToLoad}&limit=${FEED_LIMIT}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        const message = await getErrorMessage(response);
        throw new Error(message || 'Failed to load community posts');
      }

      const data = await response.json();
      const loadedPosts = Array.isArray(data?.posts) ? data.posts : [];

      setPosts((previous) => {
        if (!append) {
          return loadedPosts;
        }

        const existingIds = new Set(previous.map((item) => item.id));
        const filtered = loadedPosts.filter((item) => !existingIds.has(item.id));
        return [...previous, ...filtered];
      });

      const totalPages = Number.isFinite(data?.pagination?.pages) ? data.pagination.pages : 1;
      setHasMore(pageToLoad < totalPages);
      setPage(pageToLoad);
    } catch (loadError) {
      console.error('Failed to load community posts:', loadError);
      setFetchError(loadError.message || 'Failed to load community posts');
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadPosts(1, false);
  }, [loadPosts]);

  useEffect(() => {
    let isCancelled = false;

    const fetchSidebarData = async () => {
      try {
        const [recipesResponse, usersResponse] = await Promise.all([
          fetch('/api/community/trending/recipes', {
            method: 'GET',
            headers: {
              Accept: 'application/json',
            },
            cache: 'no-store',
          }),
          fetch('/api/community/recommended/users', {
            method: 'GET',
            headers: {
              Accept: 'application/json',
            },
            cache: 'no-store',
          }),
        ]);

        if (!isCancelled) {
          if (recipesResponse.ok) {
            const recipesData = await recipesResponse.json();
            setTrendingRecipes(Array.isArray(recipesData?.recipes) ? recipesData.recipes : []);
            setTrendingError('');
          } else {
            const message = await getErrorMessage(recipesResponse);
            setTrendingError(message || 'Failed to load trending recipes.');
            setTrendingRecipes([]);
          }

          if (usersResponse.ok) {
            const usersData = await usersResponse.json();
            setRecommendedUsers(Array.isArray(usersData?.users) ? usersData.users : []);
            setRecommendedError('');
          } else {
            const message = await getErrorMessage(usersResponse);
            setRecommendedError(message || 'Failed to load recommended members.');
            setRecommendedUsers([]);
          }
        }
      } catch (error) {
        console.error('Failed to load community sidebar data:', error);
        if (!isCancelled) {
          setTrendingError('Failed to load trending recipes.');
          setRecommendedError('Failed to load recommended members.');
          setTrendingRecipes([]);
          setRecommendedUsers([]);
        }
      } finally {
        if (!isCancelled) {
          setTrendingLoading(false);
          setRecommendedLoading(false);
        }
      }
    };

    fetchSidebarData();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handlePostCreated = useCallback((newPost) => {
    if (!newPost) return;

    setPosts((previous) => {
      const withoutDuplicate = previous.filter((post) => post.id !== newPost.id);
      return [newPost, ...withoutDuplicate];
    });
  }, []);

  const handlePostUpdated = useCallback((postId, payload, type) => {
    if (!postId || !payload) {
      return;
    }

    setPosts((previous) =>
      previous.map((post) => {
        if (post.id !== postId) {
          return post;
        }

        if (type === 'likes') {
          return {
            ...post,
            likeCount: payload.likeCount,
            hasLiked: payload.hasLiked,
          };
        }

        if (type === 'comments') {
          return {
            ...post,
            commentCount: payload.commentCount,
          };
        }

        return {
          ...post,
          ...payload,
        };
      })
    );
  }, []);

  const handlePostDeleted = useCallback((postId) => {
    setPosts((previous) => previous.filter((post) => post.id !== postId));
  }, []);

  const handleOpenRecipePurchase = useCallback((recipe) => {
    if (!recipe) {
      return;
    }

    if (Boolean(recipe.isOwner) || Boolean(recipe.hasPurchased)) {
      return;
    }

    if (!requireAuth('purchase premium recipes')) {
      return;
    }

    const priceValue = Number.parseFloat(recipe.price);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      return;
    }

    const resolvedId = recipe.slug || recipe.id;
    if (!resolvedId && !Number.isFinite(recipe.communityId)) {
      return;
    }

    setPurchaseRecipe({
      id: recipe.communityId ?? recipe.id,
      slug: recipe.slug,
      title: recipe.title,
      price: priceValue,
      href: recipe.hrefTarget,
    });
  }, [requireAuth]);

  const handleCloseRecipePurchase = useCallback(() => {
    setPurchaseRecipe(null);
  }, []);

  const handleRecipePurchaseSuccess = useCallback((result) => {
    if (!result) {
      return;
    }

    const matchId = result.recipeId != null ? Number(result.recipeId) : null;
    const matchSlug = result.recipeSlug || null;

    setTrendingRecipes((previous) => previous.map((item) => {
      const itemId = item?.communityId != null ? Number(item.communityId) : null;
      const itemSlug = item?.slug || null;
      if ((matchId !== null && itemId === matchId) || (matchSlug && itemSlug && itemSlug === matchSlug)) {
        return {
          ...item,
          hasPurchased: true,
        };
      }
      return item;
    }));

    setPurchaseRecipe((prev) => (prev ? { ...prev, hasPurchased: true } : prev));
  }, []);

  const handleFollowStateChange = useCallback(({ userId, isFollowing, followerCount }) => {
    if (!userId) {
      return;
    }

    const normalizedId = String(userId);

    setRecommendedUsers((previous) =>
      previous.map((user) => {
        const candidateId = user?.id != null ? String(user.id) : null;
        if (candidateId === normalizedId) {
          return {
            ...user,
            viewerFollows: isFollowing,
            followerCount,
          };
        }
        return user;
      })
    );

    setPosts((previous) =>
      previous.map((post) => {
        const authorId = post?.author?.id != null ? String(post.author.id) : null;
        if (authorId === normalizedId) {
          return {
            ...post,
            viewerFollowsAuthor: isFollowing,
          };
        }
        return post;
      })
    );
  }, []);

  const handleLoadMore = () => {
    if (!hasMore || isLoadingMore) {
      return;
    }
    loadPosts(page + 1, true);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Main content */}
          <div className="md:w-2/3">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Community Feed</h1>

            <CreatePost onPostCreated={handlePostCreated} />

            {fetchError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/60 dark:text-red-300">
                {fetchError}
              </div>
            )}

            {loading ? (
              <div className="rounded-xl border border-gray-100 bg-white px-4 py-6 text-center text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                Loading latest posts...
              </div>
            ) : posts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-100">No posts yet</h3>
                <p className="mt-2 text-sm">Be the first to share a culinary creation with the community!</p>
              </div>
            ) : (
              <div className="space-y-6">
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onPostUpdated={handlePostUpdated}
                    onPostDeleted={handlePostDeleted}
                  />
                ))}
              </div>
            )}

            {hasMore && !loading && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  className="inline-flex items-center justify-center rounded-full border border-olive-300 px-6 py-2 text-sm font-medium text-olive-700 transition hover:-translate-y-0.5 hover:border-olive-400 hover:bg-olive-50 dark:border-gray-700 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? 'Loading more...' : 'Load more posts'}
                </button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="md:w-1/3 space-y-6">
            {/* Trending Recipes */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden border border-gray-100 dark:border-gray-700">
              <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-lg text-gray-900 dark:text-white">Trending Recipes</h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {trendingLoading ? (
                  <div className="p-4 text-sm text-gray-500 dark:text-gray-400">Loading trending recipes…</div>
                ) : trendingError ? (
                  <div className="p-4 text-sm text-red-600 dark:text-red-400">{trendingError}</div>
                ) : trendingRecipes.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500 dark:text-gray-400">No trending recipes right now. Check back later!</div>
                ) : (
                  trendingRecipes.slice(0, 4).map((recipe) => {
                    const fallbackInitial = (recipe?.title || '')?.charAt(0)?.toUpperCase() || '?';
                    const isExternal = recipe?.source === 'mealdb';
                    const hrefTarget = isExternal
                      ? (recipe?.externalId
                        ? `https://www.themealdb.com/meal/${encodeURIComponent(String(recipe.externalId))}`
                        : 'https://www.themealdb.com/')
                      : recipe?.slug
                        ? `/recipes/${recipe.slug}`
                        : `/recipes/${recipe?.id ?? ''}`;
                    const isPremium = Boolean(recipe?.isPremium);
                    const hasPurchased = Boolean(recipe?.hasPurchased);
                    const isOwner = Boolean(recipe?.isOwner);

                    return (
                      <Link
                        key={recipe?.id ?? recipe?.slug ?? recipe?.title}
                        href={hrefTarget}
                        target={isExternal ? '_blank' : undefined}
                        rel={isExternal ? 'noopener noreferrer' : undefined}
                        onClick={(event) => {
                          if (isExternal) {
                            return;
                          }
                          if (!isPremium || hasPurchased || isOwner) {
                            return;
                          }
                          event.preventDefault();
                          handleOpenRecipePurchase({
                            ...recipe,
                            hrefTarget,
                          });
                        }}
                        className={`block p-4 transition-colors ${
                          isPremium && !hasPurchased && !isOwner
                            ? 'hover:bg-amber-50 dark:hover:bg-amber-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className="h-12 w-12 rounded-md overflow-hidden bg-gray-200 dark:bg-gray-600">
                            {recipe?.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={recipe.image}
                                alt={recipe?.title || 'Trending recipe'}
                                className="h-full w-full object-cover"
                                style={{ opacity: 1 }}
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.style.display = 'none';
                                  if (e.target.parentElement) {
                                    e.target.parentElement.innerHTML = `<div class="h-full w-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-xs">${fallbackInitial}</div>`;
                                  }
                                }}
                              />
                            ) : (
                              <div className="h-full w-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-xs">
                                {fallbackInitial}
                              </div>
                            )}
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900 dark:text-white">
                              {recipe?.title || 'Untitled recipe'}
                              {isExternal ? (
                                <span className="ml-2 inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-900/30 dark:text-sky-200">
                                  MealDB
                                </span>
                              ) : null}
                              {!isExternal && isPremium ? (
                                <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  hasPurchased
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                                    : isOwner
                                      ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200'
                                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                }`}>
                                  {hasPurchased ? 'Purchased' : isOwner ? 'Your Listing' : 'For Sale'}
                                </span>
                              ) : null}
                            </h4>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                              {Number(recipe?.favoriteCount ?? 0).toLocaleString()} favorites
                              {!isExternal && isPremium && recipe?.price != null
                                ? ` · ₱${Number(recipe.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : ''}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden border border-gray-100 dark:border-gray-700">
              <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-lg text-gray-900 dark:text-white">Recommended Members</h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {recommendedLoading ? (
                  <div className="p-4 text-sm text-gray-500 dark:text-gray-400">Loading recommended members…</div>
                ) : recommendedError ? (
                  <div className="p-4 text-sm text-red-600 dark:text-red-400">{recommendedError}</div>
                ) : recommendedUsers.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500 dark:text-gray-400">No member recommendations yet. Engage with the community to discover more cooks!</div>
                ) : (
                  recommendedUsers.map((user) => {
                    const displayName = user?.displayName || user?.name || 'Community member';
                    const followerCount = Number(user?.followerCount ?? 0);
                    const followerLabel = followerCount === 1 ? 'follower' : 'followers';
                    const userId = user?.id != null ? String(user.id) : null;
                    const isFollowing = Boolean(user?.viewerFollows);
                    const subscriptionMeta = getSubscriptionTierMeta(user?.planName, user?.planBillingCycle);
                    const isAdmin = isAdminRole(user?.role);
                    const isSelf = session?.user?.id != null && userId === String(session.user.id);

                    return (
                      <div
                        key={userId ?? displayName}
                        className="p-3 flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="flex items-center space-x-2.5">
                          <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                            <AvatarImage
                              src={user?.image}
                              alt={displayName}
                              fallbackInitial={displayName.charAt(0).toUpperCase()}
                              className="h-full w-full object-cover"
                              fallbackClassName="h-full w-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-xs"
                            />
                          </div>
                          <div className="max-w-[11rem]">
                            <h4 className="font-medium text-sm text-gray-900 dark:text-white leading-tight">
                              <span className="inline-flex items-center gap-1 flex-wrap">
                                {displayName}
                                {isAdmin ? (
                                  <ShieldCheck
                                    className="h-4 w-4 text-sky-500 dark:text-sky-300"
                                    aria-label="SavoryFlavors admin"
                                    title="SavoryFlavors admin"
                                  />
                                ) : null}
                                {subscriptionMeta ? (
                                  <subscriptionMeta.Icon
                                    className={subscriptionMeta.iconClassName}
                                    aria-label={subscriptionMeta.label}
                                    title={subscriptionMeta.label}
                                  />
                                ) : null}
                              </span>
                            </h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {followerCount.toLocaleString()} {followerLabel}
                            </p>
                          </div>
                        </div>
                        {isSelf ? null : (
                          <FollowUserButton
                            userId={userId}
                            initialIsFollowing={isFollowing}
                            initialFollowerCount={followerCount}
                            onFollowChange={handleFollowStateChange}
                            showFollowerCount={false}
                            className="h-8 rounded-full px-3 text-xs"
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            
            {/* Community Guidelines */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden border border-gray-100 dark:border-gray-700 p-4 text-sm text-gray-600 dark:text-gray-300 space-y-2">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Community Guidelines</h3>
              <p>• Be respectful and kind to others</p>
              <p>• Share your own original content</p>
              <p>• Give credit when using others’ recipes</p>
              <p>• No spam or self-promotion</p>
              <p>• Report any inappropriate content</p>
              <Dialog>
                <DialogTrigger asChild>
                  <button className="inline-block text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 text-sm mt-2">
                    Read full guidelines
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                  <DialogHeader>
                    <DialogTitle>Community Guidelines</DialogTitle>
                    <DialogDescription>
                      Please review these principles to keep SavoryFlavors welcoming for everyone.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                    <section>
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-1">1. Respect is non-negotiable</h4>
                      <p>
                        Treat every member with kindness. Harassment, hate speech, threats, or discriminatory language will not be tolerated and can result in removal from the community.
                      </p>
                    </section>
                    <section>
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-1">2. Share authentic, original work</h4>
                      <p>
                        Post recipes, photos, and tips that you created or have permission to share. If you adapt inspiration from elsewhere, credit the source so others can explore it too.
                      </p>
                    </section>
                    <section>
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-1">3. Celebrate constructive feedback</h4>
                      <p>
                        Support fellow cooks with thoughtful suggestions and encouragement. Critique should be helpful, never hurtful. Remember there is a person behind every post.
                      </p>
                    </section>
                    <section>
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-1">4. Keep promotions relevant</h4>
                      <p>
                        Occasional mentions of your blog or business are welcome when they add value to the conversation. Repeated self-promotion, affiliate links, or spam will be removed.
                      </p>
                    </section>
                    <section>
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-1">5. Protect everyone&rsquo;s safety</h4>
                      <p>
                        Avoid sharing sensitive personal information—yours or someone else&rsquo;s. Report suspicious activity, scams, or posts that could put community members at risk.
                      </p>
                    </section>
                    <section>
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-1">6. Follow the law</h4>
                      <p>
                        Illegal activities, including sharing copyrighted material without permission or encouraging unsafe practices, are strictly prohibited.
                      </p>
                    </section>
                    <section>
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-1">7. Help us improve</h4>
                      <p>
                        Moderators review reports daily but cannot see everything. Use the report button or contact support if you notice content that breaks these guidelines.
                      </p>
                    </section>
                  </div>
                  <DialogFooter className="justify-end">
                    <DialogClose asChild>
                      <button className="rounded-md bg-olive-600 px-4 py-2 text-sm font-semibold text-white hover:bg-olive-700 transition-colors">
                        I understand
                      </button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
