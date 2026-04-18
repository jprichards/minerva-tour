'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { logAuditEvent } from '@/lib/audit';
import { ArrowLeft, ChevronDown, ChevronRight, Plus, Pencil, Trash2, Check, X, Settings, RotateCcw, ArrowUp, ArrowDown, Sparkles, RotateCw, Archive } from 'lucide-react';
import { ALL_BUCKETS, BUCKET_LABELS, CHIRP_WILDCARDS, DEFAULT_BUCKET_RANGES, NO_CHIRP_BUCKETS, buildBucketLabels, type ChirpBucket, type BucketRange } from '@/lib/chirps';
import { CHIRPS_QUEUE_TARGET } from '@/lib/chirps-ai';
import { useChirpBucketConfig } from '@/lib/hooks/useChirpBucketConfig';
import type { ChirpSource } from '@/types/database';

interface ChirpTemplate {
  id: string;
  bucket: ChirpBucket;
  template: string;
  created_by: string | null;
  created_at: string;
  queue_position: number | null;
  source: ChirpSource;
  archived_at: string | null;
}

export default function ChirpsPage() {
  const { isAuthenticated, isAdmin, loading: userLoading, profile } = useUser();
  const router = useRouter();
  const supabase = createClient();
  const { showToast } = useToast();
  const { enabled: queueEnabled, loading: flagLoading } = useFeatureFlag(FEATURE_FLAGS.CHIRPS_QUEUE);

  const [templates, setTemplates] = useState<ChirpTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBuckets, setExpandedBuckets] = useState<Set<ChirpBucket>>(new Set());
  const [expandedArchives, setExpandedArchives] = useState<Set<ChirpBucket>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [addingBucket, setAddingBucket] = useState<ChirpBucket | null>(null);
  const [addText, setAddText] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<ChirpBucket | 'all' | null>(null);

  const { ranges, save: saveRanges } = useChirpBucketConfig();
  const [showRangeEditor, setShowRangeEditor] = useState(false);
  const [editRanges, setEditRanges] = useState<BucketRange[]>([]);
  const [savingRanges, setSavingRanges] = useState(false);

  const bucketLabels = isAdmin ? buildBucketLabels(ranges) : BUCKET_LABELS;

  const fetchTemplates = useCallback(async () => {
    const { data, error } = await supabase
      .from('chirp_templates')
      .select('*')
      .order('bucket')
      .order('queue_position', { ascending: true, nullsFirst: false })
      .order('created_at');

    if (error) {
      console.error('Error fetching chirps:', error);
    }
    setTemplates((data as ChirpTemplate[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!userLoading && !isAuthenticated) {
      router.push('/login');
      return;
    }
    if (isAuthenticated) fetchTemplates();
  }, [isAuthenticated, userLoading, router, fetchTemplates]);

  const toggleBucket = (bucket: ChirpBucket) => {
    setExpandedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
  };

  const toggleArchive = (bucket: ChirpBucket) => {
    setExpandedArchives((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
  };

  const queuedByBucket = (bucket: ChirpBucket) =>
    templates
      .filter((t) => t.bucket === bucket && t.queue_position != null && !t.archived_at)
      .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));

  const archivedByBucket = (bucket: ChirpBucket) =>
    templates
      .filter((t) => t.bucket === bucket && t.archived_at != null)
      .sort((a, b) => new Date(b.archived_at!).getTime() - new Date(a.archived_at!).getTime());

  const legacyByBucket = (bucket: ChirpBucket) =>
    templates.filter((t) => t.bucket === bucket && t.queue_position == null && !t.archived_at);

  const chirpableBuckets = ALL_BUCKETS.filter((b) => !NO_CHIRP_BUCKETS.has(b));
  const allQueuesEmpty = queueEnabled && chirpableBuckets.every((b) => queuedByBucket(b).length === 0);

  const handleAdd = async (bucket: ChirpBucket) => {
    if (!addText.trim()) return;
    setSaving(true);

    const insertData: Record<string, unknown> = {
      bucket,
      template: addText.trim(),
      created_by: profile?.id || null,
      source: 'manual',
    };

    if (queueEnabled) {
      const queued = queuedByBucket(bucket);
      const maxPos = queued.length > 0 ? Math.max(...queued.map((t) => t.queue_position ?? 0)) : 0;
      insertData.queue_position = maxPos + 1;
    }

    const { data, error } = await supabase
      .from('chirp_templates')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      showToast('Failed to add chirp.', 'error');
    } else if (data) {
      await logAuditEvent('chirp_template_add', 'chirp_template', data.id, {
        bucket,
        template: addText.trim(),
      });
      setTemplates((prev) => [...prev, data as ChirpTemplate]);
      showToast('Chirp added!');
      setAddText('');
      setAddingBucket(null);
    }
    setSaving(false);
  };

  const handleEdit = async (id: string) => {
    if (!editText.trim()) return;
    setSaving(true);

    const { error } = await supabase
      .from('chirp_templates')
      .update({ template: editText.trim() })
      .eq('id', id);

    if (error) {
      showToast('Failed to update chirp.', 'error');
    } else {
      const original = templates.find((t) => t.id === id);
      await logAuditEvent('chirp_template_edit', 'chirp_template', id, {
        bucket: original?.bucket,
        before: original?.template,
        after: editText.trim(),
      });
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, template: editText.trim() } : t))
      );
      showToast('Chirp updated!');
      setEditingId(null);
      setEditText('');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    const { error } = await supabase
      .from('chirp_templates')
      .delete()
      .eq('id', id);

    if (error) {
      showToast('Failed to delete chirp.', 'error');
    } else {
      const deleted = templates.find((t) => t.id === id);
      await logAuditEvent('chirp_template_delete', 'chirp_template', id, {
        bucket: deleted?.bucket,
        template: deleted?.template,
      });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      showToast('Chirp deleted.');
      setDeleteConfirm(null);
    }
    setSaving(false);
  };

  const handleMove = async (id: string, direction: 'up' | 'down') => {
    const chirp = templates.find((t) => t.id === id);
    if (!chirp || chirp.queue_position == null) return;

    const bucket = chirp.bucket as ChirpBucket;
    const queued = queuedByBucket(bucket);
    const idx = queued.findIndex((t) => t.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= queued.length) return;

    const other = queued[swapIdx];
    const posA = chirp.queue_position;
    const posB = other.queue_position;

    setSaving(true);
    await supabase.from('chirp_templates').update({ queue_position: posB }).eq('id', id);
    await supabase.from('chirp_templates').update({ queue_position: posA }).eq('id', other.id);

    setTemplates((prev) =>
      prev.map((t) => {
        if (t.id === id) return { ...t, queue_position: posB };
        if (t.id === other.id) return { ...t, queue_position: posA };
        return t;
      })
    );
    setSaving(false);
  };

  const handleRevive = async (id: string) => {
    const chirp = templates.find((t) => t.id === id);
    if (!chirp) return;

    const bucket = chirp.bucket as ChirpBucket;
    const queued = queuedByBucket(bucket);
    const maxPos = queued.length > 0 ? Math.max(...queued.map((t) => t.queue_position ?? 0)) : 0;

    setSaving(true);
    const { error } = await supabase
      .from('chirp_templates')
      .update({ archived_at: null, queue_position: maxPos + 1 })
      .eq('id', id);

    if (error) {
      showToast('Failed to revive chirp.', 'error');
    } else {
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, archived_at: null, queue_position: maxPos + 1 } : t))
      );
      showToast('Chirp revived!');
    }
    setSaving(false);
  };

  const handleGenerate = async (bucket?: ChirpBucket) => {
    setGenerating(bucket ?? 'all');
    try {
      const body = bucket ? { bucket } : {};
      const res = await fetch('/api/chirps/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Generated ${data.total_generated} chirp${data.total_generated !== 1 ? 's' : ''}!`);
        await fetchTemplates();
      } else {
        showToast(data.error || 'Failed to generate chirps.', 'error');
      }
    } catch {
      showToast('Failed to generate chirps.', 'error');
    } finally {
      setGenerating(null);
    }
  };

  if (userLoading || loading || flagLoading) {
    return (
      <div className="p-4">
        <div className="h-6 bg-[var(--bg-skeleton)] rounded animate-pulse w-32 mb-4" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-[var(--bg-skeleton)] rounded-lg animate-pulse mb-2" />
        ))}
      </div>
    );
  }

  const renderChirpRow = (chirp: ChirpTemplate, options?: { showMove?: boolean; showRevive?: boolean; isFirst?: boolean; isLast?: boolean }) => (
    <div
      key={chirp.id}
      className="flex items-start gap-2 p-3 border-b border-[var(--border-default)] last:border-b-0"
    >
      {editingId === chirp.id ? (
        <div className="flex-1 flex items-start gap-2">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="flex-1 bg-[var(--bg-main)] border border-[var(--border-default)] rounded-lg p-2 text-sm text-[var(--text-primary)] resize-none"
            rows={2}
            autoFocus
          />
          <button
            onClick={() => handleEdit(chirp.id)}
            disabled={saving || !editText.trim()}
            className="p-1.5 rounded-lg bg-minerva-600 text-white hover:bg-minerva-700 disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setEditingId(null); setEditText(''); }}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)]"
          >
            <X className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        </div>
      ) : deleteConfirm === chirp.id ? (
        <div className="flex-1 flex items-center justify-between">
          <span className="text-sm text-red-600">Delete this chirp?</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleDelete(chirp.id)}
              disabled={saving}
              className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              onClick={() => setDeleteConfirm(null)}
              className="px-3 py-1 rounded-lg text-xs font-medium hover:bg-[var(--bg-subtle)] text-[var(--text-muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              {options?.isFirst && queueEnabled && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-minerva-100 text-minerva-700">Next Up</span>
              )}
              {queueEnabled && chirp.source === 'ai' && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">AI</span>
              )}
            </div>
            <p className="text-sm text-[var(--text-primary)]">{chirp.template}</p>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {options?.showMove && (
              <>
                <button
                  onClick={() => handleMove(chirp.id, 'up')}
                  disabled={saving || options.isFirst}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] disabled:opacity-30"
                >
                  <ArrowUp className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                </button>
                <button
                  onClick={() => handleMove(chirp.id, 'down')}
                  disabled={saving || options.isLast}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] disabled:opacity-30"
                >
                  <ArrowDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                </button>
              </>
            )}
            {options?.showRevive && (
              <button
                onClick={() => handleRevive(chirp.id)}
                disabled={saving}
                className="p-1.5 rounded-lg hover:bg-minerva-50"
                title="Revive to queue"
              >
                <RotateCw className="w-3.5 h-3.5 text-minerva-600" />
              </button>
            )}
            {!options?.showRevive && (
              <button
                onClick={() => { setEditingId(chirp.id); setEditText(chirp.template); }}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)]"
              >
                <Pencil className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </button>
            )}
            <button
              onClick={() => setDeleteConfirm(chirp.id)}
              className="p-1.5 rounded-lg hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="p-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Chirps</h1>
        {queueEnabled && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">Queue Mode</span>
        )}
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-3">
        {queueEnabled
          ? <>Chirps are queued and consumed one-at-a-time when scores are posted to Slack. AI auto-generates replacements to keep each bucket at {CHIRPS_QUEUE_TARGET}.</>
          : <>Manage the automated score commentary. Chirps are matched based on <strong className="text-[var(--text-primary)]">net score</strong> (handicap-adjusted). Use these placeholders in templates:</>
        }
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-xs text-[var(--text-muted)]">
        {CHIRP_WILDCARDS.map((w) => (
          <span key={w.token}>
            <code className="bg-[var(--bg-subtle)] px-1 rounded font-mono font-bold">{w.token}</code>{' '}
            {w.description}
          </span>
        ))}
      </div>

      {/* Initialize Queue Banner */}
      {queueEnabled && allQueuesEmpty && isAdmin && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-medium text-purple-800 mb-2">Queue is empty</p>
          <p className="text-xs text-purple-600 mb-3">
            Generate {CHIRPS_QUEUE_TARGET} AI chirps for each of the {chirpableBuckets.length} active buckets to get started. Make sure Chirps AI is configured in Admin &gt; App Settings first.
          </p>
          <button
            onClick={() => handleGenerate()}
            disabled={generating !== null}
            className="w-full py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {generating === 'all' ? 'Generating...' : 'Initialize Queue'}
          </button>
        </div>
      )}

      {/* Admin: Bucket Range Editor */}
      {isAdmin && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden mb-4">
          <button
            onClick={() => {
              if (!showRangeEditor) setEditRanges(ranges.map((r) => ({ ...r })));
              setShowRangeEditor(!showRangeEditor);
            }}
            className="w-full flex items-center justify-between p-3 hover:bg-[var(--bg-subtle)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="font-medium text-sm text-[var(--text-primary)]">Score Range Configuration</span>
              <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-minerva-100 text-minerva-700 rounded-full">Admin</span>
            </div>
            {showRangeEditor
              ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
              : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
            }
          </button>
          {showRangeEditor && (
            <div className="border-t border-[var(--border-light)] p-3 space-y-3">
              <p className="text-xs text-[var(--text-muted)]">
                Set the upper bound (max net score) for each bucket. Scores above the last threshold fall into Bad.
              </p>
              <div className="space-y-2">
                {editRanges.map((range, idx) => {
                  const isLast = range.maxNet === null;
                  const prevMax = idx > 0 ? editRanges[idx - 1].maxNet : null;
                  const minLabel = prevMax !== null
                    ? (prevMax + 1 === 0 ? 'E' : prevMax + 1 > 0 ? `+${prevMax + 1}` : `${prevMax + 1}`)
                    : '...';
                  return (
                    <div key={range.bucket} className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)] w-20 capitalize">{range.bucket}</span>
                      {isLast ? (
                        <span className="flex-1 text-xs text-[var(--text-muted)]">
                          {minLabel} or worse
                        </span>
                      ) : (
                        <div className="flex-1 flex items-center gap-2">
                          <span className="text-xs text-[var(--text-muted)] min-w-[32px] text-right">{minLabel}</span>
                          <span className="text-xs text-[var(--text-faint)]">to</span>
                          <input
                            type="number"
                            value={range.maxNet ?? ''}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (isNaN(val)) return;
                              setEditRanges((prev) => prev.map((r, i) => i === idx ? { ...r, maxNet: val } : r));
                            }}
                            className="w-16 px-2 py-1 bg-[var(--bg-page)] border border-[var(--border-default)] rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-minerva-500"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {(() => {
                const nonNull = editRanges.filter((r) => r.maxNet !== null);
                const isValid = nonNull.every((r, i) => i === 0 || r.maxNet! > nonNull[i - 1].maxNet!);
                return (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={async () => {
                        setSavingRanges(true);
                        try {
                          await saveRanges(editRanges);
                          await logAuditEvent('update_settings', 'app_settings', undefined, {
                            key: 'chirp_bucket_ranges',
                            ranges: editRanges,
                          });
                          showToast('Bucket ranges saved!');
                          setShowRangeEditor(false);
                        } catch {
                          showToast('Failed to save ranges.', 'error');
                        } finally {
                          setSavingRanges(false);
                        }
                      }}
                      disabled={savingRanges || !isValid}
                      className="flex-1 py-2 bg-minerva-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-minerva-700 transition-colors"
                    >
                      {savingRanges ? 'Saving...' : 'Save Ranges'}
                    </button>
                    <button
                      onClick={() => setEditRanges(DEFAULT_BUCKET_RANGES.map((r) => ({ ...r })))}
                      className="p-2 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-muted)]"
                      title="Reset to defaults"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>
                );
              })()}
              {(() => {
                const nonNull = editRanges.filter((r) => r.maxNet !== null);
                const isValid = nonNull.every((r, i) => i === 0 || r.maxNet! > nonNull[i - 1].maxNet!);
                if (!isValid) {
                  return <p className="text-xs text-red-500">Thresholds must be strictly increasing.</p>;
                }
                return null;
              })()}
            </div>
          )}
        </div>
      )}

      {/* Bucket Accordions */}
      <div className="space-y-2">
        {ALL_BUCKETS.map((bucket) => {
          const isExpanded = expandedBuckets.has(bucket);

          if (queueEnabled) {
            const isNoChirp = NO_CHIRP_BUCKETS.has(bucket);

            if (isNoChirp) {
              return (
                <div key={bucket} className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-default)] overflow-hidden opacity-60">
                  <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-[var(--text-primary)]">
                        {bucketLabels[bucket]}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-[var(--text-muted)] italic">No chirp</span>
                  </div>
                </div>
              );
            }

            const queued = queuedByBucket(bucket);
            const archived = archivedByBucket(bucket);
            const archiveExpanded = expandedArchives.has(bucket);
            const queueCount = queued.length;
            const belowTarget = queueCount < CHIRPS_QUEUE_TARGET;

            return (
              <div key={bucket} className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-default)] overflow-hidden">
                <button
                  onClick={() => toggleBucket(bucket)}
                  className="w-full flex items-center justify-between p-3 hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                      : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
                    }
                    <span className="font-medium text-sm text-[var(--text-primary)]">
                      {bucketLabels[bucket]}
                    </span>
                  </div>
                  <span className={`text-xs font-medium ${belowTarget ? 'text-orange-600' : 'text-[var(--text-muted)]'}`}>
                    {queueCount}/{CHIRPS_QUEUE_TARGET}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-[var(--border-default)]">
                    {queued.length === 0 && (
                      <p className="p-3 text-sm text-[var(--text-muted)] italic">Queue is empty.</p>
                    )}

                    {queued.map((chirp, idx) =>
                      renderChirpRow(chirp, {
                        showMove: true,
                        isFirst: idx === 0,
                        isLast: idx === queued.length - 1,
                      })
                    )}

                    {/* Generate More */}
                    {belowTarget && (
                      <button
                        onClick={() => handleGenerate(bucket)}
                        disabled={generating !== null}
                        className="w-full flex items-center justify-center gap-2 p-3 text-sm font-semibold text-purple-600 hover:bg-purple-50 transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                        {generating === bucket ? 'Generating...' : `Generate ${CHIRPS_QUEUE_TARGET - queueCount} More`}
                      </button>
                    )}

                    {/* Add Chirp */}
                    {addingBucket === bucket ? (
                      <div className="p-3 flex items-start gap-2 border-t border-[var(--border-default)]">
                        <textarea
                          value={addText}
                          onChange={(e) => setAddText(e.target.value)}
                          placeholder="Enter chirp template... use $first_name for the player's name"
                          className="flex-1 bg-[var(--bg-main)] border border-[var(--border-default)] rounded-lg p-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] resize-none"
                          rows={2}
                          autoFocus
                        />
                        <button
                          onClick={() => handleAdd(bucket)}
                          disabled={saving || !addText.trim()}
                          className="p-1.5 rounded-lg bg-minerva-600 text-white hover:bg-minerva-700 disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setAddingBucket(null); setAddText(''); }}
                          className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)]"
                        >
                          <X className="w-4 h-4 text-[var(--text-muted)]" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingBucket(bucket); setAddText(''); }}
                        className="w-full flex items-center gap-2 p-3 text-sm font-semibold text-minerva-600 hover:bg-[var(--bg-subtle)] transition-colors border-t border-[var(--border-default)]"
                      >
                        <Plus className="w-4 h-4" />
                        Add Chirp to Queue
                      </button>
                    )}

                    {/* Archive Section */}
                    {archived.length > 0 && (
                      <div className="border-t border-[var(--border-default)]">
                        <button
                          onClick={() => toggleArchive(bucket)}
                          className="w-full flex items-center justify-between p-3 hover:bg-[var(--bg-subtle)] transition-colors bg-[var(--bg-page)]"
                        >
                          <div className="flex items-center gap-2">
                            <Archive className="w-3.5 h-3.5 text-[var(--text-faint)]" />
                            <span className="text-xs font-medium text-[var(--text-muted)]">
                              Archive ({archived.length})
                            </span>
                          </div>
                          {archiveExpanded
                            ? <ChevronDown className="w-3.5 h-3.5 text-[var(--text-faint)]" />
                            : <ChevronRight className="w-3.5 h-3.5 text-[var(--text-faint)]" />
                          }
                        </button>
                        {archiveExpanded && (
                          <div className="bg-[var(--bg-page)]">
                            {archived.map((chirp) => renderChirpRow(chirp, { showRevive: true }))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }

          // Legacy (flag off) view
          const items = legacyByBucket(bucket).length > 0 ? legacyByBucket(bucket) : templates.filter((t) => t.bucket === bucket);

          return (
            <div key={bucket} className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-default)] overflow-hidden">
              <button
                onClick={() => toggleBucket(bucket)}
                className="w-full flex items-center justify-between p-3 hover:bg-[var(--bg-subtle)] transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                    : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
                  }
                  <span className="font-medium text-sm text-[var(--text-primary)]">
                    {bucketLabels[bucket]}
                  </span>
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  {items.length} chirp{items.length !== 1 ? 's' : ''}
                </span>
              </button>

              {isExpanded && (
                <div className="border-t border-[var(--border-default)]">
                  {items.length === 0 && (
                    <p className="p-3 text-sm text-[var(--text-muted)] italic">No chirps in this bucket yet.</p>
                  )}

                  {items.map((chirp) => renderChirpRow(chirp))}

                  {addingBucket === bucket ? (
                    <div className="p-3 flex items-start gap-2">
                      <textarea
                        value={addText}
                        onChange={(e) => setAddText(e.target.value)}
                        placeholder="Enter chirp template... use $first_name for the player's name"
                        className="flex-1 bg-[var(--bg-main)] border border-[var(--border-default)] rounded-lg p-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] resize-none"
                        rows={2}
                        autoFocus
                      />
                      <button
                        onClick={() => handleAdd(bucket)}
                        disabled={saving || !addText.trim()}
                        className="p-1.5 rounded-lg bg-minerva-600 text-white hover:bg-minerva-700 disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setAddingBucket(null); setAddText(''); }}
                        className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)]"
                      >
                        <X className="w-4 h-4 text-[var(--text-muted)]" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddingBucket(bucket); setAddText(''); }}
                      className="w-full flex items-center gap-2 p-3 text-sm font-semibold text-minerva-600 hover:bg-[var(--bg-subtle)] transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Chirp
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
