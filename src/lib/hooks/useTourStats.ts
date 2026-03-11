'use client';

import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import type { Score, Event, Season, User, HandicapHistory } from '@/types/database';

export interface TourStatsData {
  seasons: Season[];
  selectedSeason: Season | null;
  seasonEvents: Event[];
  allScores: Score[];
  members: User[];
  handicapHistory: HandicapHistory[];
}

/**
 * Fetches all data needed for tour-wide stats.
 * When seasonYear is a number, scopes to that season.
 * When seasonYear is 'all', fetches across all seasons.
 */
export function useTourStats(seasonYear: number | 'all') {
  const supabase = createClient();

  return useSWR<TourStatsData>(
    ['tour-stats', seasonYear],
    async () => {
      const { data: seasons } = await supabase
        .from('seasons')
        .select('*')
        .order('year', { ascending: false });

      const allSeasons = seasons || [];

      const selectedSeason = seasonYear === 'all'
        ? null
        : allSeasons.find((s) => s.year === seasonYear) || null;

      let events: Event[] = [];
      if (seasonYear === 'all') {
        const { data } = await supabase
          .from('events')
          .select('*')
          .order('start_date', { ascending: true });
        events = data || [];
      } else if (selectedSeason) {
        const { data } = await supabase
          .from('events')
          .select('*')
          .eq('season_id', selectedSeason.id)
          .order('event_number', { ascending: true });
        events = data || [];
      }

      const eventIds = events.map((e) => e.id);

      let scores: Score[] = [];
      if (eventIds.length > 0) {
        const eventBatchSize = 100;
        const pageSize = 1000;
        for (let i = 0; i < eventIds.length; i += eventBatchSize) {
          const batch = eventIds.slice(i, i + eventBatchSize);
          // Paginate to avoid Supabase's default 1000-row limit
          let offset = 0;
          let hasMore = true;
          while (hasMore) {
            const { data } = await supabase
              .from('scores')
              .select('*, course:courses(course_name, tee_name, par, type, rating, slope), user:users!user_id(id, full_name, email, profile_picture_url, handicap_index)')
              .in('event_id', batch)
              .eq('is_complete', true)
              .not('net_strokes_over_par', 'is', null)
              .range(offset, offset + pageSize - 1);
            if (data) {
              scores = scores.concat(data);
              hasMore = data.length === pageSize;
              offset += pageSize;
            } else {
              hasMore = false;
            }
          }
        }
      }

      const { data: members } = await supabase
        .from('users')
        .select('*')
        .in('role', ['admin', 'member'])
        .order('full_name');

      const { data: handicapData } = await supabase
        .from('handicap_history')
        .select('*')
        .order('effective_date', { ascending: true });

      return {
        seasons: allSeasons,
        selectedSeason,
        seasonEvents: events,
        allScores: scores,
        members: members || [],
        handicapHistory: handicapData || [],
      };
    },
    { revalidateOnFocus: false, dedupingInterval: 10000 }
  );
}
