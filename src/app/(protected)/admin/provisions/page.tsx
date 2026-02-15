'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { ArrowLeft, Plus, UserPlus, CheckCircle, Clock, Trash2 } from 'lucide-react';
import type { UserProvision, UserRole } from '@/types/database';

const roles: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'playing_guest', label: 'Playing Guest' },
];

export default function AdminProvisionsPage() {
  const { isAdmin, loading: userLoading } = useUser();
  const router = useRouter();
  const { showToast } = useToast();
  const supabase = createClient();

  const [provisions, setProvisions] = useState<UserProvision[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  // Single add
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('member');

  // Bulk add
  const [bulkEmails, setBulkEmails] = useState('');
  const [bulkRole, setBulkRole] = useState<UserRole>('member');

  useEffect(() => {
    if (!userLoading && !isAdmin) router.push('/home');
  }, [isAdmin, userLoading, router]);

  useEffect(() => {
    const fetchProvisions = async () => {
      const { data } = await supabase
        .from('user_provisions')
        .select('*')
        .order('created_at', { ascending: false });
      setProvisions(data || []);
      setLoading(false);
    };

    fetchProvisions();
  }, [supabase]);

  const handleAddSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('user_provisions')
      .insert({
        email: email.trim().toLowerCase(),
        role,
        provisioned_by: user?.id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        showToast('This email is already provisioned.', 'error');
      } else {
        showToast(error.message, 'error');
      }
      return;
    }

    await logAuditEvent('user_provision', 'user_provision', data.id, {
      email: email.trim().toLowerCase(),
      role,
    });

    showToast('User provisioned!');
    setEmail('');
    setShowAdd(false);

    // Refresh
    const { data: updated } = await supabase.from('user_provisions').select('*').order('created_at', { ascending: false });
    setProvisions(updated || []);
  };

  const handleBulkAdd = async () => {
    const emails = bulkEmails
      .split(/[,\n]/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e && e.includes('@'));

    if (emails.length === 0) {
      showToast('No valid emails found.', 'error');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    let added = 0;
    for (const em of emails) {
      const { error } = await supabase
        .from('user_provisions')
        .insert({
          email: em,
          role: bulkRole,
          provisioned_by: user?.id,
        });

      if (!error) added++;
    }

    showToast(`${added} of ${emails.length} users provisioned!`);
    setBulkEmails('');
    setShowBulk(false);

    // Refresh
    const { data: updated } = await supabase.from('user_provisions').select('*').order('created_at', { ascending: false });
    setProvisions(updated || []);
  };

  const handleDelete = async (provision: UserProvision) => {
    if (provision.claimed_by) {
      showToast('Cannot delete a claimed provision.', 'error');
      return;
    }

    const { error } = await supabase.from('user_provisions').delete().eq('id', provision.id);
    if (error) {
      showToast('Failed to delete provision.', 'error');
      return;
    }

    showToast('Provision deleted.');
    setProvisions((prev) => prev.filter((p) => p.id !== provision.id));
  };

  if (!isAdmin) return null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">User Provisioning</h1>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => { setShowAdd(!showAdd); setShowBulk(false); }}
          className="flex items-center gap-1.5 bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-xl"
        >
          <Plus className="w-4 h-4" />
          Add One
        </button>
        <button
          onClick={() => { setShowBulk(!showBulk); setShowAdd(false); }}
          className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-xl"
        >
          <UserPlus className="w-4 h-4" />
          Bulk Import
        </button>
      </div>

      {/* Single Add Form */}
      {showAdd && (
        <form onSubmit={handleAddSingle} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500 font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {roles.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="w-full bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium"
          >
            Provision User
          </button>
        </form>
      )}

      {/* Bulk Add */}
      {showBulk && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500 font-medium">Emails (comma or newline separated)</label>
            <textarea
              value={bulkEmails}
              onChange={(e) => setBulkEmails(e.target.value)}
              placeholder="user1@example.com, user2@example.com"
              rows={4}
              className="w-full mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Role for all</label>
            <select
              value={bulkRole}
              onChange={(e) => setBulkRole(e.target.value as UserRole)}
              className="w-full mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {roles.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleBulkAdd}
            className="w-full bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium"
          >
            Import Users
          </button>
        </div>
      )}

      {/* Provisions List */}
      <div className="space-y-2">
        <p className="text-xs text-gray-400">{provisions.length} provisions</p>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-200 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : provisions.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">No provisions yet.</p>
        ) : (
          provisions.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {p.claimed_by ? (
                  <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                ) : (
                  <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.email}</p>
                  <p className="text-xs text-gray-500">
                    {p.role.replace(/_/g, ' ')} &middot;{' '}
                    {p.claimed_by
                      ? `Claimed ${new Date(p.claimed_at!).toLocaleDateString()}`
                      : 'Pending'}
                  </p>
                </div>
              </div>
              {!p.claimed_by && (
                <button onClick={() => handleDelete(p)} className="p-2 rounded-lg hover:bg-red-50">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
