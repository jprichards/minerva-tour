'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { ArrowLeft, Award, Trash2, Plus, ChevronDown, Pencil, Check, X } from 'lucide-react';
import Link from 'next/link';
import { AWARD_EMOJI, AWARD_DISPLAY_NAMES, type AwardType } from '@/lib/trophy-utils';
import type { User, Trophy } from '@/types/database';

const PRESET_AWARDS = Object.entries(AWARD_DISPLAY_NAMES).map(([key, name]) => ({
  type: key as AwardType,
  name,
  emoji: AWARD_EMOJI[key as AwardType],
}));

export default function AdminTrophiesPage() {
  const { isAdmin, loading: userLoading } = useUser();
  const router = useRouter();
  const supabase = createClient();
  const { showToast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [trophies, setTrophies] = useState<(Trophy & { user?: User })[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState({ award_name: '', emoji: '', year: 0, description: '' });
  const [saving, setSaving] = useState(false);

  // Form state
  const [isCustom, setIsCustom] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [customName, setCustomName] = useState('');
  const [customEmoji, setCustomEmoji] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [description, setDescription] = useState('');
  const [bjcTeam, setBjcTeam] = useState<'magnolia' | 'azalea'>('magnolia');

  useEffect(() => {
    if (!userLoading && !isAdmin) {
      router.push('/home');
    }
  }, [isAdmin, userLoading, router]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchData();
  }, [isAdmin]);

  const fetchData = async () => {
    setLoading(true);
    const [usersRes, trophiesRes] = await Promise.all([
      supabase.from('users').select('*').order('full_name'),
      supabase.from('trophies').select('*, user:users(id, full_name, email, profile_picture_url)').order('year', { ascending: false }),
    ]);
    setUsers(usersRes.data || []);
    setTrophies(trophiesRes.data || []);
    setLoading(false);
  };

  const currentPreset = PRESET_AWARDS.find((p) => p.type === selectedPreset);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      showToast('Please select a member', 'error');
      return;
    }

    const awardName = isCustom ? customName.trim() : currentPreset?.name;
    let emoji = isCustom ? customEmoji.trim() : currentPreset?.emoji;
    const awardType = isCustom ? 'custom' : selectedPreset;

    if (awardType === 'bobby_jones_cup') {
      emoji = bjcTeam === 'magnolia' ? '🌳' : '🌺';
    }

    if (!awardName || !emoji) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from('trophies').insert({
      user_id: selectedUserId,
      year,
      award_type: awardType,
      award_name: awardName,
      emoji,
      description: description.trim() || null,
    });

    if (error) {
      showToast(`Error: ${error.message}`, 'error');
    } else {
      showToast(`Awarded "${awardName}" to member!`, 'success');
      resetForm();
      fetchData();
    }
    setSubmitting(false);
  };

  const resetForm = () => {
    setSelectedUserId('');
    setSelectedPreset('');
    setCustomName('');
    setCustomEmoji('');
    setYear(new Date().getFullYear());
    setDescription('');
    setBjcTeam('magnolia');
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('trophies').delete().eq('id', id);
    if (error) {
      showToast(`Error: ${error.message}`, 'error');
    } else {
      showToast('Trophy removed', 'info');
      setDeleteConfirm(null);
      fetchData();
    }
  };

  const startEditing = (trophy: Trophy) => {
    setEditingId(trophy.id);
    setEditFields({
      award_name: trophy.award_name,
      emoji: trophy.emoji,
      year: trophy.year,
      description: trophy.description || '',
    });
    setDeleteConfirm(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async (id: string) => {
    setSaving(true);
    const { error } = await supabase
      .from('trophies')
      .update({
        award_name: editFields.award_name.trim(),
        emoji: editFields.emoji.trim(),
        year: editFields.year,
        description: editFields.description.trim() || null,
      })
      .eq('id', id);

    if (error) {
      showToast(`Error: ${error.message}`, 'error');
    } else {
      showToast('Trophy updated', 'success');
      setEditingId(null);
      fetchData();
    }
    setSaving(false);
  };

  if (userLoading || loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 bg-[var(--bg-skeleton)] rounded-lg animate-pulse w-48" />
        <div className="h-64 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
        <div className="h-40 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin" className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Trophies & Awards</h1>
          <p className="text-xs text-[var(--text-muted)]">Award trophies to members</p>
        </div>
      </div>

      {/* Award Form */}
      <form onSubmit={handleSubmit} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-4 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Plus className="w-4 h-4 text-minerva-600" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Award a Trophy</h2>
        </div>

        {/* Member selector */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Member</label>
          <div className="relative">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] appearance-none"
              required
            >
              <option value="">Select a member...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)] pointer-events-none" />
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 bg-[var(--bg-subtle)] p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setIsCustom(false)}
            className={`flex-1 text-xs font-medium py-2 rounded-md transition-colors ${
              !isCustom ? 'bg-minerva-600 text-white' : 'text-[var(--text-muted)]'
            }`}
          >
            Preset Award
          </button>
          <button
            type="button"
            onClick={() => setIsCustom(true)}
            className={`flex-1 text-xs font-medium py-2 rounded-md transition-colors ${
              isCustom ? 'bg-minerva-600 text-white' : 'text-[var(--text-muted)]'
            }`}
          >
            Custom Award
          </button>
        </div>

        {!isCustom ? (
          /* Preset award selector */
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Award Type</label>
            <div className="relative">
              <select
                value={selectedPreset}
                onChange={(e) => setSelectedPreset(e.target.value)}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] appearance-none"
                required={!isCustom}
              >
                <option value="">Select an award...</option>
                {PRESET_AWARDS.map((a) => (
                  <option key={a.type} value={a.type}>
                    {a.type === 'bobby_jones_cup' ? '🌳 🌺' : a.emoji} {a.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)] pointer-events-none" />
            </div>
            {currentPreset && selectedPreset === 'bobby_jones_cup' ? (
              <div className="mt-2">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Winning Team</label>
                <div className="flex gap-1 bg-[var(--bg-subtle)] p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setBjcTeam('magnolia')}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md transition-colors"
                    style={bjcTeam === 'magnolia' ? { backgroundColor: '#16a34a', color: '#fff' } : { color: 'var(--text-muted)' }}
                  >
                    🌳 Magnolia
                  </button>
                  <button
                    type="button"
                    onClick={() => setBjcTeam('azalea')}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md transition-colors"
                    style={bjcTeam === 'azalea' ? { backgroundColor: '#db2777', color: '#fff' } : { color: 'var(--text-muted)' }}
                  >
                    🌺 Azalea
                  </button>
                </div>
              </div>
            ) : currentPreset ? (
              <p className="text-xs text-[var(--text-faint)] mt-1">
                Emoji: {currentPreset.emoji}
              </p>
            ) : null}
          </div>
        ) : (
          /* Custom award fields */
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Award Name</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Best Dressed"
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]"
                required={isCustom}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Emoji</label>
              <input
                type="text"
                value={customEmoji}
                onChange={(e) => setCustomEmoji(e.target.value)}
                placeholder="e.g. 👔"
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]"
                required={isCustom}
                maxLength={4}
              />
            </div>
          </div>
        )}

        {/* Year */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Year</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value) || new Date().getFullYear())}
            min={2000}
            max={2099}
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            Description <span className="text-[var(--text-faint)]">(optional)</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Hole 7 at Pinehurst No. 2"
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-minerva-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-minerva-700 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Awarding...' : 'Award Trophy'}
        </button>
      </form>

      {/* Existing Trophies */}
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">
          All Trophies ({trophies.length})
        </h2>

        {trophies.length === 0 ? (
          <div className="text-center py-8">
            <Award className="w-10 h-10 text-[var(--text-faint)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-muted)]">No trophies awarded yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {trophies.map((trophy) => (
              <div
                key={trophy.id}
                className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] p-3"
              >
                {editingId === trophy.id ? (
                  /* Inline edit form */
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Pencil className="w-3.5 h-3.5 text-minerva-600" />
                      <span className="text-xs font-semibold text-minerva-600">Editing</span>
                      <span className="text-xs text-[var(--text-faint)]">({trophy.user?.full_name || 'Unknown'})</span>
                    </div>
                    {trophy.award_type === 'bobby_jones_cup' ? (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-[10px] font-medium text-[var(--text-faint)] mb-0.5">Award Name</label>
                          <input
                            type="text"
                            value={editFields.award_name}
                            onChange={(e) => setEditFields({ ...editFields, award_name: e.target.value })}
                            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text-primary)]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-[var(--text-faint)] mb-0.5">Winning Team</label>
                          <div className="flex gap-1 bg-[var(--bg-subtle)] p-1 rounded-lg">
                            <button
                              type="button"
                              onClick={() => setEditFields({ ...editFields, emoji: '🌳' })}
                              className="flex-1 flex items-center justify-center gap-1 text-xs font-medium py-1.5 rounded-md transition-colors"
                              style={editFields.emoji === '🌳' ? { backgroundColor: '#16a34a', color: '#fff' } : { color: 'var(--text-muted)' }}
                            >
                              🌳 Magnolia
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditFields({ ...editFields, emoji: '🌺' })}
                              className="flex-1 flex items-center justify-center gap-1 text-xs font-medium py-1.5 rounded-md transition-colors"
                              style={editFields.emoji === '🌺' ? { backgroundColor: '#db2777', color: '#fff' } : { color: 'var(--text-muted)' }}
                            >
                              🌺 Azalea
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-[3rem_1fr] gap-2">
                        <div>
                          <label className="block text-[10px] font-medium text-[var(--text-faint)] mb-0.5">Emoji</label>
                          <input
                            type="text"
                            value={editFields.emoji}
                            onChange={(e) => setEditFields({ ...editFields, emoji: e.target.value })}
                            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-2 py-1.5 text-sm text-center"
                            maxLength={4}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-[var(--text-faint)] mb-0.5">Award Name</label>
                          <input
                            type="text"
                            value={editFields.award_name}
                            onChange={(e) => setEditFields({ ...editFields, award_name: e.target.value })}
                            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text-primary)]"
                          />
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-[5rem_1fr] gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-[var(--text-faint)] mb-0.5">Year</label>
                        <input
                          type="number"
                          value={editFields.year}
                          onChange={(e) => setEditFields({ ...editFields, year: parseInt(e.target.value) || 0 })}
                          className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text-primary)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-[var(--text-faint)] mb-0.5">Description</label>
                        <input
                          type="text"
                          value={editFields.description}
                          onChange={(e) => setEditFields({ ...editFields, description: e.target.value })}
                          placeholder="Optional"
                          className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text-primary)]"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveEdit(trophy.id)}
                        disabled={saving}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-minerva-600 text-white rounded-lg py-2 text-xs font-medium hover:bg-minerva-700 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-[var(--bg-subtle)] text-[var(--text-muted)] rounded-lg py-2 text-xs font-medium hover:opacity-80 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display row */
                  <div className="flex items-center gap-3">
                    <span className="text-2xl flex-shrink-0">{trophy.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {trophy.award_name}
                        {trophy.description && (
                          <span className="text-[var(--text-faint)] font-normal"> ({trophy.description})</span>
                        )}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {trophy.user?.full_name || 'Unknown'} &middot; {trophy.year}
                      </p>
                    </div>
                    {deleteConfirm === trophy.id ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => handleDelete(trophy.id)}
                          className="px-2 py-1 bg-red-600 text-white text-xs rounded-lg font-medium"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-1 bg-[var(--bg-subtle)] text-[var(--text-muted)] text-xs rounded-lg font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => startEditing(trophy)}
                          className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-faint)] hover:text-minerva-600 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setDeleteConfirm(trophy.id); setEditingId(null); }}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-[var(--text-faint)] hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
