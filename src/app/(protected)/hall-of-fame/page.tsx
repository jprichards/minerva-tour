'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { AWARD_EMOJI, AWARD_DISPLAY_NAMES, type AwardType } from '@/lib/trophy-utils';
import type { Trophy, User } from '@/types/database';

type TrophyWithUser = Trophy & { user: Pick<User, 'id' | 'full_name' | 'profile_picture_url'> };

const AWARD_ORDER: AwardType[] = [
  'minerva_tour_champion',
  'scratch_champion',
  'most_improved',
  'bobby_jones_cup',
  'member_guest',
  'playoffs_winner',
  'consolation_winner',
  'unicorn',
  'edge_solutions_cup',
  'hole_in_one',
];

export default function HallOfFamePage() {
  const supabase = createClient();

  const { data: trophies = [], isLoading } = useSWR<TrophyWithUser[]>(
    'hall-of-fame-trophies',
    async () => {
      const { data } = await supabase
        .from('trophies')
        .select('*, user:users!user_id(id, full_name, profile_picture_url)')
        .order('year', { ascending: false });
      return (data || []) as TrophyWithUser[];
    },
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  // Group by award_type
  const groupedByType = useMemo(() => {
    const map: Record<string, TrophyWithUser[]> = {};
    for (const t of trophies) {
      if (!map[t.award_type]) map[t.award_type] = [];
      map[t.award_type].push(t);
    }
    return map;
  }, [trophies]);

  // Order categories according to AWARD_ORDER
  const orderedCategories = useMemo(() => {
    return AWARD_ORDER.filter(type => groupedByType[type]?.length > 0);
  }, [groupedByType]);

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 bg-gray-200 rounded animate-pulse w-48" />
        {[1, 2, 3].map(i => (
          <div key={i} className="space-y-2">
            <div className="h-6 bg-gray-200 rounded animate-pulse w-40" />
            <div className="h-20 bg-gray-200 rounded-xl animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hall of Fame</h1>
        <p className="text-sm text-gray-500 mt-1">Award winners through the years</p>
      </div>

      {orderedCategories.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">🏆</p>
          <p className="text-gray-500 text-sm">No awards recorded yet.</p>
        </div>
      ) : (
        orderedCategories.map(awardType => {
          const items = groupedByType[awardType];
          const emoji = AWARD_EMOJI[awardType];
          const displayName = AWARD_DISPLAY_NAMES[awardType];

          return (
            <section key={awardType} className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <span className="text-xl">{emoji}</span>
                {displayName}
              </h2>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {items.map((trophy, idx) => (
                  <div
                    key={trophy.id}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      idx < items.length - 1 ? 'border-b border-gray-50' : ''
                    }`}
                  >
                    {/* Player photo */}
                    <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                      {trophy.user?.profile_picture_url ? (
                        <img
                          src={trophy.user.profile_picture_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-bold text-emerald-600">
                          {(trophy.user?.full_name || '?')[0].toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {trophy.user?.full_name || 'Unknown'}
                      </p>
                      {trophy.description && (
                        <p className="text-xs text-gray-500">{trophy.description}</p>
                      )}
                    </div>

                    {/* Year + emoji */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-base">{trophy.emoji}</span>
                      <span className="text-sm font-semibold text-gray-700">{trophy.year}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
