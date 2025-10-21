'use client';

import { useCallback } from 'react';
import { MessageCircle } from 'lucide-react';
import { useSession } from 'next-auth/react';

import { useAuthModal } from '@/components/AuthProvider';

const chatFeatureEnabled = process.env.NEXT_PUBLIC_ENABLE_CHAT === 'true';

export default function MessageUserButton({ participantId, participantName }) {
  const { status } = useSession();
  const { requireAuth } = useAuthModal();

  const handleClick = useCallback(() => {
    if (!chatFeatureEnabled) {
      return;
    }

    if (status !== 'authenticated') {
      requireAuth('send direct messages');
      return;
    }

    window.dispatchEvent(
      new CustomEvent('sf:openChat', {
        detail: {
          participantId,
          participantName,
        },
      })
    );
  }, [participantId, participantName, requireAuth, status]);

  const buttonDisabled = !chatFeatureEnabled || status === 'loading';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={buttonDisabled}
      className={`inline-flex min-w-[160px] items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-400 disabled:cursor-not-allowed disabled:opacity-60 ${
        buttonDisabled
          ? 'border-gray-200 bg-white/70 text-gray-400 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-500'
          : 'border-emerald-200 bg-white/85 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-300 dark:bg-emerald-700/60 dark:text-white dark:hover:border-emerald-200 dark:hover:bg-emerald-600/70'
      }`}
      aria-label={chatFeatureEnabled ? `Message ${participantName}` : 'Messaging temporarily unavailable'}
    >
      <MessageCircle className="h-3.5 w-3.5" />
      Message
    </button>
  );
}
