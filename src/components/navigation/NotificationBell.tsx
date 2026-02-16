'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useUser } from '@/lib/hooks/useUser';
import { useNotifications } from '@/lib/hooks/useNotifications';

export default function NotificationBell() {
  const { profile, isAuthenticated } = useUser();
  const { unreadCount } = useNotifications(profile?.id);

  if (!isAuthenticated) return null;

  return (
    <Link
      href="/notifications"
      className="relative p-2 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors"
    >
      <Bell className="w-5 h-5 text-[var(--text-muted)]" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold w-4.5 h-4.5 flex items-center justify-center rounded-full min-w-[18px] px-1">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
