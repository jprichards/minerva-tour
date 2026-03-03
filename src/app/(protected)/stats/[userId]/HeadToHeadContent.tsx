'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { formatNetScore } from '@/lib/scoring';
import { ArrowLeft, Swords } from 'lucide-react';
import type { Score, User } from '@/types/database';

export default function HeadToHeadContent() {
  const { userId } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { profile } = useUser();
  const supabase = createClient();

  // If ?vs= is provided, use that as Player A instead of the logged-in user
  const vsParam = searchParams.get('vs');
  const isArbitrary = !!vsParam;
  const playerAId = vsParam || profile?.id;

  const [playerA, setPlayerA] = useState<User | null>(null);
  const [playerB, setPlayerB] = useState<User | null>(null);
  const [playerAScores, setPlayerAScores] = useState<Score[]>([]);
  const [playerBScores, setPlayerBScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!playerAId) return;

      // Fetch Player B (the route param)
      const { data: userB } = await supabase.from('users').select('*').eq('id', userId).single();
      setPlayerB(userB);

      // Fetch Player A profile (only needed for arbitrary comparisons; otherwise use logged-in profile)
      if (isArbitrary && vsParam) {
        const { data: userA } = await supabase.from('users').select('*').eq('id', vsParam).single();
        setPlayerA(userA);
      } else {
        setPlayerA(profile as User | null);
      }

      const { data: aScores } = await supabase
        .from('scores')
        .select('*, event:events(id, event_number, name)')
        .eq('user_id', playerAId)
        .eq('is_complete', true)
        .not('net_strokes_over_par', 'is', null)
        .not('event_id', 'is', null);
      setPlayerAScores(aScores || []);

      const { data: bScores } = await supabase
        .from('scores')
        .select('*, event:events(id, event_number, name)')
        .eq('user_id', userId)
        .eq('is_complete', true)
        .not('net_strokes_over_par', 'is', null)
        .not('event_id', 'is', null);
      setPlayerBScores(bScores || []);

      setLoading(false);
    };
    fetchData();
  }, [profile, userId, playerAId, isArbitrary, vsParam, supabase]);

  const h2h = useMemo(() => {
    type H2HEvent = { eventName: string; aNet: number; bNet: number; result: 'A' | 'B' | 'T'; year: number; eventNumber: number };
    if (!playerAId) return { aWins: 0, bWins: 0, ties: 0, eventsByYear: [] as { year: number; events: H2HEvent[] }[] };

    const aBestByEvent: Record<string, Score> = {};
    for (const s of playerAScores) {
      if (!s.event_id) continue;
      const existing = aBestByEvent[s.event_id];
      if (!existing || (s.net_strokes_over_par ?? 999) < (existing.net_strokes_over_par ?? 999)) {
        aBestByEvent[s.event_id] = s;
      }
    }
    const bBestByEvent: Record<string, Score> = {};
    for (const s of playerBScores) {
      if (!s.event_id) continue;
      const existing = bBestByEvent[s.event_id];
      if (!existing || (s.net_strokes_over_par ?? 999) < (existing.net_strokes_over_par ?? 999)) {
        bBestByEvent[s.event_id] = s;
      }
    }

    let aWins = 0, bWins = 0, ties = 0;
    const allEvents: H2HEvent[] = [];

    for (const eventId of Object.keys(aBestByEvent)) {
      if (!bBestByEvent[eventId]) continue;
      const a = aBestByEvent[eventId];
      const b = bBestByEvent[eventId];
      const aNet = a.net_strokes_over_par!;
      const bNet = b.net_strokes_over_par!;

      let result: 'A' | 'B' | 'T';
      if (aNet < bNet) { aWins++; result = 'A'; }
      else if (aNet > bNet) { bWins++; result = 'B'; }
      else { ties++; result = 'T'; }

      const eventData = a.event as unknown as { event_number: number; name: string | null };
      const year = a.tee_time ? new Date(a.tee_time).getUTCFullYear() : new Date(a.created_at).getUTCFullYear();
      allEvents.push({
        eventName: eventData?.name || `Event ${eventData?.event_number}`,
        eventNumber: eventData?.event_number ?? 0,
        aNet,
        bNet,
        result,
        year,
      });
    }

    const yearMap = new Map<number, H2HEvent[]>();
    for (const e of allEvents) {
      if (!yearMap.has(e.year)) yearMap.set(e.year, []);
      yearMap.get(e.year)!.push(e);
    }
    const eventsByYear = [...yearMap.entries()]
      .sort(([a], [b]) => b - a)
      .map(([year, events]) => ({
        year,
        events: events.sort((a, b) => a.eventNumber - b.eventNumber),
      }));

    return { aWins, bWins, ties, eventsByYear };
  }, [playerAScores, playerBScores, playerAId]);

  const playerAName = playerA?.full_name?.split(' ')[0] || (isArbitrary ? 'Player 1' : 'You');
  const playerBName = playerB?.full_name?.split(' ')[0] || 'Opponent';

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-6 bg-[var(--bg-skeleton)] rounded animate-pulse w-40" />
        <div className="h-40 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Head to Head</h1>
      </div>

      {/* Matchup Header */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-5">
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{playerAName}</p>
            <p className="text-3xl font-bold text-minerva-600 mt-1">{h2h.aWins}</p>
            <p className="text-xs text-[var(--text-muted)]">wins</p>
          </div>
          <div className="text-center px-4">
            <Swords className="w-6 h-6 text-[var(--text-faint)] mx-auto" />
            <p className="text-xs text-[var(--text-faint)] mt-1">{h2h.ties} tie{h2h.ties !== 1 ? 's' : ''}</p>
          </div>
          <div className="text-center flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{playerBName}</p>
            <p className="text-3xl font-bold text-red-600 mt-1">{h2h.bWins}</p>
            <p className="text-xs text-[var(--text-muted)]">wins</p>
          </div>
        </div>
      </div>

      {/* Event Breakdown */}
      {h2h.eventsByYear.length === 0 ? (
        <p className="text-center text-[var(--text-faint)] text-sm py-4">No shared events found.</p>
      ) : (
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">Event Breakdown</h3>
          <div className="space-y-5">
            {h2h.eventsByYear.map(({ year, events }) => (
              <div key={year}>
                <h4 className="text-sm font-semibold text-[var(--text-muted)] mb-2">{year} Season</h4>
                <div className="space-y-2">
                  {events.map((e, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)]">
                      <p className="text-sm text-[var(--text-secondary)]">{e.eventName}</p>
                      <div className="flex items-center gap-4">
                        <span className={`text-sm font-bold ${e.aNet <= e.bNet ? 'text-green-600' : 'text-[var(--text-faint)]'}`}>
                          {formatNetScore(e.aNet)}
                        </span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          e.result === 'A' ? 'bg-green-100 text-green-700' :
                          e.result === 'B' ? 'bg-red-100 text-red-700' :
                          'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                        }`}>
                          {e.result === 'A' ? 'W' : e.result === 'B' ? 'L' : 'T'}
                        </span>
                        <span className={`text-sm font-bold ${e.bNet <= e.aNet ? 'text-green-600' : 'text-[var(--text-faint)]'}`}>
                          {formatNetScore(e.bNet)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
