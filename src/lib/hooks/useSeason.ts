'use client';

import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import type { Season, Event } from '@/types/database';

interface SeasonData {
  season: Season | null;
  currentEvent: Event | null;
}

export function useSeason() {
  const supabase = createClient();

  const { data, isLoading } = useSWR<SeasonData>(
    'current-season',
    async () => {
      const { data: seasons } = await supabase
        .from('seasons')
        .select('*')
        .order('year', { ascending: false })
        .limit(1);

      if (!seasons || seasons.length === 0) {
        return { season: null, currentEvent: null };
      }

      const s = seasons[0];
      let currentEvent: Event | null = null;

      const today = new Date().toISOString().split('T')[0];
      if (s.current_event_id) {
        const { data: event } = await supabase
          .from('events')
          .select('*')
          .eq('id', s.current_event_id)
          .single();
        currentEvent = event;
      } else {
        const { data: events } = await supabase
          .from('events')
          .select('*')
          .eq('season_id', s.id)
          .lte('start_date', today)
          .gte('end_date', today)
          .limit(1);
        if (events && events.length > 0) currentEvent = events[0];
      }

      return { season: s, currentEvent };
    },
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 10000, // Season data changes rarely
    }
  );

  const season = data?.season ?? null;
  const currentEvent = data?.currentEvent ?? null;

  const isOffSeason = season?.mode === 'off_season';
  const isRegularSeason = season?.mode === 'regular_season';
  const isPlayoffs = season?.mode === 'playoffs';
  const isTournament = season?.mode === 'tournament';
  const canSubmitScores = !isOffSeason;

  return {
    season,
    currentEvent,
    loading: isLoading,
    isOffSeason,
    isRegularSeason,
    isPlayoffs,
    isTournament,
    canSubmitScores,
  };
}
