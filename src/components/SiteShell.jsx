'use client';

import { usePathname } from 'next/navigation';
import ConditionalHeader from '@/components/ConditionalHeader';
import Footer from '@/components/Footer';
import FloatingThemeToggle from '@/components/FloatingThemeToggle';

export default function SiteShell({ children }) {
  const pathname = usePathname();
  const hideGlobalChrome = pathname?.startsWith('/admin') || pathname?.startsWith('/auth');
  const hideFooter =
    hideGlobalChrome ||
    pathname === '/profile' ||
    pathname === '/recipes/create' ||
    pathname?.startsWith('/fitsavory');

  return (
    <div className="min-h-screen flex flex-col">
      {!hideGlobalChrome && <ConditionalHeader />}
      <main
        id="main-content"
        className={`flex-grow${hideGlobalChrome ? '' : ' pt-16 md:pt-20'}`}
      >
        {children}
      </main>

      {!hideFooter && <Footer />}
      <FloatingThemeToggle />
    </div>
  );
}
