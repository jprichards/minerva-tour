'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { ArrowLeft, ChevronDown, ChevronRight, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { ALL_BUCKETS, BUCKET_LABELS, CHIRP_WILDCARDS, type ChirpBucket } from '@/lib/chirps';

interface ChirpTemplate {
  id: string;
  bucket: ChirpBucket;
  template: string;
  created_by: string | null;
  created_at: string;
}

export default function ChirpsPage() {
  const { isAuthenticated, loading: userLoading, profile } = useUser();
  const router = useRouter();
  const supabase = createClient();
  const { showToast } = useToast();

  const [templates, setTemplates] = useState<ChirpTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBuckets, setExpandedBuckets] = useState<Set<ChirpBucket>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [addingBucket, setAddingBucket] = useState<ChirpBucket | null>(null);
  const [addText, setAddText] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userLoading && !isAuthenticated) {
      router.push('/login');
      return;
    }

    const fetchTemplates = async () => {
      const { data, error } = await supabase
        .from('chirp_templates')
        .select('*')
        .order('bucket')
        .order('created_at');

      if (error) {
        console.error('Error fetching chirps:', error);
      }
      setTemplates(data || []);
      setLoading(false);
    };

    if (isAuthenticated) fetchTemplates();
  }, [isAuthenticated, userLoading, router, supabase]);

  const toggleBucket = (bucket: ChirpBucket) => {
    setExpandedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
  };

  const templatesByBucket = (bucket: ChirpBucket) =>
    templates.filter((t) => t.bucket === bucket);

  const handleAdd = async (bucket: ChirpBucket) => {
    if (!addText.trim()) return;
    setSaving(true);

    const { data, error } = await supabase
      .from('chirp_templates')
      .insert({ bucket, template: addText.trim(), created_by: profile?.id || null })
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

  if (userLoading || loading) {
    return (
      <div className="p-4">
        <div className="h-6 bg-[var(--bg-skeleton)] rounded animate-pulse w-32 mb-4" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-[var(--bg-skeleton)] rounded-lg animate-pulse mb-2" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Chirps</h1>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-3">
        Manage the automated score commentary. Chirps are matched based on <strong className="text-[var(--text-primary)]">net score</strong> (handicap-adjusted). Use these placeholders in templates:
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-xs text-[var(--text-muted)]">
        {CHIRP_WILDCARDS.map((w) => (
          <span key={w.token}>
            <code className="bg-[var(--bg-subtle)] px-1 rounded font-mono font-bold">{w.token}</code>{' '}
            {w.description}
          </span>
        ))}
      </div>

      {/* Bucket Accordions */}
      <div className="space-y-2">
        {ALL_BUCKETS.map((bucket) => {
          const items = templatesByBucket(bucket);
          const isExpanded = expandedBuckets.has(bucket);

          return (
            <div key={bucket} className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-default)] overflow-hidden">
              {/* Bucket Header */}
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
                    {BUCKET_LABELS[bucket]}
                  </span>
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  {items.length} chirp{items.length !== 1 ? 's' : ''}
                </span>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-[var(--border-default)]">
                  {items.length === 0 && (
                    <p className="p-3 text-sm text-[var(--text-muted)] italic">No chirps in this bucket yet.</p>
                  )}

                  {items.map((chirp) => (
                    <div
                      key={chirp.id}
                      className="flex items-start gap-2 p-3 border-b border-[var(--border-default)] last:border-b-0"
                    >
                      {editingId === chirp.id ? (
                        /* Edit Mode */
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
                        /* Delete Confirmation */
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
                        /* Display Mode */
                        <>
                          <p className="flex-1 text-sm text-[var(--text-primary)]">{chirp.template}</p>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button
                              onClick={() => { setEditingId(chirp.id); setEditText(chirp.template); }}
                              className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)]"
                            >
                              <Pencil className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            </button>
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
                  ))}

                  {/* Add New Chirp */}
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
