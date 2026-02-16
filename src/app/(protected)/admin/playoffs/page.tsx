'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { ArrowLeft, Plus, Trash2, Trophy, CheckCircle, Pencil, Check, X, ChevronDown, ChevronUp, Hash } from 'lucide-react';
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
  player1_result: string | null;
  player2_result: string | null;
  event_id: string | null;
  player1?: User | null;
  player2?: User | null;
  winner?: User | null;
}

interface PlayoffSeed {
  id: string;
  season_id: string;
  user_id: string;
  seed_number: number;
  user?: User | null;
}

const FLIGHTS = ['championship', 'consolation', 'unicorn'] as const;
const flightLabels: Record<string, string> = {
  championship: 'Championship',
  consolation: 'Consolation',
  unicorn: 'Unicorn',
};

function getFlightForSeed(seed: number): string {
  if (seed <= 6) return 'championship';
  if (seed <= 12) return 'consolation';
  return 'unicorn';
}

function getFlightLabel(seed: number): string {
  return flightLabels[getFlightForSeed(seed)] || 'Unicorn';
}

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

  // Seeds state
  const [seeds, setSeeds] = useState<PlayoffSeed[]>([]);
  const [showSeeds, setShowSeeds] = useState(false);
  const [seedEntries, setSeedEntries] = useState<{ seed_number: number; user_id: string }[]>([]);
  const [savingSeeds, setSavingSeeds] = useState(false);

  // New matchup form
  const [addingMatchup, setAddingMatchup] = useState(false);
  const [newRound, setNewRound] = useState(1);
  const [newMatchup, setNewMatchup] = useState(1);
  const [newPlayer1, setNewPlayer1] = useState('');
  const [newPlayer2, setNewPlayer2] = useState('');
  const [newP1Result, setNewP1Result] = useState('');
  const [newP2Result, setNewP2Result] = useState('');

  // Edit matchup state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{
    player1_id: string; player2_id: string; winner_id: string;
    player1_result: string; player2_result: string;
  }>({ player1_id: '', player2_id: '', winner_id: '', player1_result: '', player2_result: '' });
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
    const fetchData = async () => {
      setLoading(true);
      const [bracketsRes, seedsRes] = await Promise.all([
        supabase
          .from('playoff_brackets')
          .select('*, player1:users!playoff_brackets_player1_id_fkey(id, full_name), player2:users!playoff_brackets_player2_id_fkey(id, full_name), winner:users!playoff_brackets_winner_id_fkey(id, full_name)')
          .eq('season_id', selectedSeason.id)
          .order('round')
          .order('matchup_number'),
        supabase
          .from('playoff_seeds')
          .select('*, user:users(id, full_name)')
          .eq('season_id', selectedSeason.id)
          .order('seed_number'),
      ]);
      setBrackets((bracketsRes.data as PlayoffBracket[]) || []);
      const seedData = (seedsRes.data as PlayoffSeed[]) || [];
      setSeeds(seedData);
      setSeedEntries(seedData.map((s) => ({ seed_number: s.seed_number, user_id: s.user_id })));
      setLoading(false);
    };
    fetchData();
  }, [selectedSeason, supabase]);

  const refreshBrackets = async () => {
    if (!selectedSeason) return;
    const { data } = await supabase
      .from('playoff_brackets')
      .select('*, player1:users!playoff_brackets_player1_id_fkey(id, full_name), player2:users!playoff_brackets_player2_id_fkey(id, full_name), winner:users!playoff_brackets_winner_id_fkey(id, full_name)')
      .eq('season_id', selectedSeason.id)
      .order('round')
      .order('matchup_number');
    setBrackets((data as PlayoffBracket[]) || []);
  };

  const seedMap = new Map<string, number>();
  seeds.forEach((s) => seedMap.set(s.user_id, s.seed_number));

  const flightBrackets = brackets.filter((b) => b.flight === selectedFlight);
  const rounds = [...new Set(flightBrackets.map((b) => b.round))].sort();

  // --- Seed Management ---
  const handleAddSeedSlot = () => {
    const nextNum = seedEntries.length > 0 ? Math.max(...seedEntries.map((s) => s.seed_number)) + 1 : 1;
    setSeedEntries([...seedEntries, { seed_number: nextNum, user_id: '' }]);
  };

  const handleRemoveSeedSlot = (idx: number) => {
    const updated = seedEntries.filter((_, i) => i !== idx);
    setSeedEntries(updated.map((s, i) => ({ ...s, seed_number: i + 1 })));
  };

  const handleSeedChange = (idx: number, userId: string) => {
    const updated = [...seedEntries];
    updated[idx] = { ...updated[idx], user_id: userId };
    setSeedEntries(updated);
  };

  const handleSaveSeeds = async () => {
    if (!selectedSeason) return;
    setSavingSeeds(true);

    // Delete existing seeds for this season
    await supabase.from('playoff_seeds').delete().eq('season_id', selectedSeason.id);

    // Insert new seeds (only those with a user selected)
    const toInsert = seedEntries
      .filter((s) => s.user_id)
      .map((s) => ({
        season_id: selectedSeason.id,
        user_id: s.user_id,
        seed_number: s.seed_number,
      }));

    if (toInsert.length > 0) {
      const { error } = await supabase.from('playoff_seeds').insert(toInsert);
      if (error) {
        showToast(`Error saving seeds: ${error.message}`, 'error');
        setSavingSeeds(false);
        return;
      }
    }

    logAuditEvent('manage_playoff_seeds', 'playoff_seeds', undefined, { season_id: selectedSeason.id, count: toInsert.length });
    showToast(`Saved ${toInsert.length} seed${toInsert.length !== 1 ? 's' : ''}!`, 'success');

    // Refresh seeds
    const { data: seedData } = await supabase
      .from('playoff_seeds')
      .select('*, user:users(id, full_name)')
      .eq('season_id', selectedSeason.id)
      .order('seed_number');
    const refreshedSeeds = (seedData as PlayoffSeed[]) || [];
    setSeeds(refreshedSeeds);
    setSeedEntries(refreshedSeeds.map((s) => ({ seed_number: s.seed_number, user_id: s.user_id })));
    setSavingSeeds(false);
  };

  // --- Matchup CRUD ---
  const handleAddMatchup = async () => {
    if (!selectedSeason) return;

    const { error } = await supabase.from('playoff_brackets').insert({
      season_id: selectedSeason.id,
      flight: selectedFlight,
      round: newRound,
      matchup_number: newMatchup,
      player1_id: newPlayer1 || null,
      player2_id: newPlayer2 || null,
      player1_result: newP1Result.trim() || null,
      player2_result: newP2Result.trim() || null,
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
    setNewP1Result('');
    setNewP2Result('');
    await refreshBrackets();
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
      prev.map((b) => b.id === bracketId ? { ...b, winner_id: winnerId } : b)
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
      player1_result: match.player1_result || '',
      player2_result: match.player2_result || '',
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditFields({ player1_id: '', player2_id: '', winner_id: '', player1_result: '', player2_result: '' });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);

    const updateData: Record<string, string | null> = {
      player1_id: editFields.player1_id || null,
      player2_id: editFields.player2_id || null,
      winner_id: editFields.winner_id || null,
      player1_result: editFields.player1_result.trim() || null,
      player2_result: editFields.player2_result.trim() || null,
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
    await refreshBrackets();
    setEditingId(null);
    setEditFields({ player1_id: '', player2_id: '', winner_id: '', player1_result: '', player2_result: '' });
    setSaving(false);
  };

  const getSeedBadge = (playerId: string | null) => {
    if (!playerId) return null;
    const seed = seedMap.get(playerId);
    if (seed === undefined) return null;
    return seed;
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

      {/* Manage Seeds Toggle */}
      <button
        onClick={() => setShowSeeds(!showSeeds)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-[var(--bg-card)] border border-[var(--border-light)] rounded-xl text-sm font-medium text-[var(--text-primary)]"
      >
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-minerva-600" />
          Manage Seeds ({seeds.length} seeded)
        </div>
        {showSeeds ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
      </button>

      {/* Seeds Panel */}
      {showSeeds && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-light)] rounded-xl p-4 space-y-3">
          <p className="text-xs text-[var(--text-faint)]">
            Seeds 1-6 = Championship, 7-12 = Consolation, 13+ = Unicorn. Top 2 seeds per flight get a bye.
          </p>

          {seedEntries.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-4">No seeds assigned yet.</p>
          ) : (
            <div className="space-y-1.5">
              {seedEntries.map((entry, idx) => {
                const flightGroup = getFlightForSeed(entry.seed_number);
                const prevFlightGroup = idx > 0 ? getFlightForSeed(seedEntries[idx - 1].seed_number) : null;
                const showDivider = idx > 0 && flightGroup !== prevFlightGroup;
                const isBye = entry.seed_number <= 2 || (entry.seed_number >= 7 && entry.seed_number <= 8);

                return (
                  <div key={idx}>
                    {showDivider && (
                      <div className="flex items-center gap-2 pt-2 pb-1">
                        <div className="flex-1 border-t border-[var(--border-light)]" />
                        <span className="text-[10px] font-semibold text-[var(--text-faint)] uppercase">{getFlightLabel(entry.seed_number)}</span>
                        <div className="flex-1 border-t border-[var(--border-light)]" />
                      </div>
                    )}
                    {idx === 0 && (
                      <div className="flex items-center gap-2 pb-1">
                        <div className="flex-1 border-t border-[var(--border-light)]" />
                        <span className="text-[10px] font-semibold text-[var(--text-faint)] uppercase">{getFlightLabel(entry.seed_number)}</span>
                        <div className="flex-1 border-t border-[var(--border-light)]" />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="w-7 text-center text-xs font-bold text-[var(--text-secondary)]">#{entry.seed_number}</span>
                      <select
                        value={entry.user_id}
                        onChange={(e) => handleSeedChange(idx, e.target.value)}
                        className="flex-1 px-2 py-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-sm text-[var(--text-primary)]"
                      >
                        <option value="">-- Select --</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                        ))}
                      </select>
                      {isBye && <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">BYE</span>}
                      <button
                        onClick={() => handleRemoveSeedSlot(idx)}
                        className="p-1 text-red-400 hover:text-red-600 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleAddSeedSlot}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-dashed border-[var(--input-border)] rounded-lg text-xs text-[var(--text-muted)] hover:border-minerva-400 hover:text-minerva-600 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Seed
            </button>
            <button
              onClick={handleSaveSeeds}
              disabled={savingSeeds}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-minerva-600 text-white rounded-lg text-xs font-medium hover:bg-minerva-700 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {savingSeeds ? 'Saving...' : 'Save Seeds'}
            </button>
          </div>
        </div>
      )}

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
                                  onChange={(e) => setEditFields({ ...editFields, player1_id: e.target.value })}
                                  className="w-full mt-1 px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-sm text-[var(--text-primary)]"
                                >
                                  <option value="">TBD</option>
                                  {members.map((m) => (
                                    <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-[var(--text-muted)]">P1 Result</label>
                                <input
                                  type="text"
                                  value={editFields.player1_result}
                                  onChange={(e) => setEditFields({ ...editFields, player1_result: e.target.value })}
                                  placeholder="e.g. -1, 1UP, DNP"
                                  className="w-full mt-1 px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-sm text-[var(--text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-[var(--text-muted)]">Player 2</label>
                                <select
                                  value={editFields.player2_id}
                                  onChange={(e) => setEditFields({ ...editFields, player2_id: e.target.value })}
                                  className="w-full mt-1 px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-sm text-[var(--text-primary)]"
                                >
                                  <option value="">TBD</option>
                                  {members.map((m) => (
                                    <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-[var(--text-muted)]">P2 Result</label>
                                <input
                                  type="text"
                                  value={editFields.player2_result}
                                  onChange={(e) => setEditFields({ ...editFields, player2_result: e.target.value })}
                                  placeholder="e.g. +3, 1DN, DNP"
                                  className="w-full mt-1 px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-sm text-[var(--text-primary)]"
                                />
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
                                  {match.winner_id === match.player1_id && <CheckCircle className="w-4 h-4 text-minerva-600 flex-shrink-0" />}
                                  {getSeedBadge(match.player1_id) !== null && (
                                    <span className="text-[10px] font-bold text-minerva-600 bg-minerva-50 border border-minerva-200 px-1 py-0.5 rounded flex-shrink-0">
                                      #{getSeedBadge(match.player1_id)}
                                    </span>
                                  )}
                                  <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                                    {match.player1?.full_name || 'TBD'}
                                  </span>
                                  {match.player1_result && (
                                    <span className={`text-xs font-semibold ml-auto flex-shrink-0 ${
                                      match.winner_id === match.player1_id ? 'text-green-600' : 'text-[var(--text-faint)]'
                                    }`}>
                                      {match.player1_result}
                                    </span>
                                  )}
                                </button>
                                <div className="text-center text-xs text-[var(--text-faint)]">vs</div>
                                {/* Player 2 */}
                                <button
                                  onClick={() => match.player2_id && handleSetWinner(match.id, match.player2_id)}
                                  className={`w-full flex items-center gap-2 p-2 rounded-lg text-left ${
                                    match.winner_id === match.player2_id ? 'bg-minerva-50 border border-minerva-200' : 'hover:bg-[var(--bg-page)]'
                                  }`}
                                >
                                  {match.winner_id === match.player2_id && <CheckCircle className="w-4 h-4 text-minerva-600 flex-shrink-0" />}
                                  {getSeedBadge(match.player2_id) !== null && (
                                    <span className="text-[10px] font-bold text-minerva-600 bg-minerva-50 border border-minerva-200 px-1 py-0.5 rounded flex-shrink-0">
                                      #{getSeedBadge(match.player2_id)}
                                    </span>
                                  )}
                                  <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                                    {!match.player2_id && match.player1_id ? (
                                      <span className="italic text-[var(--text-faint)]">BYE</span>
                                    ) : (
                                      match.player2?.full_name || 'TBD'
                                    )}
                                  </span>
                                  {match.player2_result && (
                                    <span className={`text-xs font-semibold ml-auto flex-shrink-0 ${
                                      match.winner_id === match.player2_id ? 'text-green-600' : 'text-[var(--text-faint)]'
                                    }`}>
                                      {match.player2_result}
                                    </span>
                                  )}
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
          {addingMatchup ? (() => {
            const roundLabels: Record<number, string> = { 1: 'Round 1', 2: 'Round 2 (Semifinal)', 3: 'Round 3 (Final)' };
            const maxMatchupsPerRound: Record<number, number> = { 1: 3, 2: 2, 3: 1 };
            const existingMatchupsInRound = flightBrackets.filter((b) => b.round === newRound).map((b) => b.matchup_number);
            const maxForRound = maxMatchupsPerRound[newRound] || 3;
            const availableMatchups = Array.from({ length: maxForRound }, (_, i) => i + 1).filter((n) => !existingMatchupsInRound.includes(n));
            const isFinal = newRound === 3;

            return (
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-default)] shadow-[var(--shadow-sm)] p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">New Matchup</h3>
              <div className={isFinal ? '' : 'grid grid-cols-2 gap-3'}>
                <div>
                  <label className="text-xs text-[var(--text-muted)]">Round</label>
                  <select
                    value={newRound}
                    onChange={(e) => {
                      const r = Number(e.target.value);
                      setNewRound(r);
                      if (r === 3) setNewMatchup(1);
                      else {
                        const existing = flightBrackets.filter((b) => b.round === r).map((b) => b.matchup_number);
                        const max = maxMatchupsPerRound[r] || 3;
                        const avail = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !existing.includes(n));
                        setNewMatchup(avail[0] || 1);
                      }
                    }}
                    className="w-full mt-1 px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm"
                  >
                    {[1, 2, 3].map((r) => (
                      <option key={r} value={r}>{roundLabels[r]}</option>
                    ))}
                  </select>
                </div>
                {!isFinal && (
                  <div>
                    <label className="text-xs text-[var(--text-muted)]">Matchup #</label>
                    <select
                      value={newMatchup}
                      onChange={(e) => setNewMatchup(Number(e.target.value))}
                      className="w-full mt-1 px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm"
                    >
                      {availableMatchups.length > 0 ? (
                        availableMatchups.map((n) => (
                          <option key={n} value={n}>Matchup {n}</option>
                        ))
                      ) : (
                        <option value={newMatchup}>Matchup {newMatchup} (all slots filled)</option>
                      )}
                    </select>
                  </div>
                )}
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
                <label className="text-xs text-[var(--text-muted)]">P1 Result <span className="opacity-60">(optional)</span></label>
                <input
                  type="text"
                  value={newP1Result}
                  onChange={(e) => setNewP1Result(e.target.value)}
                  placeholder="e.g. -1, 1UP, DNP"
                  className="w-full mt-1 px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm"
                />
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
              <div>
                <label className="text-xs text-[var(--text-muted)]">P2 Result <span className="opacity-60">(optional)</span></label>
                <input
                  type="text"
                  value={newP2Result}
                  onChange={(e) => setNewP2Result(e.target.value)}
                  placeholder="e.g. +3, 1DN, DNP"
                  className="w-full mt-1 px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm"
                />
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
            );
          })() : (
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
