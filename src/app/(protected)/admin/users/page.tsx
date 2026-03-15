'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { ArrowLeft, Search, Save, TrendingUp, Camera } from 'lucide-react';
import Avatar from '@/components/Avatar';
import type { User, UserRole } from '@/types/database';

const roles: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'playing_guest', label: 'Playing Guest' },
  { value: 'non_playing_guest', label: 'Non-Playing Guest' },
  { value: 'inactive', label: 'Inactive' },
];

export default function AdminUsersPage() {
  const { isAdmin, loading: userLoading } = useUser();
  const router = useRouter();
  const { showToast } = useToast();
  const supabase = createClient();

  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('member');
  const [editHandicap, setEditHandicap] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!userLoading && !isAdmin) router.push('/home');
  }, [isAdmin, userLoading, router]);

  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase
        .from('users')
        .select('*')
        .order('full_name');
      setUsers(data || []);
      setLoading(false);
    };

    fetchUsers();
  }, [supabase]);

  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const lower = search.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(lower) ||
      u.email?.toLowerCase().includes(lower) ||
      u.role.toLowerCase().includes(lower)
    );
  });

  const handleStartEdit = (user: User) => {
    setEditingUser(user.id);
    setEditRole(user.role);
    setEditHandicap(user.handicap_index != null ? String(user.handicap_index) : '');
  };

  const handleSave = async (user: User) => {
    const handicapNum = editHandicap ? parseFloat(editHandicap) : null;

    const { error } = await supabase
      .from('users')
      .update({
        role: editRole,
        handicap_index: handicapNum,
      })
      .eq('id', user.id);

    if (error) {
      showToast('Failed to update user.', 'error');
      return;
    }

    // If handicap changed, add to history
    if (handicapNum != null && handicapNum !== user.handicap_index) {
      await supabase.from('handicap_history').insert({
        user_id: user.id,
        handicap_index: handicapNum,
        effective_date: new Date().toISOString().split('T')[0],
        source: 'manual',
      });

      await logAuditEvent('handicap_update', 'user', user.id, {
        before: user.handicap_index,
        after: handicapNum,
      });
    }

    if (editRole !== user.role) {
      await logAuditEvent('user_role_change', 'user', user.id, {
        before: user.role,
        after: editRole,
      });
    }

    showToast('User updated!');
    setEditingUser(null);

    // Refresh
    const { data } = await supabase.from('users').select('*').order('full_name');
    setUsers(data || []);
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`Delete ${user.full_name || user.email}? This cannot be undone.`)) return;

    const { error } = await supabase.from('users').delete().eq('id', user.id);
    if (error) {
      showToast('Failed to delete user.', 'error');
      return;
    }

    await logAuditEvent('user_delete', 'user', user.id, {
      full_name: user.full_name,
      email: user.email,
      role: user.role,
    });

    showToast('User deleted.');
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
  };

  const handlePhotoUpload = async (user: User, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(user.id);
    const ext = file.name.split('.').pop();
    const filePath = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('profile-pictures')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      showToast('Failed to upload photo.', 'error');
      setUploadingPhoto(null);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('profile-pictures')
      .getPublicUrl(filePath);

    const { error: updateError } = await supabase
      .from('users')
      .update({ profile_picture_url: publicUrl })
      .eq('id', user.id);

    if (updateError) {
      showToast('Failed to update profile picture.', 'error');
    } else {
      await logAuditEvent('profile_picture_upload', 'user', user.id, {
        target_user: user.full_name || user.email,
        uploaded_by: 'admin',
      });
      showToast('Profile picture updated!');
      setUsers((prev) =>
        prev.map((u) => u.id === user.id ? { ...u, profile_picture_url: publicUrl } : u)
      );
    }
    setUploadingPhoto(null);
  };

  if (!isAdmin) return null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">User Management</h1>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
        />
      </div>

      <p className="text-xs text-[var(--text-faint)]">{filteredUsers.length} users</p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredUsers.map((user) => (
            <div key={user.id} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative flex-shrink-0">
                    <Avatar
                      src={user.profile_picture_url}
                      name={user.full_name || user.email}
                      className="w-10 h-10 bg-[var(--bg-subtle)]"
                      textClassName="text-sm font-bold text-[var(--text-muted)]"
                    />
                    <label className="absolute -bottom-1 -right-1 w-5 h-5 bg-minerva-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-minerva-700 transition-colors">
                      <Camera className="w-3 h-3 text-white" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handlePhotoUpload(user, e)}
                        disabled={uploadingPhoto === user.id}
                      />
                    </label>
                    {uploadingPhoto === user.id && (
                      <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {user.full_name || 'Unnamed'}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <span className={`text-xs font-medium px-2 py-1 rounded-lg ${
                    user.role === 'admin' ? 'bg-red-100 text-red-700' :
                    user.role === 'member' ? 'bg-minerva-100 text-minerva-700' :
                    user.role === 'playing_guest' ? 'bg-blue-100 text-blue-700' :
                    user.role === 'inactive' ? 'bg-gray-100 text-gray-500' :
                    'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                  }`}>
                    {user.role.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              {/* Handicap */}
              <div className="flex items-center gap-2 mt-2">
                <TrendingUp className="w-3 h-3 text-[var(--text-faint)]" />
                <span className="text-xs text-[var(--text-muted)]">
                  Handicap: {user.handicap_index != null ? user.handicap_index : 'Not set'}
                </span>
              </div>

              {/* Edit mode */}
              {editingUser === user.id ? (
                <div className="mt-3 space-y-3 border-t border-[var(--border-light)] pt-3">
                  <div>
                    <label className="text-xs text-[var(--text-muted)] font-medium">Role</label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as UserRole)}
                      className="w-full mt-1 rounded-lg border bg-[var(--input-bg)] border-[var(--input-border)] px-3 py-2 text-sm"
                    >
                      {roles.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] font-medium">Handicap Index</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="54"
                      value={editHandicap}
                      onChange={(e) => setEditHandicap(e.target.value)}
                      placeholder="e.g. 15.3"
                      className="w-full mt-1 rounded-lg border bg-[var(--input-bg)] border-[var(--input-border)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSave(user)}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-minerva-600 text-white rounded-lg px-3 py-2 text-sm font-medium"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save
                    </button>
                    <button
                      onClick={() => setEditingUser(null)}
                      className="flex-1 bg-[var(--bg-subtle)] text-[var(--text-muted)] rounded-lg px-3 py-2 text-sm font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleStartEdit(user)}
                    className="text-xs text-minerva-600 font-medium"
                  >
                    Edit
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => handleDelete(user)}
                    className="text-xs text-red-500 font-medium"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
