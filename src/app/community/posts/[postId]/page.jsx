import { notFound } from 'next/navigation';

import PostDetailClient from './PostDetailClient';

const resolveBaseUrl = () => {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    if (vercelUrl.startsWith('http://') || vercelUrl.startsWith('https://')) {
      return vercelUrl.replace(/\/$/, '');
    }
    return `https://${vercelUrl}`;
  }

  return ''; // fallback to relative fetch when running locally
};

const fetchCommunityPostById = async (postId) => {
  const baseUrl = resolveBaseUrl();
  const endpoint = new URL(`/api/community/posts/${postId}`, baseUrl);

  const response = await fetch(endpoint, {
    next: { revalidate: 15 },
    cache: 'no-store',
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }

    throw new Error(`Failed to load community post (${response.status})`);
  }

  const data = await response.json();
  return data?.post ?? null;
};

export default async function CommunityPostPage({ params, searchParams }) {
  const rawPostId = params?.postId;
  const postId = Number.parseInt(rawPostId ?? '', 10);
  if (!Number.isFinite(postId) || postId <= 0) {
    notFound();
  }

  const post = await fetchCommunityPostById(postId);
  if (!post) {
    notFound();
  }

  const highlightCommentId = Number.isFinite(Number(searchParams?.commentId))
    ? Number.parseInt(searchParams.commentId, 10)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <PostDetailClient post={post} highlightCommentId={highlightCommentId} />
    </div>
  );
}
