'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { formatNetScore } from '@/lib/scoring';
import { ArrowLeft, Swords } from 'lucide-react';
import type { Score, User } from '@/types/database';

export default function HeadToHeadPage() {
  const { userId } = useParams();
  const router = useRouter();
  const { profile } = useUser();
  const supabase = createClient();

  const [opponent, setOpponent] = useState<User | null>(null);
  const [myScores, setMyScores] = useState<Score[]>([]);
  const [theirScores, setTheirScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!profile?.id) return;

      const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
      setOpponent(user);

      const { data: mine } = await supabase
        .from('scores')
        .select('*, event:events(id, event_number, name)')
        .eq('user_id', profile.id)
        .eq('is_complete', true)
        .not('net_strokes_over_par', 'is', null)
        .not('event_id', 'is', null);
      setMyScores(mine || []);

      const { data: theirs } = await supabase
        .from('scores')
        .select('*, event:events(id, event_number, name)')
        .eq('user_id', userId)
        .eq('is_complete', true)
        .not('net_strokes_over_par', 'is', null)
        .not('event_id', 'is', null);
      setTheirScores(theirs || []);

      setLoading(false);
    };
    fetchData();
  }, [profile, userId, supabase]);

  const h2h = useMemo(() => {
    if (!profile) return { wins: 0, losses: 0, ties: 0, events: [] as { eventName: string; myNet: number; theirNet: number; result: string }[] };

    // Find events where both played, compare best net
    const myBestByEvent: Record<string, Score> = {};
    for (const s of myScores) {
      if (!s.event_id) continue;
      const existing = myBestByEvent[s.event_id];
      if (!existing || (s.net_strokes_over_par ?? 999) < (existing.net_strokes_over_par ?? 999)) {
        myBestByEvent[s.event_id] = s;
      }
    }
    const theirBestByEvent: Record<string, Score> = {};
    for (const s of theirScores) {
      if (!s.event_id) continue;
      const existing = theirBestByEvent[s.event_id];
      if (!existing || (s.net_strokes_over_par ?? 999) < (existing.net_strokes_over_par ?? 999)) {
        theirBestByEvent[s.event_id] = s;
      }
    }

    let wins = 0, losses = 0, ties = 0;
    const events: { eventName: string; myNet: number; theirNet: number; result: string }[] = [];

    for (const eventId of Object.keys(myBestByEvent)) {
      if (!theirBestByEvent[eventId]) continue;
      const my = myBestByEvent[eventId];
      const their = theirBestByEvent[eventId];
      const myNet = my.net_strokes_over_par!;
      const theirNet = their.net_strokes_over_par!;

      let result: string;
      if (myNet < theirNet) { wins++; result = 'W'; }
      else if (myNet > theirNet) { losses++; result = 'L'; }
      else { ties++; result = 'T'; }

      const eventData = my.event as unknown as { event_number: number; name: string | null };
      events.push({
        eventName: eventData?.name || `Event ${eventData?.event_number}`,
        myNet,
        theirNet,
        result,
      });
    }

    return { wins, losses, ties, events };
  }, [myScores, theirScores, profile]);

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-6 bg-gray-200 rounded animate-pulse w-40" />
        <div className="h-40 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Head to Head</h1>
      </div>

      {/* Matchup Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <p className="text-sm font-semibold text-gray-900">{profile?.full_name?.split(' ')[0] || 'You'}</p>
            <p className="text-3xl font-bold text-emerald-600 mt-1">{h2h.wins}</p>
            <p className="text-xs text-gray-500">wins</p>
          </div>
          <div className="text-center px-4">
            <Swords className="w-6 h-6 text-gray-400 mx-auto" />
            <p className="text-xs text-gray-400 mt-1">{h2h.ties} tie{h2h.ties !== 1 ? 's' : ''}</p>
          </div>
          <div className="text-center flex-1">
            <p className="text-sm font-semibold text-gray-900">{opponent?.full_name?.split(' ')[0] || 'Opponent'}</p>
            <p className="text-3xl font-bold text-red-600 mt-1">{h2h.losses}</p>
            <p className="text-xs text-gray-500">wins</p>
          </div>
        </div>
      </div>

      {/* Event Breakdown */}
      {h2h.events.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-4">No shared events found.</p>
      ) : (
        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-3">Event Breakdown</h3>
          <div className="space-y-2">
            {h2h.events.map((e, idx) => (
              <div key={idx} className="flex items-center justify-between bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                <p className="text-sm text-gray-700">{e.eventName}</p>
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-bold ${e.myNet <= e.theirNet ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {formatNetScore(e.myNet)}
                  </span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    e.result === 'W' ? 'bg-emerald-100 text-emerald-700' :
                    e.result === 'L' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {e.result}
                  </span>
                  <span className={`text-sm font-bold ${e.theirNet <= e.myNet ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {formatNetScore(e.theirNet)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
