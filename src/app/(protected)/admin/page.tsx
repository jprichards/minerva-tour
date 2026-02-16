'use client';

import Link from 'next/link';
import { useUser } from '@/lib/hooks/useUser';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Users, UserPlus, FileText, Calendar, Settings, Shield, Database, Swords, Trophy, Cog, RotateCcw, Award } from 'lucide-react';

const adminLinks = [
  {
    href: '/admin/users',
    label: 'User Management',
    description: 'View users, change roles, delete accounts',
    icon: Users,
    color: 'bg-blue-100 text-blue-600',
  },
  {
    href: '/admin/provisions',
    label: 'User Provisioning',
    description: 'Pre-provision users by email, manage invites',
    icon: UserPlus,
    color: 'bg-green-100 text-green-600',
  },
  {
    href: '/admin/seasons',
    label: 'Season & Events',
    description: 'Manage seasons, events, mode switching',
    icon: Calendar,
    color: 'bg-purple-100 text-purple-600',
  },
  {
    href: '/admin/playoffs',
    label: 'Playoff Brackets',
    description: 'Manage playoff matchups, set winners, advance players',
    icon: Swords,
    color: 'bg-orange-100 text-orange-600',
  },
  {
    href: '/admin/tournaments',
    label: 'Tournaments',
    description: 'Activate and manage tournament mode',
    icon: Trophy,
    color: 'bg-red-100 text-red-600',
  },
  {
    href: '/admin/trophies',
    label: 'Trophies & Awards',
    description: 'Award trophies, manage member achievements',
    icon: Award,
    color: 'bg-yellow-100 text-yellow-600',
  },
  {
    href: '/admin/audit',
    label: 'Audit Logs',
    description: 'View action history, filter, search',
    icon: FileText,
    color: 'bg-amber-100 text-amber-600',
  },
  {
    href: '/admin/retroactive',
    label: 'Retroactive Scores',
    description: 'Enter retroactive scores for members in unplayable climates',
    icon: RotateCcw,
    color: 'bg-teal-100 text-teal-600',
  },
  {
    href: '/admin/data',
    label: 'Database Viewer',
    description: 'Browse and edit database tables',
    icon: Database,
    color: 'bg-indigo-100 text-indigo-600',
  },
  {
    href: '/admin/settings',
    label: 'App Settings',
    description: 'Google Photos URL, rules link, app config',
    icon: Cog,
    color: 'bg-[var(--bg-subtle)] text-[var(--text-muted)]',
  },
];

export default function AdminPage() {
  const { isAdmin, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.push('/home');
    }
  }, [isAdmin, loading, router]);

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 bg-[var(--bg-skeleton)] rounded-lg animate-pulse w-32" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Shield className="w-6 h-6 text-minerva-600" />
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Admin</h1>
      </div>

      <div className="space-y-3">
        {adminLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-4 bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border-light)] shadow-[var(--shadow-sm)] hover:shadow-md transition-shadow"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${link.color}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{link.label}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{link.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
