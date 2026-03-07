'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import {
  ArrowLeft, MessageSquare, Bug, Lightbulb, HelpCircle,
  ChevronDown, ChevronUp, Paperclip, Send,
} from 'lucide-react';
import type { Feedback, FeedbackStatus } from '@/types/database';

const TYPE_META: Record<string, { label: string; icon: typeof Bug; color: string }> = {
  bug: { label: 'Bug', icon: Bug, color: 'bg-red-100 text-red-600' },
  feature_request: { label: 'Feature', icon: Lightbulb, color: 'bg-amber-100 text-amber-600' },
  other: { label: 'Other', icon: HelpCircle, color: 'bg-blue-100 text-blue-600' },
};

const STATUS_OPTIONS: { value: FeedbackStatus; label: string; color: string }[] = [
  { value: 'open', label: 'Open', color: 'bg-blue-100 text-blue-700' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-100 text-amber-700' },
  { value: 'resolved', label: 'Resolved', color: 'bg-green-100 text-green-700' },
  { value: 'closed', label: 'Closed', color: 'bg-[var(--bg-subtle)] text-[var(--text-muted)]' },
];

export default function AdminFeedbackPage() {
  const { isAdmin, profile, loading: userLoading } = useUser();
  const router = useRouter();
  const supabase = createClient();
  const { showToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: feedbackList, isLoading } = useSWR(
    isAdmin ? 'admin-feedback' : null,
    async () => {
      const { data } = await supabase
        .from('feedback')
        .select('*, user:users!feedback_user_id_fkey(id, full_name, email, profile_picture_url)')
        .order('created_at', { ascending: false });
      return (data || []) as (Feedback & { user?: { id: string; full_name: string | null; email: string | null } })[];
    }
  );

  if (!userLoading && !isAdmin) {
    router.push('/home');
    return null;
  }

  const filtered = (feedbackList || []).filter((fb) => {
    if (statusFilter !== 'all' && fb.status !== statusFilter) return false;
    if (typeFilter !== 'all' && fb.type !== typeFilter) return false;
    return true;
  });

  const cleanupAttachments = async (fb: Feedback) => {
    if (!fb.attachments || fb.attachments.length === 0) return;

    const paths = fb.attachments.map((url) => {
      const parts = url.split('/feedback-attachments/');
      return parts.length > 1 ? parts[1] : '';
    }).filter(Boolean);

    if (paths.length > 0) {
      await supabase.storage.from('feedback-attachments').remove(paths);
    }
  };

  const handleStatusChange = async (fb: Feedback, newStatus: FeedbackStatus) => {
    setSaving(true);

    if (newStatus === 'closed') {
      await cleanupAttachments(fb);
    }

    const updates: Record<string, unknown> = {
      status: newStatus,
      ...(newStatus === 'closed' ? { attachments: [] } : {}),
    };

    const { error } = await supabase
      .from('feedback')
      .update(updates)
      .eq('id', fb.id);

    if (error) {
      showToast(`Error: ${error.message}`, 'error');
    } else {
      showToast(`Status updated to ${newStatus.replace('_', ' ')}`, 'success');
      mutate('admin-feedback');
    }
    setSaving(false);
  };

  const handleRespond = async (feedbackId: string) => {
    if (!responseText.trim()) return;
    setSaving(true);

    const { error } = await supabase
      .from('feedback')
      .update({
        admin_response: responseText.trim(),
        responded_by: profile!.id,
        responded_at: new Date().toISOString(),
      })
      .eq('id', feedbackId);

    if (error) {
      showToast(`Error: ${error.message}`, 'error');
    } else {
      showToast('Response saved', 'success');
      setResponseText('');
      mutate('admin-feedback');
    }
    setSaving(false);
  };

  const loading = userLoading || isLoading;

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 bg-[var(--bg-skeleton)] rounded-lg animate-pulse w-48" />
        <div className="h-12 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
        <div className="h-40 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const openCount = (feedbackList || []).filter((f) => f.status === 'open').length;

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin" className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Feedback Inbox</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {openCount} open {openCount === 1 ? 'item' : 'items'} &middot; {(feedbackList || []).length} total
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="flex-1">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            <option value="all">All Status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            <option value="all">All Types</option>
            <option value="bug">Bug Reports</option>
            <option value="feature_request">Feature Requests</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {/* Feedback List */}
      {filtered.length === 0 ? (
        <div className="text-center py-8">
          <MessageSquare className="w-10 h-10 text-[var(--text-faint)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-muted)]">
            {feedbackList && feedbackList.length > 0 ? 'No feedback matching filters.' : 'No feedback submitted yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((fb) => {
            const meta = TYPE_META[fb.type] || TYPE_META.other;
            const TypeIcon = meta.icon;
            const isExpanded = expandedId === fb.id;
            const statusOpt = STATUS_OPTIONS.find((s) => s.value === fb.status) || STATUS_OPTIONS[0];

            return (
              <div key={fb.id} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] overflow-hidden">
                {/* Summary row */}
                <button
                  onClick={() => {
                    setExpandedId(isExpanded ? null : fb.id);
                    if (!isExpanded) setResponseText(fb.admin_response || '');
                  }}
                  className="w-full flex items-center gap-3 p-3 text-left"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                    <TypeIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{fb.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {fb.user?.full_name || fb.user?.email || 'Unknown'} &middot;{' '}
                      {new Date(fb.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statusOpt.color}`}>
                    {statusOpt.label}
                  </span>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-[var(--text-faint)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-faint)]" />}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-3 border-t border-[var(--border-light)] pt-3">
                    {/* Description */}
                    <div>
                      <p className="text-[10px] font-medium text-[var(--text-faint)] mb-1">Description</p>
                      <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{fb.description}</p>
                    </div>

                    {/* Attachments */}
                    {fb.attachments && fb.attachments.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-[var(--text-faint)] mb-1">Attachments</p>
                        <div className="flex gap-2 flex-wrap">
                          {fb.attachments.map((url, idx) => (
                            <a
                              key={idx}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-minerva-600 hover:underline bg-[var(--bg-subtle)] rounded-lg px-2 py-1"
                            >
                              <Paperclip className="w-3 h-3" />
                              File {idx + 1}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Status change */}
                    <div>
                      <p className="text-[10px] font-medium text-[var(--text-faint)] mb-1">Status</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {STATUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            disabled={saving || fb.status === opt.value}
                            onClick={() => handleStatusChange(fb, opt.value)}
                            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                              fb.status === opt.value
                                ? `${opt.color} ring-2 ring-offset-1 ring-current`
                                : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:opacity-80'
                            } disabled:opacity-50`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Admin response */}
                    <div>
                      <p className="text-[10px] font-medium text-[var(--text-faint)] mb-1">Admin Response</p>
                      <div className="flex gap-2">
                        <textarea
                          value={responseText}
                          onChange={(e) => setResponseText(e.target.value)}
                          placeholder="Write a response..."
                          rows={2}
                          className="flex-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] resize-none"
                        />
                        <button
                          onClick={() => handleRespond(fb.id)}
                          disabled={saving || !responseText.trim()}
                          className="self-end p-2.5 bg-minerva-600 text-white rounded-lg hover:bg-minerva-700 transition-colors disabled:opacity-50"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                      {fb.responded_at && (
                        <p className="text-[10px] text-[var(--text-faint)] mt-1">
                          Last responded {new Date(fb.responded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
