'use client';

import { useEffect } from 'react';

import { PostCard } from '@/app/community/page';

export default function PostDetailClient({ post, highlightCommentId }) {
  useEffect(() => {
    if (!highlightCommentId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const target = document.getElementById(`comment-${highlightCommentId}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
      }
    }, 150);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [highlightCommentId]);

  return (
    <PostCard
      post={post}
      initiallyOpenComments={Boolean(highlightCommentId)}
      highlightCommentId={highlightCommentId ? Number(highlightCommentId) : null}
    />
  );
}
