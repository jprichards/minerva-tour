'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { Trophy, Medal, TrendingUp, AlertCircle, Download } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { downloadCSV } from '@/lib/export';
import { useSeason } from '@/lib/hooks/useSeason';
import { formatNetScore, formatPoints } from '@/lib/scoring';
import { computeEventLeaderboard, computeSeasonStandings } from '@/lib/standings';
import PlayoffBracket from '@/components/playoffs/PlayoffBracket';
import type { Score, Event, Season } from '@/types/database';
import { formatLocalDate } from '@/lib/date-utils';

type ViewMode = 'event' | 'season';
type BoardTab = 'playoffs' | 'net' | 'scratch';

export default function LeaderboardPage() {
  const { profile } = useUser();
  const { isOffSeason, isPlayoffs } = useSeason();
  const [view, setView] = useState<ViewMode>('event');
  const [boardTab, setBoardTab] = useState<BoardTab>('net');
  const defaultTabAppliedRef = useRef(false);
  const scoringMode = boardTab === 'scratch' ? 'scratch' : 'net';
  const supabase = createClient();

  const { data: leaderboardData, isLoading: loading } = useSWR(
    'leaderboard',
    async () => {
      // Get current season
      const { data: seasons } = await supabase
        .from('seasons')
        .select('*')
        .order('year', { ascending: false })
        .limit(1);

      if (!seasons || seasons.length === 0) {
        return {
          currentSeason: null as Season | null,
          currentEvent: null as Event | null,
          eventScores: [] as Score[],
          allSeasonScores: [] as Score[],
          seasonEvents: [] as Event[],
          hasPlayoffBrackets: false,
        };
      }

      const season = seasons[0];

      // Lightweight existence check — used to decide whether the Playoffs
      // tab should be offered at all (independent of the season's mode).
      const { data: bracketCheck } = await supabase
        .from('playoff_brackets')
        .select('id')
        .eq('season_id', season.id)
        .limit(1);
      const hasPlayoffBrackets = !!(bracketCheck && bracketCheck.length > 0);

      // Get all events for this season
      const { data: events } = await supabase
        .from('events')
        .select('*')
        .eq('season_id', season.id)
        .order('event_number');

      // Get current event
      const today = new Date().toISOString().split('T')[0];
      let activeEvent: Event | null = null;

      if (season.current_event_id) {
        const found = events?.find((e) => e.id === season.current_event_id);
        if (found) activeEvent = found;
      }

      if (!activeEvent && events) {
        const active = events.find(
          (e) => e.start_date <= today && e.end_date >= today
        );
        if (active) activeEvent = active;
      }

      // Get scores for current event
      let eventScores: Score[] = [];
      if (activeEvent) {
        const { data: scores } = await supabase
          .from('scores')
          .select('*, course:courses(*), user:users!user_id(full_name, email, profile_picture_url, handicap_index)')
          .eq('event_id', activeEvent.id);
        eventScores = scores || [];
      }

      // Get all season scores
      let allSeasonScores: Score[] = [];
      if (events && events.length > 0) {
        const eventIds = events.map((e) => e.id);
        const { data: scores } = await supabase
          .from('scores')
          .select('*, course:courses(*), user:users!user_id(full_name, email, profile_picture_url), event:events(*)')
          .in('event_id', eventIds);
        allSeasonScores = scores || [];
      }

      return {
        currentSeason: season as Season,
        currentEvent: activeEvent,
        eventScores,
        allSeasonScores,
        seasonEvents: (events || []) as Event[],
        hasPlayoffBrackets,
      };
    },
    { revalidateOnFocus: true, dedupingInterval: 5000 }
  );

  const { mutate: globalMutate } = useSWRConfig();

  const currentSeason = leaderboardData?.currentSeason ?? null;
  const currentEvent = leaderboardData?.currentEvent ?? null;
  const eventScores = leaderboardData?.eventScores ?? [];
  const hasPlayoffBrackets = leaderboardData?.hasPlayoffBrackets ?? false;
  const showPlayoffsTab = isPlayoffs || hasPlayoffBrackets;
  const allSeasonScores = leaderboardData?.allSeasonScores ?? [];
  const seasonEvents = leaderboardData?.seasonEvents ?? [];

  // Realtime subscription: refresh leaderboard when scores change
  useEffect(() => {
    const channel = supabase
      .channel('leaderboard-scores')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores' },
        () => {
          // Revalidate the leaderboard SWR cache when any score changes
          globalMutate('leaderboard');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, globalMutate]);

  // Default to the Playoffs tab during playoffs mode, applied once the
  // season data resolves. Never overrides a tab the user already picked.
  useEffect(() => {
    if (defaultTabAppliedRef.current || loading) return;
    defaultTabAppliedRef.current = true;
    if (isPlayoffs) setBoardTab('playoffs');
  }, [loading, isPlayoffs]);

  const eventLeaderboard = useMemo(
    () => currentEvent ? computeEventLeaderboard(eventScores, currentEvent, currentSeason, scoringMode) : [],
    [eventScores, currentEvent, currentSeason, scoringMode]
  );

  const seasonStandings = useMemo(
    () => computeSeasonStandings(allSeasonScores, seasonEvents, scoringMode),
    [allSeasonScores, seasonEvents, scoringMode]
  );

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 bg-[var(--bg-skeleton)] rounded-lg animate-pulse w-48" />
        <div className="h-12 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (isOffSeason) {
    return (
      <div className="p-4 text-center py-16">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Off Season</h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">Leaderboards are hidden during the off-season. Check back when the season starts!</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Leaderboard</h1>
        {boardTab !== 'playoffs' && (
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                if (view === 'event') {
                  downloadCSV(
                    eventLeaderboard.map((e, i) => ({
                      Rank: i + 1,
                      Player: e.playerName,
                      Score: e.bestNetOverPar ?? '',
                      Gross: e.bestGrossScore ?? '',
                      Points: formatPoints(e.projectedPoints),
                      Course: e.courseName,
                      Holes: e.holesPlayed,
                    })),
                    `leaderboard-event-${currentEvent?.event_number || 'current'}`
                  );
                } else {
                  downloadCSV(
                    seasonStandings.map((e, i) => ({
                      Rank: i + 1,
                      Player: e.playerName,
                      Points: formatPoints(e.totalPoints),
                      Events: e.eventsPlayed,
                    })),
                    `leaderboard-season-${currentSeason?.year || 'current'}`
                  );
                }
              }}
              className="p-2 text-[var(--text-faint)] hover:text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] rounded-lg transition-colors"
              title="Export CSV"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Board Tabs: Playoffs (during playoffs) | Net | Scratch */}
      <div className="flex bg-[var(--bg-subtle)] rounded-xl p-1">
        {showPlayoffsTab && (
          <button
            onClick={() => setBoardTab('playoffs')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              boardTab === 'playoffs' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-muted)]'
            }`}
          >
            Playoffs
          </button>
        )}
        <button
          onClick={() => setBoardTab('net')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            boardTab === 'net' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-muted)]'
          }`}
        >
          Net
        </button>
        <button
          onClick={() => setBoardTab('scratch')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            boardTab === 'scratch' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-muted)]'
          }`}
        >
          Scratch
        </button>
      </div>

      {boardTab === 'playoffs' ? (
        currentSeason && <PlayoffBracket seasonId={currentSeason.id} />
      ) : (
      <>
      {/* View Toggle */}
      <div className="flex bg-[var(--bg-subtle)] rounded-xl p-1">
        <button
          onClick={() => setView('event')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            view === 'event' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-muted)]'
          }`}
        >
          Current Event
        </button>
        <button
          onClick={() => setView('season')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            view === 'season' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-muted)]'
          }`}
        >
          Season Standings
        </button>
      </div>

      {/* Event Leaderboard */}
      {view === 'event' && (
        <>
          {currentEvent ? (
            <div className="bg-minerva-50 rounded-xl p-3 mb-2">
              <p className="text-sm font-medium text-minerva-800">
                {currentEvent.name || `Event ${currentEvent.event_number}`}
                {currentEvent.is_major && ' (Major)'}
              </p>
              <p className="text-xs text-minerva-600">
                {currentEvent.holes} holes &middot;{' '}
                {formatLocalDate(currentEvent.start_date)} &ndash;{' '}
                {formatLocalDate(currentEvent.end_date)}
              </p>
            </div>
          ) : (
            <div className="bg-[var(--bg-subtle)] rounded-xl p-3">
              <p className="text-sm text-[var(--text-muted)]">No active event.</p>
            </div>
          )}

          {eventLeaderboard.length === 0 ? (
            <div className="text-center py-8">
              <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-[var(--text-muted)] text-sm">No scores yet for this event.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {eventLeaderboard.map((entry, idx) => {
                const isCurrentUser = entry.userId === profile?.id;
                return (
                  <div
                    key={entry.userId}
                    className={`flex items-center gap-3 bg-[var(--bg-card)] rounded-xl p-3 border ${
                      isCurrentUser ? 'border-minerva-200 bg-minerva-50/30' : 'border-[var(--border-light)]'
                    } shadow-[var(--shadow-sm)]`}
                  >
                    {/* Position */}
                    <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                      {idx === 0 ? (
                        <Medal className="w-6 h-6 text-yellow-500" />
                      ) : idx === 1 ? (
                        <Medal className="w-6 h-6 text-[var(--text-faint)]" />
                      ) : idx === 2 ? (
                        <Medal className="w-6 h-6 text-amber-700" />
                      ) : (
                        <span className="text-sm font-bold text-[var(--text-faint)]">{idx + 1}</span>
                      )}
                    </div>

                    <Avatar
                      src={entry.profilePicture}
                      name={entry.playerName}
                      className="w-8 h-8 bg-[var(--bg-skeleton)] flex-shrink-0"
                      textClassName="text-xs font-bold text-[var(--text-muted)]"
                    />

                    {/* Player Info */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className={`text-sm font-medium truncate ${isCurrentUser ? 'text-minerva-800' : 'text-[var(--text-primary)]'}`}>
                        {entry.playerName}
                        {isCurrentUser && <span className="text-xs text-minerva-600 ml-1">(you)</span>}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] truncate">
                        {entry.courseName} &middot; {entry.teeName}
                      </p>
                      <p className="text-xs text-[var(--text-faint)]">
                        {entry.actualGross ?? '-'} ({(() => {
                          const val = scoringMode === 'net' ? entry.actualNetOverPar : entry.actualScratchOverRating;
                          return val != null ? formatNetScore(val) : '-';
                        })()}) | Thru {entry.isComplete ? 'F' : entry.holesPlayed}
                        {!entry.isComplete && entry.bestGrossScore != null && entry.actualGross !== entry.bestGrossScore && (
                          <span className="text-[10px] text-[var(--text-muted)] opacity-80">
                            {' - '}Projected: {entry.bestGrossScore} ({(() => {
                              const val = scoringMode === 'net' ? entry.bestNetOverPar : entry.scratchOverRating;
                              return val != null ? formatNetScore(val) : '-';
                            })()})
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Score & Points */}
                    <div className="text-right flex-shrink-0">
                      {(() => {
                        const displayNet = scoringMode === 'net'
                          ? (entry.isComplete ? entry.bestNetOverPar : entry.actualNetOverPar) ?? entry.bestNetOverPar
                          : (entry.isComplete ? entry.scratchOverRating : entry.actualScratchOverRating) ?? entry.scratchOverRating;
                        return (
                          <p className={`text-lg font-bold ${
                            displayNet != null
                              ? (displayNet < 0 ? 'text-red-600' : displayNet === 0 ? 'text-green-600' : 'text-[var(--text-primary)]')
                              : 'text-[var(--text-faint)]'
                          }`}>
                            {displayNet != null ? formatNetScore(displayNet) : '-'}
                          </p>
                        );
                      })()}
                      {entry.projectedPoints > 0 && (
                        <p className="text-xs text-yellow-600 font-medium">
                          {formatPoints(entry.projectedPoints)} pts
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Season Standings */}
      {view === 'season' && (
        <>
          <div className="bg-purple-50 rounded-xl p-3 mb-2">
            <p className="text-sm font-medium text-purple-800">
              {currentSeason?.year} Season — {scoringMode === 'net' ? 'Net' : 'Scratch'} Champion Race
            </p>
            <p className="text-xs text-purple-600">
              {seasonEvents.length} events &middot;{' '}
              {currentSeason?.mode.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </p>
          </div>

          {seasonStandings.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-[var(--text-muted)] text-sm">No season data yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {seasonStandings.map((entry, idx) => {
                const isCurrentUser = entry.userId === profile?.id;
                return (
                  <div
                    key={entry.userId}
                    className={`flex items-center gap-3 bg-[var(--bg-card)] rounded-xl p-3 border ${
                      isCurrentUser ? 'border-minerva-200 bg-minerva-50/30' : 'border-[var(--border-light)]'
                    } shadow-[var(--shadow-sm)]`}
                  >
                    <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                      {idx === 0 ? (
                        <Medal className="w-6 h-6 text-yellow-500" />
                      ) : idx === 1 ? (
                        <Medal className="w-6 h-6 text-[var(--text-faint)]" />
                      ) : idx === 2 ? (
                        <Medal className="w-6 h-6 text-amber-700" />
                      ) : (
                        <span className="text-sm font-bold text-[var(--text-faint)]">{idx + 1}</span>
                      )}
                    </div>

                    <Avatar
                      src={entry.profilePicture}
                      name={entry.playerName}
                      className="w-8 h-8 bg-[var(--bg-skeleton)] flex-shrink-0"
                      textClassName="text-xs font-bold text-[var(--text-muted)]"
                    />

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isCurrentUser ? 'text-minerva-800' : 'text-[var(--text-primary)]'}`}>
                        {entry.playerName}
                        {isCurrentUser && <span className="text-xs text-minerva-600 ml-1">(you)</span>}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {entry.eventsPlayed} event{entry.eventsPlayed !== 1 ? 's' : ''} played
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-[var(--text-primary)]">{formatPoints(entry.totalPoints)}</p>
                      <p className="text-xs text-[var(--text-faint)]">pts</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
}
