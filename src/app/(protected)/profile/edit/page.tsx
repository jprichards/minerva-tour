'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { ArrowLeft } from 'lucide-react';

export default function EditProfilePage() {
  const { profile, loading: userLoading } = useUser();
  const router = useRouter();
  const { showToast } = useToast();
  const supabase = createClient();

  const [fullName, setFullName] = useState('');
  const [ghinNumber, setGhinNumber] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setGhinNumber(profile.ghin_number || '');
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);

    const { error } = await supabase
      .from('users')
      .update({
        full_name: fullName.trim(),
        ghin_number: ghinNumber.trim() || null,
      })
      .eq('id', profile.id);

    if (error) {
      showToast('Failed to update profile.', 'error');
      setSaving(false);
      return;
    }

    await logAuditEvent('profile_update', 'user', profile.id, {
      before: { full_name: profile.full_name, ghin_number: profile.ghin_number },
      after: { full_name: fullName, ghin_number: ghinNumber },
    });

    showToast('Profile updated!');
    router.push('/profile');
  };

  if (userLoading) {
    return (
      <div className="p-4">
        <div className="h-6 bg-[var(--bg-skeleton)] rounded animate-pulse w-32 mb-6" />
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Edit Profile</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Email</label>
          <input
            type="email"
            value={profile?.email || ''}
            readOnly
            className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm bg-[var(--bg-subtle)] text-[var(--text-muted)]"
          />
          <p className="text-xs text-[var(--text-faint)] mt-1">Email cannot be changed.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">GHIN Number</label>
          <input
            type="text"
            value={ghinNumber}
            onChange={(e) => setGhinNumber(e.target.value)}
            placeholder="Enter your GHIN number"
            className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
          />
          <p className="text-xs text-[var(--text-faint)] mt-1">
            Used to track your official USGA handicap.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Current Handicap</label>
          <input
            type="text"
            value={profile?.handicap_index != null ? String(profile.handicap_index) : 'Not set'}
            readOnly
            className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm bg-[var(--bg-subtle)] text-[var(--text-muted)]"
          />
          <p className="text-xs text-[var(--text-faint)] mt-1">
            Handicap is managed by administrators.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-minerva-600 text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-minerva-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>
    </div>
  );
}
