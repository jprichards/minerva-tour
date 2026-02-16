'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { MessageSquare, Bug, Lightbulb, HelpCircle, Paperclip, X, ChevronDown, ChevronUp, Send } from 'lucide-react';
import type { Feedback, FeedbackType } from '@/types/database';

const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = 'image/*,video/*';

const FEEDBACK_TYPES: { value: FeedbackType; label: string; icon: typeof Bug; color: string }[] = [
  { value: 'bug', label: 'Bug Report', icon: Bug, color: 'bg-red-100 text-red-600' },
  { value: 'feature_request', label: 'Feature Request', icon: Lightbulb, color: 'bg-amber-100 text-amber-600' },
  { value: 'other', label: 'Other', icon: HelpCircle, color: 'bg-blue-100 text-blue-600' },
];

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-[var(--bg-subtle)] text-[var(--text-muted)]',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export default function FeedbackPage() {
  const { profile } = useUser();
  const supabase = createClient();
  const { showToast } = useToast();

  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [fileError, setFileError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: myFeedback, isLoading } = useSWR(
    profile?.id ? ['my-feedback', profile.id] : null,
    async () => {
      const { data } = await supabase
        .from('feedback')
        .select('*')
        .eq('user_id', profile!.id)
        .order('created_at', { ascending: false });
      return (data || []) as Feedback[];
    }
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFileError('');

    if (files.length + selected.length > MAX_FILES) {
      setFileError(`Maximum ${MAX_FILES} files allowed`);
      return;
    }

    const oversized = selected.find((f) => f.size > MAX_FILE_SIZE);
    if (oversized) {
      setFileError(`File "${oversized.name}" exceeds 10MB limit`);
      return;
    }

    setFiles((prev) => [...prev, ...selected]);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileError('');
  };

  const uploadFiles = async (feedbackId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of files) {
      const path = `${profile!.id}/${feedbackId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage
        .from('feedback-attachments')
        .upload(path, file);
      if (!error) {
        const { data: urlData } = supabase.storage
          .from('feedback-attachments')
          .getPublicUrl(path);
        urls.push(urlData.publicUrl);
      }
    }
    return urls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !description.trim()) {
      showToast('Please fill in title and description', 'error');
      return;
    }

    setSubmitting(true);

    // Insert feedback first to get the ID
    const { data: inserted, error: insertError } = await supabase
      .from('feedback')
      .insert({
        user_id: profile!.id,
        type,
        title: title.trim(),
        description: description.trim(),
        attachments: [],
      })
      .select()
      .single();

    if (insertError || !inserted) {
      showToast(`Error: ${insertError?.message || 'Failed to submit'}`, 'error');
      setSubmitting(false);
      return;
    }

    // Upload files if any
    if (files.length > 0) {
      const urls = await uploadFiles(inserted.id);
      if (urls.length > 0) {
        await supabase
          .from('feedback')
          .update({ attachments: urls })
          .eq('id', inserted.id);
      }
    }

    showToast('Feedback submitted! Thank you.', 'success');
    setTitle('');
    setDescription('');
    setFiles([]);
    setType('bug');
    mutate(['my-feedback', profile!.id]);
    setSubmitting(false);
  };

  const typeMeta = FEEDBACK_TYPES.find((t) => t.value === type)!;

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Feedback</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Report bugs, request features, or share ideas</p>
      </div>

      {/* Submission Form */}
      <form onSubmit={handleSubmit} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-4 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Send className="w-4 h-4 text-minerva-600" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Submit Feedback</h2>
        </div>

        {/* Type Selector */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">Type</label>
          <div className="flex gap-2">
            {FEEDBACK_TYPES.map((ft) => {
              const Icon = ft.icon;
              return (
                <button
                  key={ft.value}
                  type="button"
                  onClick={() => setType(ft.value)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                    type === ft.value ? ft.color : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {ft.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === 'bug' ? 'e.g. Scores not loading on home page' : 'e.g. Add dark mode to leaderboard'}
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={type === 'bug' ? 'What happened? What did you expect?' : 'Describe your idea in detail...'}
            rows={4}
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] resize-none"
            required
          />
        </div>

        {/* File Attachments */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            Attachments <span className="text-[var(--text-faint)]">(optional, max {MAX_FILES} files, 10MB each)</span>
          </label>

          {files.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {files.map((file, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-[var(--bg-subtle)] rounded-lg px-3 py-2 text-xs">
                  <Paperclip className="w-3 h-3 text-[var(--text-faint)] flex-shrink-0" />
                  <span className="text-[var(--text-primary)] truncate flex-1">{file.name}</span>
                  <span className="text-[var(--text-faint)]">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
                  <button type="button" onClick={() => removeFile(idx)} className="text-[var(--text-faint)] hover:text-red-500">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {files.length < MAX_FILES && (
            <label className="flex items-center gap-2 cursor-pointer text-sm text-minerva-600 hover:text-minerva-700 transition-colors">
              <Paperclip className="w-4 h-4" />
              <span>Add screenshot or video</span>
              <input
                type="file"
                accept={ACCEPTED_TYPES}
                onChange={handleFileChange}
                className="hidden"
                multiple
              />
            </label>
          )}

          {fileError && (
            <p className="text-xs text-red-500 mt-1">{fileError}</p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-minerva-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-minerva-700 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit Feedback'}
        </button>
      </form>

      {/* My Submissions */}
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">
          My Submissions {myFeedback && myFeedback.length > 0 && `(${myFeedback.length})`}
        </h2>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !myFeedback || myFeedback.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-10 h-10 text-[var(--text-faint)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-muted)]">No feedback submitted yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {myFeedback.map((fb) => {
              const ftMeta = FEEDBACK_TYPES.find((t) => t.value === fb.type);
              const isExpanded = expandedId === fb.id;
              return (
                <div key={fb.id} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : fb.id)}
                    className="w-full flex items-center gap-3 p-3 text-left"
                  >
                    <span className="text-lg flex-shrink-0">
                      {ftMeta && <ftMeta.icon className={`w-4 h-4 ${ftMeta.color.split(' ')[1]}`} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{fb.title}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {new Date(fb.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[fb.status]}`}>
                      {STATUS_LABELS[fb.status]}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-[var(--text-faint)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-faint)]" />}
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2 border-t border-[var(--border-light)] pt-2">
                      <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{fb.description}</p>

                      {fb.attachments && fb.attachments.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {fb.attachments.map((url, idx) => (
                            <a
                              key={idx}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-minerva-600 hover:underline"
                            >
                              <Paperclip className="w-3 h-3" />
                              Attachment {idx + 1}
                            </a>
                          ))}
                        </div>
                      )}

                      {fb.admin_response && (
                        <div className="bg-minerva-50 rounded-lg p-2.5 mt-2">
                          <p className="text-[10px] font-medium text-minerva-600 mb-1">Admin Response</p>
                          <p className="text-sm text-[var(--text-primary)]">{fb.admin_response}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
