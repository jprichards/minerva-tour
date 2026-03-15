'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatNetScore } from '@/lib/scoring';
import { Trophy, Medal, Target, Calendar, Users } from 'lucide-react';
import type { Tournament, Score } from '@/types/database';
import { parseLocalDate, formatLocalDate } from '@/lib/date-utils';

export default function TournamentPage() {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      // Find active tournament
      const { data: tourns } = await supabase
        .from('tournaments')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!tourns || tourns.length === 0) {
        // Also try to get most recent tournament
        const { data: recent } = await supabase
          .from('tournaments')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1);
        if (recent && recent.length > 0) setTournament(recent[0]);
        setLoading(false);
        return;
      }

      const activeTournament = tourns[0];
      setTournament(activeTournament);

      // Fetch tournament scores (scores with is_tournament_round = true in the date range)
      const { data: tournScores } = await supabase
        .from('scores')
        .select('*, course:courses(course_name, tee_name, par), user:users!user_id(full_name, email, handicap_index)')
        .eq('is_tournament_round', true)
        .eq('is_complete', true)
        .gte('created_at', activeTournament.start_date)
        .lte('created_at', activeTournament.end_date + 'T23:59:59');

      setScores(tournScores || []);
      setLoading(false);
    };
    fetchData();
  }, [supabase]);

  // Build tournament leaderboard
  const leaderboard = useMemo(() => {
    if (scores.length === 0) return [];

    // Group by user, sum all tournament rounds
    const byUser: Record<string, {
      name: string;
      rounds: Score[];
      totalGross: number;
      totalNet: number;
      holesPlayed: number;
    }> = {};

    for (const score of scores) {
      if (!byUser[score.user_id]) {
        byUser[score.user_id] = {
          name: score.user?.full_name || score.user?.email || 'Unknown',
          rounds: [],
          totalGross: 0,
          totalNet: 0,
          holesPlayed: 0,
        };
      }
      byUser[score.user_id].rounds.push(score);
      byUser[score.user_id].totalGross += score.gross_score || 0;
      byUser[score.user_id].totalNet += score.net_strokes_over_par ?? 0;
      byUser[score.user_id].holesPlayed += score.holes_played || 0;
    }

    return Object.entries(byUser)
      .map(([userId, data]) => ({
        userId,
        name: data.name,
        rounds: data.rounds.length,
        totalGross: data.totalGross,
        totalNet: data.totalNet,
        holesPlayed: data.holesPlayed,
      }))
      .sort((a, b) => a.totalNet - b.totalNet);
  }, [scores]);

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 bg-[var(--bg-skeleton)] rounded-lg animate-pulse w-48" />
        <div className="h-40 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      {/* Tournament Header */}
      {tournament ? (
        <div className="bg-gradient-to-br from-amber-600 to-amber-800 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-5 h-5 text-amber-300" />
            <span className="text-xs font-medium text-amber-200 uppercase tracking-wide">
              {tournament.is_active ? 'Active Tournament' : 'Tournament'}
            </span>
          </div>
          <h1 className="text-xl font-bold">{tournament.name}</h1>
          <p className="text-amber-200 text-sm mt-1">
            {tournament.format?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Stroke Play'}
            &middot; {formatLocalDate(tournament.start_date)} &ndash; {formatLocalDate(tournament.end_date)}
          </p>
          {tournament.is_active && (
            <Link
              href="/scores/add"
              className="inline-block mt-3 bg-white/20 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-white/30"
            >
              Submit Tournament Score
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-[var(--bg-subtle)] rounded-2xl p-5 text-center">
          <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p className="text-[var(--text-muted)] text-sm">No tournament found.</p>
        </div>
      )}

      {/* Tournament Stats */}
      {scores.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)] text-center">
            <Users className="w-4 h-4 text-blue-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-[var(--text-primary)]">{leaderboard.length}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Players</p>
          </div>
          <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)] text-center">
            <Target className="w-4 h-4 text-minerva-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-[var(--text-primary)]">{scores.length}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Rounds</p>
          </div>
          <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)] text-center">
            <Calendar className="w-4 h-4 text-amber-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-[var(--text-primary)]">
              {tournament ? Math.ceil((parseLocalDate(tournament.end_date).getTime() - parseLocalDate(tournament.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1 : 0}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">Days</p>
          </div>
        </div>
      )}

      {/* Tournament Leaderboard */}
      <div>
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-3">Tournament Leaderboard</h2>

        {leaderboard.length === 0 ? (
          <p className="text-center text-[var(--text-faint)] text-sm py-6">No tournament scores yet.</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((player, idx) => (
              <div key={player.userId} className="flex items-center gap-3 bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)]">
                <div className="w-7 h-7 flex items-center justify-center">
                  {idx === 0 ? <Medal className="w-5 h-5 text-yellow-500" /> :
                   idx === 1 ? <Medal className="w-5 h-5 text-[var(--text-faint)]" /> :
                   idx === 2 ? <Medal className="w-5 h-5 text-amber-700" /> :
                   <span className="text-sm font-bold text-[var(--text-faint)]">{idx + 1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{player.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {player.rounds} round{player.rounds !== 1 ? 's' : ''} &middot; {player.holesPlayed}h
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${
                    player.totalNet < 0 ? 'text-red-600' :
                    player.totalNet === 0 ? 'text-minerva-600' : 'text-[var(--text-primary)]'
                  }`}>
                    {formatNetScore(player.totalNet)}
                  </p>
                  <p className="text-xs text-[var(--text-faint)]">Gross: {player.totalGross}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
