'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Trophy, ChevronRight } from 'lucide-react';
import type { Season, User } from '@/types/database';

interface PlayoffBracket {
  id: string;
  season_id: string;
  flight: string;
  round: number;
  matchup_number: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  player1?: User | null;
  player2?: User | null;
}

const FLIGHTS = ['championship', 'consolation', 'unicorn'] as const;
const flightLabels: Record<string, string> = {
  championship: 'Championship',
  consolation: 'Consolation',
  unicorn: 'Unicorn',
};
const flightColors: Record<string, string> = {
  championship: 'bg-yellow-100 text-yellow-700',
  consolation: 'bg-blue-100 text-blue-700',
  unicorn: 'bg-purple-100 text-purple-700',
};

export default function PlayoffsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [brackets, setBrackets] = useState<PlayoffBracket[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<string>('championship');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchSeasons = async () => {
      const { data } = await supabase.from('seasons').select('*').order('year', { ascending: false });
      setSeasons(data || []);
      if (data && data.length > 0) setSelectedSeason(data[0]);
      setLoading(false);
    };
    fetchSeasons();
  }, [supabase]);

  useEffect(() => {
    if (!selectedSeason) return;
    const fetchBrackets = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('playoff_brackets')
        .select('*, player1:users!playoff_brackets_player1_id_fkey(id, full_name, profile_picture_url), player2:users!playoff_brackets_player2_id_fkey(id, full_name, profile_picture_url)')
        .eq('season_id', selectedSeason.id)
        .order('round')
        .order('matchup_number');
      setBrackets((data as PlayoffBracket[]) || []);
      setLoading(false);
    };
    fetchBrackets();
  }, [selectedSeason, supabase]);

  const flightBrackets = brackets.filter((b) => b.flight === selectedFlight);
  const rounds = [...new Set(flightBrackets.map((b) => b.round))].sort();

  const roundLabels: Record<number, string> = {};
  const maxRound = rounds.length > 0 ? Math.max(...rounds) : 0;
  for (const r of rounds) {
    if (r === maxRound) roundLabels[r] = 'Final';
    else if (r === maxRound - 1) roundLabels[r] = 'Semifinal';
    else if (r === maxRound - 2) roundLabels[r] = 'Quarterfinal';
    else roundLabels[r] = `Round ${r}`;
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Playoffs</h1>

      {/* Season Selector */}
      <div className="flex gap-2 overflow-x-auto">
        {seasons.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedSeason(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap ${
              selectedSeason?.id === s.id ? 'bg-minerva-600 text-white' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
            }`}
          >
            {s.year}
          </button>
        ))}
      </div>

      {/* Flight Tabs */}
      <div className="flex gap-2">
        {FLIGHTS.map((f) => {
          const count = brackets.filter((b) => b.flight === f).length;
          return (
            <button
              key={f}
              onClick={() => setSelectedFlight(f)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1 ${
                selectedFlight === f ? flightColors[f] : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
              }`}
            >
              {flightLabels[f]}
              {count > 0 && <span className="text-[10px] opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />)}
        </div>
      ) : flightBrackets.length === 0 ? (
        <div className="text-center py-12">
          <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)]">No playoff brackets yet for {flightLabels[selectedFlight]}.</p>
        </div>
      ) : (
        /* Bracket Tree - scrollable horizontal layout */
        <div className="overflow-x-auto">
          <div className="flex gap-6 min-w-max pb-4">
            {rounds.map((round) => {
              const roundMatchups = flightBrackets.filter((b) => b.round === round);
              return (
                <div key={round} className="flex-shrink-0 w-56">
                  <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3 text-center">
                    {roundLabels[round]}
                  </h3>
                  <div className="space-y-3">
                    {roundMatchups.map((match) => (
                      <div key={match.id} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden">
                        <PlayerSlot
                          player={match.player1}
                          isWinner={match.winner_id !== null && match.winner_id === match.player1_id}
                          isLoser={match.winner_id !== null && match.winner_id !== match.player1_id}
                        />
                        <div className="border-t border-[var(--border-light)]" />
                        <PlayerSlot
                          player={match.player2}
                          isWinner={match.winner_id !== null && match.winner_id === match.player2_id}
                          isLoser={match.winner_id !== null && match.winner_id !== match.player2_id}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerSlot({ player, isWinner, isLoser }: { player?: User | null; isWinner: boolean; isLoser: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 ${isWinner ? 'bg-green-50' : isLoser ? 'bg-[var(--bg-page)] opacity-60' : ''}`}>
      <div className="w-7 h-7 rounded-full bg-[var(--bg-subtle)] flex items-center justify-center overflow-hidden flex-shrink-0">
        {player?.profile_picture_url ? (
          <img src={player.profile_picture_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] font-bold text-[var(--text-muted)]">
            {player?.full_name?.[0]?.toUpperCase() || '?'}
          </span>
        )}
      </div>
      <span className={`text-sm truncate ${isWinner ? 'font-bold text-green-700' : 'font-medium text-[var(--text-secondary)]'}`}>
        {player?.full_name || 'TBD'}
      </span>
      {isWinner && <ChevronRight className="w-4 h-4 text-green-600 ml-auto" />}
    </div>
  );
}
