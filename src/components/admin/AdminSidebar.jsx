'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LayoutDashboard, Users, Utensils, ShieldCheck, BarChart2, Bell, Settings, LogOut } from 'lucide-react';

const navItems = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Manage Recipes', href: '/admin/recipes', icon: Utensils },
  { name: 'Manage Users', href: '/admin/users', icon: Users },
  { name: 'Subscriptions', href: '/admin/subscriptions', icon: ShieldCheck },
  { name: 'Analytics', href: '/admin/analytics', icon: BarChart2 },
  { name: 'Reports', href: '/admin/reports', icon: Bell },
  { name: 'Broadcast Message', href: '/admin/notifications', icon: Bell },
  { name: 'Refunds', href: '/admin/refunds', icon: Settings },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const handleLogout = () => {
    signOut({ callbackUrl: '/auth/login' });
  };

  return (
    <div className="w-64 bg-gradient-to-b from-olive-700 via-olive-600 to-olive-500 text-white h-screen sticky top-0 flex flex-col shadow-[0_10px_35px_rgba(107,142,35,0.35)]">
      <div className="p-5 border-b border-white/20">
        <h1 className="text-xl font-heading font-semibold tracking-wide">Admin Dashboard</h1>
        <p className="text-sm text-white/80 mt-1">SavoryFlavors Control Center</p>
      </div>
      <nav className="p-4 flex-1 overflow-y-auto min-h-0">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={`group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-white text-olive-700 shadow-lg shadow-black/10'
                      : 'text-white/85 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <item.icon
                    className={`h-5 w-5 ${
                      isActive ? 'text-olive-600' : 'text-white/70 group-hover:text-white'
                    }`}
                  />
                  <span className={`font-medium ${isActive ? 'text-olive-700' : ''}`}>{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-auto p-4 border-t border-white/10 bg-olive-800/30 backdrop-blur-sm">
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white text-olive-600 hover:bg-white/90 hover:text-olive-700 transition-colors px-3 py-3 font-medium"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
          <Link
            href="/"
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 text-white/90 hover:bg-white/20 hover:text-white transition-colors px-3 py-3 font-medium"
          >
            Back to Main Site
          </Link>
        </div>
      </div>
    </div>
  );
}
