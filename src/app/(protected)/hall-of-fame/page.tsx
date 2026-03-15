'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { AWARD_EMOJI, AWARD_DISPLAY_NAMES, type AwardType } from '@/lib/trophy-utils';
import type { Trophy, User } from '@/types/database';
import Avatar from '@/components/Avatar';

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
        <div className="h-8 bg-[var(--bg-skeleton)] rounded animate-pulse w-48" />
        {[1, 2, 3].map(i => (
          <div key={i} className="space-y-2">
            <div className="h-6 bg-[var(--bg-skeleton)] rounded animate-pulse w-40" />
            <div className="h-20 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Hall of Fame</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Award winners through the years</p>
      </div>

      {orderedCategories.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">🏆</p>
          <p className="text-[var(--text-muted)] text-sm">No awards recorded yet.</p>
        </div>
      ) : (
        orderedCategories.map(awardType => {
          const items = groupedByType[awardType];
          const emoji = AWARD_EMOJI[awardType];
          const displayName = AWARD_DISPLAY_NAMES[awardType];
          const headerEmoji = awardType === 'bobby_jones_cup' ? '🌳🌺' : emoji;

          return (
            <section key={awardType} className="space-y-2">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <span className="text-xl">{headerEmoji}</span>
                {displayName}
              </h2>

              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden">
                {items.map((trophy, idx) => (
                  <div
                    key={trophy.id}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      idx < items.length - 1 ? 'border-b border-[var(--border-light)]' : ''
                    }`}
                  >
                    {/* Player photo */}
                    <Avatar
                      src={trophy.user?.profile_picture_url}
                      name={trophy.user?.full_name}
                      className="w-9 h-9 bg-minerva-100 flex-shrink-0"
                      textClassName="text-xs font-bold text-minerva-600"
                    />

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {trophy.user?.full_name || 'Unknown'}
                      </p>
                      {trophy.description && (
                        <p className="text-xs text-[var(--text-muted)]">{trophy.description}</p>
                      )}
                    </div>

                    {/* Year + emoji */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-base">{trophy.emoji}</span>
                      <span className="text-sm font-semibold text-[var(--text-secondary)]">{trophy.year}</span>
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
