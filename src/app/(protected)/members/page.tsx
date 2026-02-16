'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Search, Users, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getHandicapTrend } from '@/lib/handicap-trend';
import type { User, Trophy } from '@/types/database';

type HandicapHistoryEntry = {
  user_id: string;
  handicap_index: number;
  effective_date: string;
};

export default function MembersPage() {
  const [search, setSearch] = useState('');
  const supabase = createClient();

  const { data: members = [], isLoading: loading } = useSWR(
    'members',
    async () => {
      const { data } = await supabase
        .from('users')
        .select('*')
        .in('role', ['admin', 'member', 'playing_guest'])
        .order('full_name');
      return data || [];
    },
    { revalidateOnFocus: true, dedupingInterval: 5000 }
  );

  const { data: handicapHistory = [] } = useSWR<HandicapHistoryEntry[]>(
    'handicap-history-trends',
    async () => {
      const { data } = await supabase
        .from('handicap_history')
        .select('user_id, handicap_index, effective_date')
        .order('effective_date', { ascending: false });
      return data || [];
    },
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  const { data: allTrophies = [] } = useSWR<Trophy[]>(
    'all-member-trophies',
    async () => {
      const { data } = await supabase
        .from('trophies')
        .select('id, user_id, emoji, award_type, year')
        .order('year', { ascending: false });
      return (data || []) as Trophy[];
    },
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  // Build a map of user_id -> unique emojis
  const userEmojisMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const t of allTrophies) {
      if (!map[t.user_id]) map[t.user_id] = [];
      if (!map[t.user_id].includes(t.emoji)) {
        map[t.user_id].push(t.emoji);
      }
    }
    return map;
  }, [allTrophies]);

  // Build a map of user_id -> previous handicap (second most recent entry)
  const previousHandicapMap = useMemo(() => {
    const map: Record<string, number | null> = {};
    const seen: Record<string, number> = {};
    for (const entry of handicapHistory) {
      seen[entry.user_id] = (seen[entry.user_id] || 0) + 1;
      // The second entry (index 2) is the previous handicap
      if (seen[entry.user_id] === 2) {
        map[entry.user_id] = Number(entry.handicap_index);
      }
    }
    return map;
  }, [handicapHistory]);

  const filtered = members.filter((m) => {
    if (!search) return true;
    const lower = search.toLowerCase();
    return (
      m.full_name?.toLowerCase().includes(lower) ||
      m.email?.toLowerCase().includes(lower)
    );
  });

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Members</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
        <input
          type="text"
          placeholder="Search members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
        />
      </div>

      <p className="text-xs text-[var(--text-faint)]">{filtered.length} members</p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-[var(--text-muted)] text-sm">No members found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((member) => (
            <Link
              key={member.id}
              href={`/members/${member.id}`}
              className="flex items-center gap-3 bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)] hover:shadow-md transition-shadow"
            >
              <div className="w-11 h-11 bg-minerva-100 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                {member.profile_picture_url ? (
                  <img src={member.profile_picture_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-minerva-600">
                    {(member.full_name || member.email || '?')[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    {member.full_name || 'Unnamed'}
                  </p>
                  {userEmojisMap[member.id] && userEmojisMap[member.id].length > 0 && (
                    <span className="flex items-center gap-0.5 flex-shrink-0">
                      {userEmojisMap[member.id].slice(0, 5).map((emoji, i) => (
                        <span key={i} className="text-xs">{emoji}</span>
                      ))}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)] capitalize">{member.role.replace(/_/g, ' ')}</p>
              </div>
              {member.handicap_index != null && (() => {
                const trend = getHandicapTrend(
                  Number(member.handicap_index),
                  previousHandicapMap[member.id] ?? null
                );
                return (
                  <div className="flex items-center gap-1 text-right">
                    {trend === 'improved' ? (
                      <TrendingDown className="w-3 h-3 text-green-500" />
                    ) : trend === 'worsened' ? (
                      <TrendingUp className="w-3 h-3 text-red-500" />
                    ) : (
                      <Minus className="w-3 h-3 text-[var(--text-faint)]" />
                    )}
                    <span className="text-sm font-medium text-[var(--text-muted)]">{member.handicap_index}</span>
                  </div>
                );
              })()}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
