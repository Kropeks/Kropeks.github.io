import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';

export default async function AdminLayout({ children }) {
  let session;
  try {
    session = await auth();
  } catch (error) {
    console.error('Error getting session:', error);
    redirect('/auth/login?error=SessionError');
  }
  
  if (!session?.user) {
    console.log('No user session found, redirecting to login');
    redirect('/auth/login?callbackUrl=/admin');
  }
  
  const userEmail = session.user.email?.toLowerCase();
  const userRole = session.user.role?.toLowerCase();
  const isAdminUser = userRole === 'admin' || userEmail === 'savoryadmin@example.com';
  
  console.log('Admin Access Check:', {
    userEmail,
    userRole,
    isAdminUser,
    hasSession: !!session,
    hasUser: !!session?.user
  });
  
  if (!isAdminUser) {
    console.log('Access denied - User is not an admin');
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-light-100 via-soft-100 to-matte-100 dark:from-olive-950 dark:via-olive-900 dark:to-olive-800 text-foreground">
      <div className="flex min-h-screen backdrop-blur-sm">
        <AdminSidebar />
        <main className="flex-1 overflow-auto bg-white/85 dark:bg-gray-950/60 border-l border-white/40 dark:border-olive-900/40 shadow-[0_20px_45px_rgba(107,142,35,0.12)]">
          <div className="p-8 lg:p-10 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
