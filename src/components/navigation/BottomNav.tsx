'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Target, Trophy, User, Shield, Menu, X, MapPin, Calendar, BarChart3, Users, Clock, Swords, Award, Eye, EyeOff } from 'lucide-react';
import { useUser } from '@/lib/hooks/useUser';
import { useAdminMode } from '@/lib/hooks/useAdminMode';

const mainItems = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/scores', label: 'Scores', icon: Target },
  { href: '/leaderboard', label: 'Leaders', icon: Trophy },
  { href: '/profile', label: 'Profile', icon: User },
];

const menuItems = [
  { href: '/courses', label: 'Courses', icon: MapPin },
  { href: '/schedule', label: 'Schedule', icon: Calendar },
  { href: '/event-history', label: 'Event History', icon: Clock },
  { href: '/stats', label: 'Tour Stats', icon: BarChart3 },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/hall-of-fame', label: 'Hall of Fame', icon: Award },
  { href: '/playoffs', label: 'Playoffs', icon: Swords },
  { href: '/tournament', label: 'Tournament', icon: Trophy },
];

const adminItem = { href: '/admin', label: 'Admin', icon: Shield };

export default function BottomNav() {
  const pathname = usePathname();
  const { isAdmin, isAuthenticated } = useUser();
  const { isAdminView, toggleAdminMode } = useAdminMode();
  const [menuOpen, setMenuOpen] = useState(false);

  // When admin toggle is off, admin sees member view (no admin link)
  const showAdminFeatures = isAdmin && isAdminView;

  if (!isAuthenticated) return null;

  return (
    <>
      {/* Slide-up Menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl p-4 pb-8 safe-area-bottom animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">More</h3>
              <button onClick={() => setMenuOpen(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors ${
                      isActive ? 'bg-emerald-50 text-emerald-600' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-medium">{item.label}</span>
                  </Link>
                );
              })}
              {showAdminFeatures && (
                <Link
                  href={adminItem.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors ${
                    pathname.startsWith(adminItem.href) ? 'bg-red-50 text-red-600' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Shield className="w-5 h-5" />
                  <span className="text-xs font-medium">Admin</span>
                </Link>
              )}
              {/* Admin Mode Toggle */}
              {isAdmin && (
                <button
                  onClick={toggleAdminMode}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors ${
                    isAdminView ? 'bg-purple-50 text-purple-600' : 'bg-gray-50 text-gray-500'
                  }`}
                >
                  {isAdminView ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                  <span className="text-xs font-medium">{isAdminView ? 'Admin View' : 'Member View'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Nav Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom z-40">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {mainItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-0 flex-1 ${
                  isActive ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-[10px] leading-tight ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
          {/* More menu */}
          <button
            onClick={() => setMenuOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-0 flex-1 ${
              menuOpen ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] leading-tight font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
