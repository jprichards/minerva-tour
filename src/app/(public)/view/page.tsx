'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatNetScore, calculateRegularEventPoints, calculateMajorEventPoints } from '@/lib/scoring';
import { Trophy, Medal, Calendar, LogIn } from 'lucide-react';
import type { Event, Score, Season } from '@/types/database';

export default function PublicViewPage() {
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null);
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [eventScores, setEventScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      const { data: seasons } = await supabase
        .from('seasons')
        .select('*')
        .order('year', { ascending: false })
        .limit(1);

      if (!seasons || seasons.length === 0) {
        setLoading(false);
        return;
      }
      setCurrentSeason(seasons[0]);

      const today = new Date().toISOString().split('T')[0];
      let activeEvent: Event | null = null;

      if (seasons[0].current_event_id) {
        const { data: event } = await supabase
          .from('events')
          .select('*')
          .eq('id', seasons[0].current_event_id)
          .single();
        activeEvent = event;
      }

      if (!activeEvent) {
        const { data: events } = await supabase
          .from('events')
          .select('*')
          .eq('season_id', seasons[0].id)
          .lte('start_date', today)
          .gte('end_date', today)
          .limit(1);
        if (events && events.length > 0) activeEvent = events[0];
      }
      setCurrentEvent(activeEvent);

      if (activeEvent) {
        const { data: scores } = await supabase
          .from('scores')
          .select('*, course:courses(course_name, tee_name, par), user:users!user_id(full_name)')
          .eq('event_id', activeEvent.id)
          .eq('is_complete', true);
        setEventScores(scores || []);
      }
      setLoading(false);
    };
    fetchData();
  }, [supabase]);

  const leaderboard = useMemo(() => {
    if (!currentEvent || eventScores.length === 0) return [];

    const byUser: Record<string, Score> = {};
    for (const score of eventScores) {
      const existing = byUser[score.user_id];
      const sNop = score.net_strokes_over_par ?? 999;
      const eNop = existing?.net_strokes_over_par ?? 999;
      if (!existing || sNop < eNop || (sNop === eNop && score.points_awarded != null && existing.points_awarded == null)) {
        byUser[score.user_id] = score;
      }
    }

    const ranked = Object.values(byUser).sort(
      (a, b) => (a.net_strokes_over_par ?? 999) - (b.net_strokes_over_par ?? 999)
    );

    const numP = ranked.length;
    return ranked.map((score, idx) => ({
      ...score,
      projectedPoints: currentEvent.is_major
        ? calculateMajorEventPoints(numP, idx + 1)
        : calculateRegularEventPoints(numP, idx + 1),
    }));
  }, [eventScores, currentEvent]);

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      {/* Header */}
      <div className="bg-gradient-to-br from-minerva-700 to-minerva-900 px-4 py-6 text-white">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Minerva Tour</h1>
            <p className="text-minerva-300 text-sm">
              {currentSeason ? `${currentSeason.year} Season` : 'Golf Club'}
            </p>
          </div>
          <Link
            href="/login"
            className="flex items-center gap-1.5 bg-white/20 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-white/30"
          >
            <LogIn className="w-4 h-4" />
            Sign In
          </Link>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-5">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Current Event */}
            {currentEvent ? (
              <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-minerva-600" />
                  <span className="text-xs font-medium text-minerva-600 uppercase tracking-wide">Current Event</span>
                </div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  {currentEvent.name || `Event ${currentEvent.event_number}`}
                  {currentEvent.is_major && (
                    <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">Major</span>
                  )}
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {currentEvent.holes} holes &middot; {new Date(currentEvent.start_date).toLocaleDateString()} &ndash; {new Date(currentEvent.end_date).toLocaleDateString()}
                </p>
              </div>
            ) : (
              <div className="bg-[var(--bg-subtle)] rounded-xl p-4 text-center">
                <p className="text-[var(--text-muted)] text-sm">No active event right now.</p>
              </div>
            )}

            {/* Leaderboard */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Leaderboard</h2>
              </div>

              {leaderboard.length === 0 ? (
                <p className="text-center text-[var(--text-faint)] text-sm py-6">No scores yet.</p>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((score, idx) => (
                    <div key={score.id} className="flex items-center gap-3 bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)]">
                      <div className="w-7 h-7 flex items-center justify-center">
                        {idx === 0 ? <Medal className="w-5 h-5 text-yellow-500" /> :
                         idx === 1 ? <Medal className="w-5 h-5 text-[var(--text-faint)]" /> :
                         idx === 2 ? <Medal className="w-5 h-5 text-amber-700" /> :
                         <span className="text-sm font-bold text-[var(--text-faint)]">{idx + 1}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{score.user?.full_name || 'Player'}</p>
                        <p className="text-xs text-[var(--text-muted)]">{score.course?.course_name} &middot; {score.holes_played}h</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${
                          (score.net_strokes_over_par ?? 0) < 0 ? 'text-red-600' :
                          (score.net_strokes_over_par ?? 0) === 0 ? 'text-green-600' : 'text-[var(--text-primary)]'
                        }`}>
                          {score.net_strokes_over_par != null ? formatNetScore(score.net_strokes_over_par) : '-'}
                        </p>
                        {score.projectedPoints > 0 && (
                          <p className="text-xs text-yellow-600 font-medium">{score.projectedPoints} pts</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CTA */}
            <div className="text-center py-4">
              <p className="text-sm text-[var(--text-muted)] mb-2">Sign in to submit scores and see more.</p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 bg-minerva-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-minerva-700"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
