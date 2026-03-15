'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Trophy, ChevronRight } from 'lucide-react';
import Avatar from '@/components/Avatar';
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
  player1_result: string | null;
  player2_result: string | null;
  player1?: User | null;
  player2?: User | null;
}

interface PlayoffSeed {
  id: string;
  season_id: string;
  user_id: string;
  seed_number: number;
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
  const [seeds, setSeeds] = useState<PlayoffSeed[]>([]);
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
    const fetchData = async () => {
      setLoading(true);

      const { data: bracketData } = await supabase
        .from('playoff_brackets')
        .select('*, player1:users!playoff_brackets_player1_id_fkey(id, full_name, profile_picture_url), player2:users!playoff_brackets_player2_id_fkey(id, full_name, profile_picture_url)')
        .eq('season_id', selectedSeason.id)
        .order('round')
        .order('matchup_number');
      const fetchedBrackets = (bracketData as PlayoffBracket[]) || [];
      setBrackets(fetchedBrackets);

      const availableFlights = FLIGHTS.filter((f) => fetchedBrackets.some((b) => b.flight === f));
      if (availableFlights.length > 0 && !availableFlights.includes(selectedFlight as typeof FLIGHTS[number])) {
        setSelectedFlight(availableFlights[0]);
      }

      const { data: seedData } = await supabase
        .from('playoff_seeds')
        .select('*')
        .eq('season_id', selectedSeason.id)
        .order('seed_number');
      setSeeds((seedData as PlayoffSeed[]) || []);

      setLoading(false);
    };
    fetchData();
  }, [selectedSeason, supabase]);

  const seedMap = new Map<string, number>();
  seeds.forEach((s) => seedMap.set(s.user_id, s.seed_number));

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

      {/* Flight Tabs — only show flights that have bracket data */}
      <div className="flex gap-2">
        {FLIGHTS.filter((f) => brackets.some((b) => b.flight === f)).map((f) => {
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
              <span className="text-[10px] opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Unicorn reverse bracket banner */}
      {selectedFlight === 'unicorn' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-xl text-sm text-purple-700">
          <span className="text-base">🦄</span>
          <span>Reverse bracket — the <strong>loser</strong> of each matchup advances. The last player standing is crowned the Unicorn.</span>
        </div>
      )}

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
        /* Bracket - vertical on mobile, horizontal on wider screens */
        <div className="space-y-4">
          {rounds.map((round) => {
            const roundMatchups = flightBrackets.filter((b) => b.round === round);
            return (
              <div key={round}>
                <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                  {roundLabels[round]}
                  <span className="ml-1.5 normal-case tracking-normal opacity-60">
                    ({roundMatchups.length} matchup{roundMatchups.length !== 1 ? 's' : ''})
                  </span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {roundMatchups.map((match) => {
                    const isBye = match.player1_id && !match.player2_id;
                    return (
                      <div key={match.id} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden">
                        <PlayerSlot
                          player={match.player1}
                          seed={match.player1_id ? seedMap.get(match.player1_id) : undefined}
                          result={match.player1_result}
                          isWinner={match.winner_id !== null && match.winner_id === match.player1_id}
                          isLoser={match.winner_id !== null && match.winner_id !== match.player1_id}
                        />
                        <div className="border-t border-[var(--border-light)]" />
                        {isBye ? (
                          <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--bg-page)] opacity-50">
                            <div className="w-7 h-7 rounded-full bg-[var(--bg-subtle)] flex items-center justify-center flex-shrink-0">
                              <span className="text-[10px] font-bold text-[var(--text-faint)]">-</span>
                            </div>
                            <span className="text-sm italic text-[var(--text-faint)]">BYE</span>
                          </div>
                        ) : (
                          <PlayerSlot
                            player={match.player2}
                            seed={match.player2_id ? seedMap.get(match.player2_id) : undefined}
                            result={match.player2_result}
                            isWinner={match.winner_id !== null && match.winner_id === match.player2_id}
                            isLoser={match.winner_id !== null && match.winner_id !== match.player2_id}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlayerSlot({ player, seed, result, isWinner, isLoser }: {
  player?: User | null;
  seed?: number;
  result?: string | null;
  isWinner: boolean;
  isLoser: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 ${isWinner ? 'bg-green-50' : isLoser ? 'bg-[var(--bg-page)] opacity-60' : ''}`}>
      {seed !== undefined && (
        <span className="text-[10px] font-bold text-minerva-600 bg-minerva-50 border border-minerva-200 px-1 py-0.5 rounded flex-shrink-0">
          #{seed}
        </span>
      )}
      <Avatar
        src={player?.profile_picture_url}
        name={player?.full_name}
        className="w-7 h-7 bg-[var(--bg-subtle)] flex-shrink-0"
        textClassName="text-[10px] font-bold text-[var(--text-muted)]"
      />
      <span className={`text-sm truncate ${isWinner ? 'font-bold text-green-700' : 'font-medium text-[var(--text-secondary)]'}`}>
        {player?.full_name || 'TBD'}
      </span>
      {result && (
        <span className={`text-xs font-semibold ml-auto flex-shrink-0 ${
          isWinner ? 'text-green-600' : 'text-[var(--text-faint)]'
        }`}>
          {result}
        </span>
      )}
      {isWinner && !result && <ChevronRight className="w-4 h-4 text-green-600 ml-auto flex-shrink-0" />}
    </div>
  );
}
