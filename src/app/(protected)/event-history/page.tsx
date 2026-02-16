'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { formatNetScore } from '@/lib/scoring';
import { Calendar, ChevronDown, ChevronUp, Trophy, Medal, Download } from 'lucide-react';
import { downloadCSV } from '@/lib/export';
import type { Event, Score, Season } from '@/types/database';

interface EventWithScores extends Event {
  scores: Score[];
}

export default function EventHistoryPage() {
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [pickedSeasonId, setPickedSeasonId] = useState<string | null>(null);
  const supabase = createClient();

  const { data: seasons = [], isLoading: seasonsLoading } = useSWR<Season[]>(
    'event-history-seasons',
    async () => {
      const { data } = await supabase
        .from('seasons')
        .select('*')
        .order('year', { ascending: false });
      return (data || []) as Season[];
    },
    { revalidateOnFocus: true, dedupingInterval: 5000 }
  );

  const selectedSeason = pickedSeasonId
    ? seasons.find((s) => s.id === pickedSeasonId) ?? null
    : seasons[0] ?? null;
  const setSelectedSeason = (s: Season) => setPickedSeasonId(s.id);

  const { data: events = [], isLoading: eventsLoading } = useSWR<EventWithScores[]>(
    selectedSeason ? ['event-history-events', selectedSeason.id] : null,
    async () => {
      const { data: eventsData } = await supabase
        .from('events')
        .select('*')
        .eq('season_id', selectedSeason!.id)
        .order('event_number', { ascending: false });

      if (!eventsData) return [];

      const enriched: EventWithScores[] = [];
      for (const event of eventsData) {
        const { data: scores } = await supabase
          .from('scores')
          .select('*, user:users!user_id(full_name, email), course:courses(course_name, tee_name, par)')
          .eq('event_id', event.id)
          .eq('is_complete', true)
          .order('net_strokes_over_par', { ascending: true });
        enriched.push({ ...event, scores: scores || [] });
      }
      return enriched;
    },
    { revalidateOnFocus: true, dedupingInterval: 5000 }
  );

  const loading = seasonsLoading || eventsLoading;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Event History</h1>
        <button
          onClick={() => {
            const exportData = events.map((e) => ({
              Event: e.event_number,
              Name: e.name || '',
              Start: e.start_date,
              End: e.end_date,
              Holes: e.holes,
              Major: e.is_major ? 'Yes' : 'No',
              Playoff: e.is_playoff ? 'Yes' : 'No',
              Scores: (e as any).scores?.length || 0,
            }));
            downloadCSV(exportData, `event-history-${selectedSeason?.year || 'all'}`);
          }}
          className="p-2 text-[var(--text-faint)] hover:text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] rounded-lg transition-colors"
          title="Export CSV"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Season Selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {seasons.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedSeason(s)}
            className={`text-sm font-medium px-4 py-2 rounded-xl whitespace-nowrap transition-colors ${
              selectedSeason?.id === s.id
                ? 'bg-minerva-600 text-white'
                : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-skeleton)]'
            }`}
          >
            {s.year}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-[var(--text-muted)] text-sm">No events found for this season.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => {
            const isExpanded = expandedEvent === event.id;
            // Group scores by user, best net first
            const byUser: Record<string, Score> = {};
            for (const score of event.scores) {
              const existing = byUser[score.user_id];
              if (!existing || (score.net_strokes_over_par ?? 999) < (existing.net_strokes_over_par ?? 999)) {
                byUser[score.user_id] = score;
              }
            }
            const ranked = Object.values(byUser).sort(
              (a, b) => (a.net_strokes_over_par ?? 999) - (b.net_strokes_over_par ?? 999)
            );

            return (
              <div key={event.id} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden">
                <button
                  onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                  className="w-full p-4 flex items-center justify-between text-left"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--text-primary)]">
                        {event.name || `Event ${event.event_number}`}
                      </span>
                      {event.is_major && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">Major</span>
                      )}
                      {event.is_playoff && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">Playoff</span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {event.holes}h &middot; {new Date(event.start_date).toLocaleDateString()} &ndash; {new Date(event.end_date).toLocaleDateString()}
                      &middot; {ranked.length} player{ranked.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {ranked.length > 0 && (
                      <span className="text-sm font-semibold text-minerva-600">
                        {ranked[0].user?.full_name?.split(' ')[0] || 'Winner'}
                      </span>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-[var(--text-faint)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-faint)]" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-[var(--border-light)] px-4 pb-3">
                    {ranked.length === 0 ? (
                      <p className="text-xs text-[var(--text-faint)] py-3">No completed scores.</p>
                    ) : (
                      <div className="space-y-1 pt-2">
                        {ranked.map((score, idx) => (
                          <div key={score.id} className="flex items-center gap-3 py-1.5">
                            <div className="w-6 text-center">
                              {idx === 0 ? <Medal className="w-4 h-4 text-yellow-500 mx-auto" /> :
                               idx === 1 ? <Medal className="w-4 h-4 text-[var(--text-faint)] mx-auto" /> :
                               idx === 2 ? <Medal className="w-4 h-4 text-amber-700 mx-auto" /> :
                               <span className="text-xs text-[var(--text-faint)]">{idx + 1}</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-[var(--text-primary)] truncate">{score.user?.full_name || score.user?.email}</p>
                              <p className="text-xs text-[var(--text-faint)]">{score.course?.course_name} &middot; {score.holes_played}h</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-sm font-bold ${
                                (score.net_strokes_over_par ?? 0) < 0 ? 'text-red-600' :
                                (score.net_strokes_over_par ?? 0) === 0 ? 'text-green-600' : 'text-[var(--text-primary)]'
                              }`}>
                                {score.net_strokes_over_par != null ? formatNetScore(score.net_strokes_over_par) : '-'}
                              </p>
                              {score.points_awarded != null && (
                                <p className="text-xs text-yellow-600">{score.points_awarded} pts</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
