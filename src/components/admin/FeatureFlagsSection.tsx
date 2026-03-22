'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { Flag, ChevronDown, ChevronUp, Loader2, Users, Shield } from 'lucide-react';
import type { FeatureFlag, User, UserRole } from '@/types/database';

const ALL_ROLES: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'playing_guest', label: 'Playing Guest' },
  { value: 'non_playing_guest', label: 'Non-Playing Guest' },
  { value: 'inactive', label: 'Inactive' },
];

interface FlagCardProps {
  flag: FeatureFlag;
  users: User[];
  onToggle: (key: string, enabled: boolean) => void;
  onUpdateTargeting: (key: string, userIds: string[], roles: string[]) => void;
}

function FlagCard({ flag, users, onToggle, onUpdateTargeting }: FlagCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [targetUserIds, setTargetUserIds] = useState<string[]>(flag.target_user_ids);
  const [targetRoles, setTargetRoles] = useState<string[]>(flag.target_roles);
  const [dirty, setDirty] = useState(false);

  const toggleUser = (userId: string) => {
    setTargetUserIds((prev) => {
      const next = prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId];
      setDirty(true);
      return next;
    });
  };

  const toggleRole = (role: string) => {
    setTargetRoles((prev) => {
      const next = prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role];
      setDirty(true);
      return next;
    });
  };

  const handleSaveTargeting = () => {
    onUpdateTargeting(flag.key, targetUserIds, targetRoles);
    setDirty(false);
  };

  const activeMembers = users.filter((u) => u.role !== 'inactive' && u.role !== 'non_playing_guest');

  const targetingSummary = () => {
    const parts: string[] = [];
    if (targetUserIds.length > 0) parts.push(`${targetUserIds.length} user${targetUserIds.length > 1 ? 's' : ''}`);
    if (targetRoles.length > 0) parts.push(targetRoles.join(', '));
    if (parts.length === 0) return 'Everyone';
    return parts.join(' + ');
  };

  return (
    <div className="border border-[var(--border-light)] rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{flag.key}</p>
          {flag.description && (
            <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{flag.description}</p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={flag.enabled}
          onClick={() => onToggle(flag.key, !flag.enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            flag.enabled ? 'bg-minerva-600' : 'bg-gray-200'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            flag.enabled ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-faint)]">
          Target: {targetingSummary()}
        </span>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-minerva-600 font-medium"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? 'Hide' : 'Targeting'}
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 pt-2 border-t border-[var(--border-light)]">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Shield className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span className="text-xs font-medium text-[var(--text-secondary)]">Roles</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.map((role) => (
                <label key={role.value} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={targetRoles.includes(role.value)}
                    onChange={() => toggleRole(role.value)}
                    className="w-4 h-4 rounded border-gray-300 text-minerva-600 focus:ring-minerva-500"
                  />
                  <span className="text-xs text-[var(--text-primary)]">{role.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span className="text-xs font-medium text-[var(--text-secondary)]">Specific Users</span>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {activeMembers.map((user) => (
                <label key={user.id} className="flex items-center gap-2 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={targetUserIds.includes(user.id)}
                    onChange={() => toggleUser(user.id)}
                    className="w-4 h-4 rounded border-gray-300 text-minerva-600 focus:ring-minerva-500"
                  />
                  <span className="text-xs text-[var(--text-primary)]">{user.full_name || user.email || user.id}</span>
                  <span className="text-xs text-[var(--text-faint)]">({user.role})</span>
                </label>
              ))}
            </div>
          </div>

          {dirty && (
            <button
              type="button"
              onClick={handleSaveTargeting}
              className="w-full py-2 bg-minerva-600 text-white text-xs font-semibold rounded-lg hover:bg-minerva-700 transition-colors"
            >
              Save Targeting
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function FeatureFlagsSection() {
  const supabase = createClient();
  const { showToast } = useToast();

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingFlags, setLoadingFlags] = useState(true);

  const fetchFlags = useCallback(async () => {
    const { data } = await supabase
      .from('feature_flags')
      .select('*')
      .order('key');
    setFlags((data ?? []) as unknown as FeatureFlag[]);
    setLoadingFlags(false);
  }, [supabase]);

  useEffect(() => {
    fetchFlags();

    const fetchUsers = async () => {
      const { data } = await supabase
        .from('users')
        .select('id, full_name, email, role')
        .order('full_name');
      setUsers((data ?? []) as User[]);
    };
    fetchUsers();
  }, [supabase, fetchFlags]);

  const handleToggle = async (key: string, enabled: boolean) => {
    setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled } : f)));

    const { error } = await supabase
      .from('feature_flags')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('key', key);

    if (error) {
      showToast('Failed to toggle flag.', 'error');
      fetchFlags();
      return;
    }

    logAuditEvent('feature_flag_toggle', 'feature_flags', undefined, { key, enabled });
    showToast(`Flag "${key}" ${enabled ? 'enabled' : 'disabled'}.`, 'success');
  };

  const handleUpdateTargeting = async (key: string, userIds: string[], roles: string[]) => {
    const { error } = await supabase
      .from('feature_flags')
      .update({
        target_user_ids: userIds,
        target_roles: roles,
        updated_at: new Date().toISOString(),
      })
      .eq('key', key);

    if (error) {
      showToast('Failed to update targeting.', 'error');
      return;
    }

    setFlags((prev) =>
      prev.map((f) => (f.key === key ? { ...f, target_user_ids: userIds, target_roles: roles } : f))
    );
    logAuditEvent('feature_flag_update', 'feature_flags', undefined, { key, target_user_ids: userIds, target_roles: roles });
    showToast('Targeting updated.', 'success');
  };

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flag className="w-4 h-4 text-emerald-600" />
          <label className="text-sm font-medium text-[var(--text-primary)]">Feature Flags</label>
        </div>
        <span className="text-xs text-[var(--text-faint)]">{flags.length} flag{flags.length !== 1 ? 's' : ''}</span>
      </div>

      <p className="text-xs text-[var(--text-faint)]">
        Control feature rollouts by toggling flags on/off and targeting specific users or roles.
      </p>

      {loadingFlags ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : (
        <div className="space-y-3">
          {flags.length === 0 && (
            <p className="text-xs text-[var(--text-muted)] text-center py-4">No feature flags yet. Flags are created in code during development.</p>
          )}

          {flags.map((flag) => (
            <FlagCard
              key={flag.key}
              flag={flag}
              users={users}
              onToggle={handleToggle}
              onUpdateTargeting={handleUpdateTargeting}
            />
          ))}
        </div>
      )}

    </div>
  );
}
