'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Heart, Loader2, MessageCircle, Pencil, Trash2, X } from 'lucide-react';

import ImageWithFallback from '@/components/ImageWithFallback';
import { useAuthModal } from '@/components/AuthProvider';

const formatRelativeTime = (value) => {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const divisions = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.34524, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' },
  ];

  let duration = seconds;
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return 'Just now';
};

const ensurePlainPost = (post) => ({
  ...post,
  likeCount: Number(post?.likeCount ?? 0),
  commentCount: Number(post?.commentCount ?? 0),
  hasLiked: Boolean(post?.hasLiked),
  canManage: Boolean(post?.canManage),
});

function CommentList({ comments, isLoading }) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
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
      {comments.map((comment) => (
        <div key={comment.id} className="flex gap-3">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-green-400 to-green-600 text-white flex items-center justify-center text-sm font-semibold overflow-hidden">
            {comment.author?.image ? (
              <ImageWithFallback
                src={comment.author.image}
                alt={comment.author?.name || 'Community member'}
                fallback="/placeholder-avatar.jpg"
                className="h-full w-full object-cover"
              />
            ) : (
              (comment.author?.name || '?').charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 rounded-2xl bg-gray-100 px-4 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-200">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span className="font-semibold text-gray-700 dark:text-gray-100">{comment.author?.name || 'Community member'}</span>
              <span>{formatRelativeTime(comment.createdAt)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap">{comment.content}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CommentComposer({ onSubmit, isSubmitting }) {
  const { requireAuth } = useAuthModal();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!requireAuth('add comments to community posts')) {
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      setError('Please enter a comment.');
      return;
    }

    setError('');
    const result = await onSubmit(trimmed);
    if (result?.success) {
      setValue('');
    } else if (result?.error) {
      setError(result.error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        rows={2}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (error) {
            setError('');
          }
        }}
        placeholder="Share your thoughts…"
        className="w-full resize-none rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        disabled={isSubmitting}
      />
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="text-right">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-full bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          <span>{isSubmitting ? 'Posting…' : 'Comment'}</span>
        </button>
      </div>
    </form>
  );
}

function ExternalPostCard({ post, onPostUpdated, onPostRemoved }) {
  const { requireAuth } = useAuthModal();
  const [likeState, setLikeState] = useState({ likeCount: post.likeCount, hasLiked: post.hasLiked });
  const [isLiking, setIsLiking] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(post.content ?? '');
  const [draftImageUrl, setDraftImageUrl] = useState(post.imageUrl ?? '');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    setLikeState({ likeCount: post.likeCount, hasLiked: post.hasLiked });
  }, [post.hasLiked, post.likeCount]);

  useEffect(() => {
    if (!isEditing) {
      setDraftContent(post.content ?? '');
      setDraftImageUrl(post.imageUrl ?? '');
      setEditError('');
    }
  }, [isEditing, post.content, post.imageUrl]);

  const toggleLike = async () => {
    if (!requireAuth('like community posts')) {
      return;
    }
    if (isLiking) return;

    setIsLiking(true);
    const targetHasLiked = !likeState.hasLiked;
    const optimistic = {
      likeCount: Math.max(0, likeState.likeCount + (targetHasLiked ? 1 : -1)),
      hasLiked: targetHasLiked,
    };
    setLikeState(optimistic);

    try {
      const method = targetHasLiked ? 'POST' : 'DELETE';
      const response = await fetch(`/api/community/posts/${post.id}/likes`, { method });
      if (!response.ok) {
        throw new Error('Failed to update like');
      }
      const data = await response.json();
      const resolved = {
        likeCount: Number(data?.likeCount ?? optimistic.likeCount),
        hasLiked: Boolean(data?.hasLiked ?? optimistic.hasLiked),
      };
      setLikeState(resolved);
      onPostUpdated(post.id, { likeCount: resolved.likeCount, hasLiked: resolved.hasLiked });
    } catch (error) {
      console.error('Failed to toggle like:', error);
      setLikeState({ likeCount: post.likeCount, hasLiked: post.hasLiked });
    } finally {
      setIsLiking(false);
    }
  };

  const ensureComments = useCallback(async () => {
    if (commentsLoaded || commentsLoading) {
      return;
    }
    try {
      setCommentsLoading(true);
      const response = await fetch(`/api/community/posts/${post.id}/comments?limit=20`);
      if (!response.ok) {
        throw new Error('Unable to load comments');
      }
      const data = await response.json();
      const loaded = Array.isArray(data?.comments) ? data.comments : [];
      setComments(loaded);
      setCommentsLoaded(true);
      onPostUpdated(post.id, { commentCount: Number(data?.pagination?.total ?? loaded.length) });
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    } finally {
      setCommentsLoading(false);
    }
  }, [commentsLoaded, commentsLoading, onPostUpdated, post.id]);

  const handleSubmitComment = useCallback(
    async (content) => {
      if (!requireAuth('add comments to community posts')) {
        return { success: false, error: 'Please sign in to comment.' };
      }

      try {
        setCommentSubmitting(true);
        const response = await fetch(`/api/community/posts/${post.id}/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const message = payload?.message || payload?.error || 'Unable to post comment.';
          return { success: false, error: message };
        }

        const data = await response.json();
        const newComment = data?.comment;
        if (newComment) {
          setComments((previous) => {
            const next = [newComment, ...previous];
            onPostUpdated(post.id, {
              commentCount: Number(data?.counts?.total ?? next.length),
            });
            return next;
          });
          setCommentsLoaded(true);
        }
        return { success: true };
      } catch (error) {
        console.error('Failed to submit comment:', error);
        return { success: false, error: 'Unable to post comment. Try again.' };
      } finally {
        setCommentSubmitting(false);
      }
    },
    [onPostUpdated, post.id, requireAuth]
  );

  const commentButtonLabel = useMemo(() => {
    if (showComments) {
      return 'Hide comments';
    }
    if (post.commentCount === 0) {
      return 'Comment';
    }
    return `${post.commentCount} comment${post.commentCount === 1 ? '' : 's'}`;
  }, [post.commentCount, showComments]);

  const handleStartEdit = () => {
    setDraftContent(post.content ?? '');
    setDraftImageUrl(post.imageUrl ?? '');
    setEditError('');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (isSavingEdit) return;
    setIsEditing(false);
    setEditError('');
  };

  const handleSaveEdit = async () => {
    if (!requireAuth('manage community posts')) {
      return;
    }
    const trimmedContent = draftContent.trim();
    if (!trimmedContent) {
      setEditError('Post content cannot be empty.');
      return;
    }
    if (trimmedContent.length > 2000) {
      setEditError('Post content cannot exceed 2000 characters.');
      return;
    }

    setIsSavingEdit(true);
    setEditError('');
    try {
      const response = await fetch(`/api/community/posts/${post.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: trimmedContent,
          imageUrl: draftImageUrl.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.message || payload?.error || 'Unable to update post.';
        throw new Error(message);
      }

      const data = await response.json();
      if (data?.post) {
        onPostUpdated(post.id, data.post);
      }
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update post:', error);
      setEditError(error.message || 'Unable to update post. Try again.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeletePost = async () => {
    if (!requireAuth('manage community posts')) {
      return;
    }
    const confirmDelete = window.confirm('Delete this post? This action cannot be undone.');
    if (!confirmDelete) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/community/posts/${post.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.message || payload?.error || 'Unable to delete post.';
        throw new Error(message);
      }
      onPostRemoved(post.id);
    } catch (error) {
      console.error('Failed to delete post:', error);
      setEditError(error.message || 'Unable to delete post. Try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <article className="flex flex-col gap-3 rounded-3xl border border-olive-100 bg-white/70 p-5 shadow-sm ring-1 ring-olive-100/80 transition hover:-translate-y-0.5 hover:border-olive-200 hover:bg-white hover:shadow-lg dark:border-gray-800 dark:bg-gray-900/70 dark:ring-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-olive-500 dark:text-gray-400">
          <span className="h-9 w-9 overflow-hidden rounded-full bg-gradient-to-br from-green-400 to-green-600 text-white flex items-center justify-center text-sm font-semibold">
            {post.author?.image ? (
              <ImageWithFallback
                src={post.author.image}
                alt={post.author?.name || 'Community member'}
                fallback="/placeholder-avatar.jpg"
                className="h-full w-full object-cover"
              />
            ) : (
              (post.author?.name || '?').charAt(0).toUpperCase()
            )}
          </span>
          <span>{post.author?.name || 'Community member'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-olive-500 dark:text-gray-400">
          <span>{formatRelativeTime(post.createdAt)}</span>
          {post.canManage ? (
            isEditing ? (
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Check className="h-3.5 w-3.5" />
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSavingEdit}
                  className="inline-flex items-center gap-1 rounded-full border border-olive-300 px-3 py-1 font-semibold text-olive-600 transition hover:bg-olive-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-olive-300 dark:hover:bg-gray-800"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </span>
            ) : (
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="inline-flex items-center gap-1 rounded-full border border-olive-300 px-3 py-1 font-semibold text-olive-600 transition hover:bg-olive-100 dark:border-gray-700 dark:text-olive-300 dark:hover:bg-gray-800"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={handleDeletePost}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-300 px-3 py-1 font-semibold text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {isDeleting ? 'Deleting…' : 'Delete'}
                </button>
              </span>
            )
          ) : null}
        </div>
      </div>

      {editError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          {editError}
        </div>
      ) : null}

      {isEditing ? (
        <div className="space-y-3">
          <textarea
            value={draftContent}
            onChange={(event) => setDraftContent(event.target.value)}
            rows={4}
            className="w-full rounded-2xl border border-olive-200 bg-white px-3 py-2 text-sm text-olive-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            placeholder="Share something delicious…"
            disabled={isSavingEdit}
          />
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-olive-500 dark:text-gray-400">
              Image URL (optional)
            </label>
            <input
              type="url"
              value={draftImageUrl}
              onChange={(event) => setDraftImageUrl(event.target.value)}
              className="w-full rounded-2xl border border-olive-200 bg-white px-3 py-2 text-sm text-olive-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              placeholder="https://example.com/your-photo.jpg"
              disabled={isSavingEdit}
            />
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-olive-900 dark:text-gray-100">{post.content}</p>
      )}

      {(!isEditing && post.imageUrl) || (isEditing && draftImageUrl.trim()) ? (
        <div className="overflow-hidden rounded-2xl">
          <ImageWithFallback
            src={isEditing ? draftImageUrl || post.imageUrl : post.imageUrl}
            alt="Community post visual"
            fallback="/placeholder-recipe.jpg"
            className="max-h-72 w-full object-cover"
          />
        </div>
      ) : null}

      <div className="flex items-center justify-between text-xs text-olive-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLike}
            disabled={isLiking}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-semibold transition ${
              likeState.hasLiked
                ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:border-rose-400 dark:text-rose-300'
                : 'border-olive-200 text-olive-600 hover:border-olive-400 hover:bg-olive-100/60 dark:border-gray-700 dark:text-olive-300 dark:hover:border-olive-400'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <Heart className={`h-4 w-4 ${likeState.hasLiked ? 'fill-current' : ''}`} />
            <span>{likeState.likeCount}</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              const next = !showComments;
              setShowComments(next);
              if (next) {
                await ensureComments();
              }
            }}
            className="inline-flex items-center gap-2 rounded-full border border-olive-200 px-3 py-1 font-semibold text-olive-600 transition hover:border-olive-400 hover:bg-olive-100/60 dark:border-gray-700 dark:text-olive-300 dark:hover:border-olive-400"
          >
            <MessageCircle className="h-4 w-4" />
            <span>{commentButtonLabel}</span>
          </button>
        </span>
      </div>

      {showComments ? (
        <div className="rounded-2xl border border-olive-100 bg-white/80 p-4 dark:border-gray-800 dark:bg-gray-900">
          <CommentComposer onSubmit={handleSubmitComment} isSubmitting={commentSubmitting} />
          <div className="mt-4">
            <CommentList comments={comments} isLoading={commentsLoading} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default function ExternalPostFeed({ initialPosts }) {
  const [posts, setPosts] = useState(() => (Array.isArray(initialPosts) ? initialPosts.map(ensurePlainPost) : []));

  useEffect(() => {
    setPosts(Array.isArray(initialPosts) ? initialPosts.map(ensurePlainPost) : []);
  }, [initialPosts]);

  const handlePostUpdated = useCallback((postId, updates) => {
    setPosts((previous) =>
      previous.map((post) => (post.id === postId ? ensurePlainPost({ ...post, ...updates }) : post))
    );
  }, []);

  const handlePostRemoved = useCallback((postId) => {
    setPosts((previous) => previous.filter((post) => post.id !== postId));
  }, []);

  if (!posts.length) {
    return (
      <div className="rounded-2xl border border-dashed border-olive-200 bg-white/70 p-8 text-center text-sm text-olive-500 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-400">
        No community posts just yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <ExternalPostCard key={post.id} post={post} onPostUpdated={handlePostUpdated} onPostRemoved={handlePostRemoved} />
      ))}
    </div>
  );
}
