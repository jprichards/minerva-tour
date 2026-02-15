'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { ArrowLeft, Plus, Trash2, Trophy, CheckCircle, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
  event_id: string | null;
  player1?: User | null;
  player2?: User | null;
  winner?: User | null;
}

const FLIGHTS = ['championship', 'consolation', 'unicorn'] as const;
const flightLabels: Record<string, string> = {
  championship: 'Championship',
  consolation: 'Consolation',
  unicorn: 'Unicorn',
};

export default function PlayoffsAdminPage() {
  const router = useRouter();
  const { isAdmin } = useUser();
  const { showToast } = useToast();
  const supabase = createClient();

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [brackets, setBrackets] = useState<PlayoffBracket[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<string>('championship');
  const [loading, setLoading] = useState(true);

  // New matchup form
  const [addingMatchup, setAddingMatchup] = useState(false);
  const [newRound, setNewRound] = useState(1);
  const [newMatchup, setNewMatchup] = useState(1);
  const [newPlayer1, setNewPlayer1] = useState('');
  const [newPlayer2, setNewPlayer2] = useState('');

  useEffect(() => {
    const fetchSeasons = async () => {
      const { data } = await supabase.from('seasons').select('*').order('year', { ascending: false });
      setSeasons(data || []);
      if (data && data.length > 0) setSelectedSeason(data[0]);

      const { data: memberData } = await supabase
        .from('users')
        .select('*')
        .in('role', ['admin', 'member'])
        .order('full_name');
      setMembers(memberData || []);
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
        .select('*, player1:users!playoff_brackets_player1_id_fkey(id, full_name), player2:users!playoff_brackets_player2_id_fkey(id, full_name), winner:users!playoff_brackets_winner_id_fkey(id, full_name)')
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

  const handleAddMatchup = async () => {
    if (!selectedSeason) return;

    const { error } = await supabase.from('playoff_brackets').insert({
      season_id: selectedSeason.id,
      flight: selectedFlight,
      round: newRound,
      matchup_number: newMatchup,
      player1_id: newPlayer1 || null,
      player2_id: newPlayer2 || null,
    });

    if (error) {
      showToast('Failed to add matchup.', 'error');
      return;
    }

    logAuditEvent('create_playoff_matchup', 'playoff_bracket', undefined, { flight: selectedFlight, round: newRound, matchup_number: newMatchup });

    showToast('Matchup added!', 'success');
    setAddingMatchup(false);
    setNewPlayer1('');
    setNewPlayer2('');

    // Refresh
    const { data } = await supabase
      .from('playoff_brackets')
      .select('*, player1:users!playoff_brackets_player1_id_fkey(id, full_name), player2:users!playoff_brackets_player2_id_fkey(id, full_name), winner:users!playoff_brackets_winner_id_fkey(id, full_name)')
      .eq('season_id', selectedSeason.id)
      .order('round')
      .order('matchup_number');
    setBrackets((data as PlayoffBracket[]) || []);
  };

  const handleSetWinner = async (bracketId: string, winnerId: string) => {
    const { error } = await supabase
      .from('playoff_brackets')
      .update({ winner_id: winnerId })
      .eq('id', bracketId);

    if (error) {
      showToast('Failed to set winner.', 'error');
      return;
    }

    logAuditEvent('set_playoff_winner', 'playoff_bracket', bracketId, { winner_id: winnerId });

    showToast('Winner set!', 'success');
    setBrackets((prev) =>
      prev.map((b) =>
        b.id === bracketId ? { ...b, winner_id: winnerId } : b
      )
    );
  };

  const handleDeleteMatchup = async (id: string) => {
    if (!confirm('Delete this matchup?')) return;
    await supabase.from('playoff_brackets').delete().eq('id', id);
    setBrackets((prev) => prev.filter((b) => b.id !== id));
    showToast('Matchup deleted.', 'success');
  };

  if (!isAdmin) {
    return <div className="p-4 text-center text-gray-500">Admin access required.</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Playoff Brackets</h1>
      </div>

      {/* Season Selector */}
      <div className="flex gap-2 overflow-x-auto">
        {seasons.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedSeason(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap ${
              selectedSeason?.id === s.id ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {s.year}
          </button>
        ))}
      </div>

      {/* Flight Tabs */}
      <div className="flex gap-2">
        {FLIGHTS.map((f) => (
          <button
            key={f}
            onClick={() => setSelectedFlight(f)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg ${
              selectedFlight === f ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {flightLabels[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* Bracket Display */}
          {rounds.length === 0 ? (
            <div className="text-center py-8">
              <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No brackets yet for {flightLabels[selectedFlight]}.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {rounds.map((round) => {
                const roundMatchups = flightBrackets.filter((b) => b.round === round);
                return (
                  <div key={round}>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      Round {round} ({roundMatchups.length} matchup{roundMatchups.length !== 1 ? 's' : ''})
                    </h3>
                    <div className="space-y-2">
                      {roundMatchups.map((match) => (
                        <div key={match.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 space-y-1.5">
                              {/* Player 1 */}
                              <button
                                onClick={() => match.player1_id && handleSetWinner(match.id, match.player1_id)}
                                className={`w-full flex items-center gap-2 p-2 rounded-lg text-left ${
                                  match.winner_id === match.player1_id ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-gray-50'
                                }`}
                              >
                                {match.winner_id === match.player1_id && <CheckCircle className="w-4 h-4 text-emerald-600" />}
                                <span className="text-sm font-medium text-gray-900">
                                  {match.player1?.full_name || 'TBD'}
                                </span>
                              </button>
                              <div className="text-center text-xs text-gray-400">vs</div>
                              {/* Player 2 */}
                              <button
                                onClick={() => match.player2_id && handleSetWinner(match.id, match.player2_id)}
                                className={`w-full flex items-center gap-2 p-2 rounded-lg text-left ${
                                  match.winner_id === match.player2_id ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-gray-50'
                                }`}
                              >
                                {match.winner_id === match.player2_id && <CheckCircle className="w-4 h-4 text-emerald-600" />}
                                <span className="text-sm font-medium text-gray-900">
                                  {match.player2?.full_name || 'TBD'}
                                </span>
                              </button>
                            </div>
                            <button
                              onClick={() => handleDeleteMatchup(match.id)}
                              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg ml-2"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Matchup */}
          {addingMatchup ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">New Matchup</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Round</label>
                  <input
                    type="number"
                    min={1}
                    value={newRound}
                    onChange={(e) => setNewRound(Number(e.target.value))}
                    className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Matchup #</label>
                  <input
                    type="number"
                    min={1}
                    value={newMatchup}
                    onChange={(e) => setNewMatchup(Number(e.target.value))}
                    className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Player 1</label>
                <select
                  value={newPlayer1}
                  onChange={(e) => setNewPlayer1(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">TBD</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Player 2</label>
                <select
                  value={newPlayer2}
                  onChange={(e) => setNewPlayer2(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">TBD</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setAddingMatchup(false)}
                  className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddMatchup}
                  className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingMatchup(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Matchup
            </button>
          )}
        </>
      )}
    </div>
  );
}
