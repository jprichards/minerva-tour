'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { ArrowLeft, Plus, Trash2, Trophy, CheckCircle, Users, Pencil, Check, X } from 'lucide-react';
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

  // Edit matchup state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{ player1_id: string; player2_id: string; winner_id: string }>({ player1_id: '', player2_id: '', winner_id: '' });
  const [saving, setSaving] = useState(false);

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

  const startEditing = (match: PlayoffBracket) => {
    setEditingId(match.id);
    setEditFields({
      player1_id: match.player1_id || '',
      player2_id: match.player2_id || '',
      winner_id: match.winner_id || '',
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditFields({ player1_id: '', player2_id: '', winner_id: '' });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);

    const updateData: Record<string, string | null> = {
      player1_id: editFields.player1_id || null,
      player2_id: editFields.player2_id || null,
      winner_id: editFields.winner_id || null,
    };

    const { error } = await supabase
      .from('playoff_brackets')
      .update(updateData)
      .eq('id', editingId);

    if (error) {
      showToast('Failed to save changes.', 'error');
      setSaving(false);
      return;
    }

    logAuditEvent('update_playoff_matchup', 'playoff_bracket', editingId, updateData);
    showToast('Matchup updated!', 'success');

    // Refresh brackets to get joined player names
    if (selectedSeason) {
      const { data } = await supabase
        .from('playoff_brackets')
        .select('*, player1:users!playoff_brackets_player1_id_fkey(id, full_name), player2:users!playoff_brackets_player2_id_fkey(id, full_name), winner:users!playoff_brackets_winner_id_fkey(id, full_name)')
        .eq('season_id', selectedSeason.id)
        .order('round')
        .order('matchup_number');
      setBrackets((data as PlayoffBracket[]) || []);
    }

    setEditingId(null);
    setEditFields({ player1_id: '', player2_id: '', winner_id: '' });
    setSaving(false);
  };

  if (!isAdmin) {
    return <div className="p-4 text-center text-[var(--text-muted)]">Admin access required.</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Playoff Brackets</h1>
      </div>

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
        {FLIGHTS.map((f) => (
          <button
            key={f}
            onClick={() => setSelectedFlight(f)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg ${
              selectedFlight === f ? 'bg-purple-600 text-white' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
            }`}
          >
            {flightLabels[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* Bracket Display */}
          {rounds.length === 0 ? (
            <div className="text-center py-8">
              <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-[var(--text-muted)]">No brackets yet for {flightLabels[selectedFlight]}.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {rounds.map((round) => {
                const roundMatchups = flightBrackets.filter((b) => b.round === round);
                return (
                  <div key={round}>
                    <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-2">
                      Round {round} ({roundMatchups.length} matchup{roundMatchups.length !== 1 ? 's' : ''})
                    </h3>
                    <div className="space-y-2">
                      {roundMatchups.map((match) => (
                        <div key={match.id} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-3">
                          {editingId === match.id ? (
                            /* Inline edit form */
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <Pencil className="w-3.5 h-3.5 text-minerva-600" />
                                <span className="text-xs font-semibold text-minerva-600">Editing Matchup #{match.matchup_number}</span>
                              </div>
                              <div>
                                <label className="text-xs text-[var(--text-muted)]">Player 1</label>
                                <select
                                  value={editFields.player1_id}
                                  onChange={(e) => setEditFields({ ...editFields, player1_id: e.target.value, winner_id: editFields.winner_id === editFields.player1_id && e.target.value ? e.target.value : editFields.winner_id })}
                                  className="w-full mt-1 px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-sm text-[var(--text-primary)]"
                                >
                                  <option value="">TBD</option>
                                  {members.map((m) => (
                                    <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-[var(--text-muted)]">Player 2</label>
                                <select
                                  value={editFields.player2_id}
                                  onChange={(e) => setEditFields({ ...editFields, player2_id: e.target.value, winner_id: editFields.winner_id === editFields.player2_id && e.target.value ? e.target.value : editFields.winner_id })}
                                  className="w-full mt-1 px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-sm text-[var(--text-primary)]"
                                >
                                  <option value="">TBD</option>
                                  {members.map((m) => (
                                    <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-[var(--text-muted)]">Winner</label>
                                <select
                                  value={editFields.winner_id}
                                  onChange={(e) => setEditFields({ ...editFields, winner_id: e.target.value })}
                                  className="w-full mt-1 px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-sm text-[var(--text-primary)]"
                                >
                                  <option value="">No winner yet</option>
                                  {editFields.player1_id && (
                                    <option value={editFields.player1_id}>
                                      {members.find((m) => m.id === editFields.player1_id)?.full_name || 'Player 1'}
                                    </option>
                                  )}
                                  {editFields.player2_id && (
                                    <option value={editFields.player2_id}>
                                      {members.find((m) => m.id === editFields.player2_id)?.full_name || 'Player 2'}
                                    </option>
                                  )}
                                </select>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={cancelEditing}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[var(--bg-subtle)] text-[var(--text-secondary)] rounded-lg text-sm font-medium"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  Cancel
                                </button>
                                <button
                                  onClick={handleSaveEdit}
                                  disabled={saving}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-minerva-600 text-white rounded-lg text-sm font-medium hover:bg-minerva-700 disabled:opacity-50"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  {saving ? 'Saving...' : 'Save'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Display mode */
                            <div className="flex items-center justify-between">
                              <div className="flex-1 space-y-1.5">
                                {/* Player 1 */}
                                <button
                                  onClick={() => match.player1_id && handleSetWinner(match.id, match.player1_id)}
                                  className={`w-full flex items-center gap-2 p-2 rounded-lg text-left ${
                                    match.winner_id === match.player1_id ? 'bg-minerva-50 border border-minerva-200' : 'hover:bg-[var(--bg-page)]'
                                  }`}
                                >
                                  {match.winner_id === match.player1_id && <CheckCircle className="w-4 h-4 text-minerva-600" />}
                                  <span className="text-sm font-medium text-[var(--text-primary)]">
                                    {match.player1?.full_name || 'TBD'}
                                  </span>
                                </button>
                                <div className="text-center text-xs text-[var(--text-faint)]">vs</div>
                                {/* Player 2 */}
                                <button
                                  onClick={() => match.player2_id && handleSetWinner(match.id, match.player2_id)}
                                  className={`w-full flex items-center gap-2 p-2 rounded-lg text-left ${
                                    match.winner_id === match.player2_id ? 'bg-minerva-50 border border-minerva-200' : 'hover:bg-[var(--bg-page)]'
                                  }`}
                                >
                                  {match.winner_id === match.player2_id && <CheckCircle className="w-4 h-4 text-minerva-600" />}
                                  <span className="text-sm font-medium text-[var(--text-primary)]">
                                    {match.player2?.full_name || 'TBD'}
                                  </span>
                                </button>
                              </div>
                              <div className="flex flex-col gap-1 ml-2">
                                <button
                                  onClick={() => startEditing(match)}
                                  className="p-2 text-[var(--text-muted)] hover:text-minerva-600 hover:bg-minerva-50 rounded-lg"
                                  title="Edit matchup"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteMatchup(match.id)}
                                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                  title="Delete matchup"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
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
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-default)] shadow-[var(--shadow-sm)] p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">New Matchup</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[var(--text-muted)]">Round</label>
                  <input
                    type="number"
                    min={1}
                    value={newRound}
                    onChange={(e) => setNewRound(Number(e.target.value))}
                    className="w-full mt-1 px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)]">Matchup #</label>
                  <input
                    type="number"
                    min={1}
                    value={newMatchup}
                    onChange={(e) => setNewMatchup(Number(e.target.value))}
                    className="w-full mt-1 px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)]">Player 1</label>
                <select
                  value={newPlayer1}
                  onChange={(e) => setNewPlayer1(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm"
                >
                  <option value="">TBD</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)]">Player 2</label>
                <select
                  value={newPlayer2}
                  onChange={(e) => setNewPlayer2(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm"
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
                  className="flex-1 py-2 bg-[var(--bg-subtle)] text-[var(--text-secondary)] rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddMatchup}
                  className="flex-1 py-2 bg-minerva-600 text-white rounded-lg text-sm font-medium hover:bg-minerva-700"
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingMatchup(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed bg-[var(--input-bg)] border-[var(--input-border)] rounded-xl text-sm text-[var(--text-muted)] hover:border-minerva-400 hover:text-minerva-600 transition-colors"
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
