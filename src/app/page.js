'use client';

import { useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import HomeContent from './HomeContent';
import PricingModalWrapper from '@/components/PricingModalWrapper.jsx';

// Development-only sign out helper
const useDevSignOut = () => {
  const searchParams = useSearchParams();
  const { status } = useSession();
  
  useEffect(() => {
    if (
      process.env.NODE_ENV === 'development' &&
      searchParams.get('signout') &&
      status === 'authenticated'
    ) {
      signOut({ callbackUrl: window.location.pathname });
    }
  }, [searchParams, status]);
};

export default function Home() {
  const { data: session, status } = useSession();

  useDevSignOut();

  // Show loading state
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-600"></div>
      </div>
    );
  }

  // Render the main content
  return (
    <PricingModalWrapper>
      <HomeContent />
    </PricingModalWrapper>
  );
}
