'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { ArrowLeft, Plus, Trophy, Power, PowerOff, Trash2, Edit, Save, X } from 'lucide-react';
import type { Tournament, Season } from '@/types/database';
import { formatLocalDate } from '@/lib/date-utils';

export default function AdminTournamentsPage() {
  const { isAdmin, loading: userLoading } = useUser();
  const router = useRouter();
  const { showToast } = useToast();
  const supabase = createClient();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [format, setFormat] = useState('stroke_play');

  useEffect(() => {
    if (!userLoading && !isAdmin) router.push('/home');
  }, [isAdmin, userLoading, router]);

  const fetchData = async () => {
    const { data: tourns } = await supabase
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false });
    setTournaments(tourns || []);

    const { data: seasonsData } = await supabase
      .from('seasons')
      .select('*')
      .order('year', { ascending: false });
    setSeasons(seasonsData || []);
    if (seasonsData && seasonsData.length > 0 && !seasonId) {
      setSeasonId(seasonsData[0].id);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [supabase]);

  const resetForm = () => {
    setName('');
    setStartDate('');
    setEndDate('');
    setFormat('stroke_play');
  };

  const handleCreate = async () => {
    if (!name || !startDate || !endDate) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    const { data, error } = await supabase.from('tournaments').insert({
      name,
      season_id: seasonId || null,
      start_date: startDate,
      end_date: endDate,
      format,
      is_active: false,
      settings: {},
    }).select().single();

    if (error) {
      showToast(error.message, 'error');
      return;
    }

    logAuditEvent('create_tournament', 'tournament', data.id, { name, format });
    showToast('Tournament created!', 'success');
    setShowAdd(false);
    resetForm();
    fetchData();
  };

  const handleToggleActive = async (tournament: Tournament) => {
    const newActive = !tournament.is_active;

    // If activating, also switch season to tournament mode
    if (newActive && tournament.season_id) {
      await supabase.from('seasons').update({ mode: 'tournament' }).eq('id', tournament.season_id);
    }

    const { error } = await supabase
      .from('tournaments')
      .update({ is_active: newActive })
      .eq('id', tournament.id);

    if (error) {
      showToast('Failed to toggle tournament.', 'error');
      return;
    }

    // If deactivating, revert season mode and playing guests
    if (!newActive && tournament.season_id) {
      await supabase.from('seasons').update({ mode: 'regular_season' }).eq('id', tournament.season_id);

      // Auto-revert playing guests to non-playing guests
      const { data: playingGuests } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'playing_guest');

      if (playingGuests && playingGuests.length > 0) {
        const guestIds = playingGuests.map((g) => g.id);
        await supabase
          .from('users')
          .update({ role: 'non_playing_guest' })
          .in('id', guestIds);

        logAuditEvent('user_role_change', 'users', undefined, {
          action: 'tournament_guest_revert',
          count: guestIds.length,
          from: 'playing_guest',
          to: 'non_playing_guest',
        });
      }
    }

    logAuditEvent('toggle_tournament', 'tournament', tournament.id, { is_active: newActive });
    showToast(
      newActive
        ? 'Tournament activated!'
        : `Tournament deactivated.${!newActive ? ' Playing guests have been reverted.' : ''}`,
      'success'
    );
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tournament? This cannot be undone.')) return;
    await supabase.from('tournaments').delete().eq('id', id);
    showToast('Tournament deleted.', 'success');
    fetchData();
  };

  const handleEdit = (t: Tournament) => {
    setEditingId(t.id);
    setName(t.name);
    setStartDate(t.start_date);
    setEndDate(t.end_date);
    setFormat(t.format || 'stroke_play');
    setSeasonId(t.season_id || '');
  };

  const handleSaveEdit = async (id: string) => {
    const { error } = await supabase.from('tournaments').update({
      name,
      start_date: startDate,
      end_date: endDate,
      format,
      season_id: seasonId || null,
    }).eq('id', id);

    if (error) {
      showToast(error.message, 'error');
      return;
    }

    logAuditEvent('edit_tournament', 'tournament', id, { name, format });
    showToast('Tournament updated!', 'success');
    setEditingId(null);
    resetForm();
    fetchData();
  };

  if (!isAdmin) return null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Tournaments</h1>
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        Create and manage tournaments. Activating a tournament will switch the season to tournament mode.
      </p>

      {/* Add button */}
      <button
        onClick={() => { setShowAdd(!showAdd); resetForm(); }}
        className="flex items-center gap-1.5 bg-minerva-600 text-white text-sm font-medium px-4 py-2 rounded-xl"
      >
        <Plus className="w-4 h-4" />
        New Tournament
      </button>

      {/* Add Form */}
      {showAdd && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-default)] shadow-[var(--shadow-sm)] p-4 space-y-3">
          <div>
            <label className="text-xs text-[var(--text-muted)]">Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Annual Championship" className="w-full mt-1 px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-muted)]">Start Date *</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full mt-1 px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">End Date *</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full mt-1 px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-muted)]">Format</label>
              <select value={format} onChange={(e) => setFormat(e.target.value)} className="w-full mt-1 px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm">
                <option value="stroke_play">Stroke Play</option>
                <option value="match_play">Match Play</option>
                <option value="best_ball">Best Ball</option>
                <option value="scramble">Scramble</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">Season</label>
              <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className="w-full mt-1 px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm">
                <option value="">None</option>
                {seasons.map((s) => <option key={s.id} value={s.id}>{s.year}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} className="flex-1 bg-minerva-600 text-white rounded-lg py-2 text-sm font-medium">Create</button>
            <button onClick={() => { setShowAdd(false); resetForm(); }} className="flex-1 bg-[var(--bg-subtle)] text-[var(--text-muted)] rounded-lg py-2 text-sm font-medium">Cancel</button>
          </div>
        </div>
      )}

      {/* Tournaments List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />)}
        </div>
      ) : tournaments.length === 0 ? (
        <div className="text-center py-12">
          <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)]">No tournaments yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <div key={t.id} className={`bg-[var(--bg-card)] rounded-xl border shadow-[var(--shadow-sm)] p-4 ${t.is_active ? 'border-green-300 bg-green-50/30' : 'border-[var(--border-light)]'}`}>
              {editingId === t.id ? (
                <div className="space-y-3">
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm" />
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleSaveEdit(t.id)} className="flex items-center gap-1 bg-minerva-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
                      <Save className="w-3 h-3" /> Save
                    </button>
                    <button onClick={() => { setEditingId(null); resetForm(); }} className="flex items-center gap-1 bg-[var(--bg-subtle)] text-[var(--text-muted)] rounded-lg px-3 py-1.5 text-xs font-medium">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--text-primary)]">{t.name}</span>
                      {t.is_active && <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full font-medium">Active</span>}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {t.format?.replace(/_/g, ' ') || 'Stroke play'} &middot; {formatLocalDate(t.start_date)} &ndash; {formatLocalDate(t.end_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleToggleActive(t)}
                      className={`p-2 rounded-lg ${t.is_active ? 'hover:bg-red-50 text-red-500' : 'hover:bg-green-50 text-green-600'}`}
                      title={t.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {t.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleEdit(t)} className="p-2 hover:bg-[var(--bg-subtle)] rounded-lg">
                      <Edit className="w-4 h-4 text-[var(--text-faint)]" />
                    </button>
                    <button onClick={() => handleDelete(t.id)} className="p-2 hover:bg-red-50 rounded-lg text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
