'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Search, Users, TrendingUp } from 'lucide-react';
import type { User } from '@/types/database';

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
      <h1 className="text-2xl font-bold text-gray-900">Members</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <p className="text-xs text-gray-400">{filtered.length} members</p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No members found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((member) => (
            <Link
              key={member.id}
              href={`/members/${member.id}`}
              className="flex items-center gap-3 bg-white rounded-xl p-3 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="w-11 h-11 bg-emerald-100 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                {member.profile_picture_url ? (
                  <img src={member.profile_picture_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-emerald-600">
                    {(member.full_name || member.email || '?')[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {member.full_name || 'Unnamed'}
                </p>
                <p className="text-xs text-gray-500 capitalize">{member.role.replace(/_/g, ' ')}</p>
              </div>
              {member.handicap_index != null && (
                <div className="flex items-center gap-1 text-right">
                  <TrendingUp className="w-3 h-3 text-gray-400" />
                  <span className="text-sm font-medium text-gray-600">{member.handicap_index}</span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
