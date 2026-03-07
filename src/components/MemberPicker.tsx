'use client';

import { useState } from 'react';
import { Search, Check, Users } from 'lucide-react';
import type { User } from '@/types/database';

export interface MemberPickerProps {
  members: User[];
  excludeIds: string[];
  disabledIds?: string[];
  disabledReason?: string;
  onConfirm: (selectedIds: string[]) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function MemberPicker({
  members,
  excludeIds,
  disabledIds = [],
  disabledReason = 'Already has tee time',
  onConfirm,
  onCancel,
  loading = false,
}: MemberPickerProps) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const availableMembers = members.filter((m) => !excludeIds.includes(m.id));

  const filteredMembers = availableMembers.filter(
    (m) =>
      m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleMember = (id: string) => {
    if (disabledIds.includes(id)) return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectableCount = selectedIds.filter((id) => !disabledIds.includes(id)).length;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
        <input
          type="text"
          placeholder="Search members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
        />
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {filteredMembers.length === 0 && (
          <p className="text-sm text-[var(--text-muted)] text-center py-4">
            No members found.
          </p>
        )}
        {filteredMembers.map((member) => {
          const isDisabled = disabledIds.includes(member.id);
          const isSelected = selectedIds.includes(member.id);
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => toggleMember(member.id)}
              disabled={isDisabled}
              className={`w-full flex items-center justify-between rounded-xl p-3 border transition-colors text-left ${
                isDisabled
                  ? 'border-[var(--border-light)] opacity-50 cursor-not-allowed bg-[var(--bg-subtle)]'
                  : isSelected
                  ? 'border-minerva-300 bg-minerva-50'
                  : 'border-[var(--border-light)] hover:border-minerva-200 bg-[var(--bg-card)]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[var(--bg-subtle)] rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-[var(--text-muted)]">
                    {(member.full_name || member.email || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {member.full_name || 'Unnamed'}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {isDisabled ? disabledReason : member.email}
                  </p>
                </div>
              </div>
              {isDisabled ? (
                <span className="text-xs text-[var(--text-faint)] bg-[var(--bg-page)] px-2 py-0.5 rounded-full">
                  Exists
                </span>
              ) : isSelected ? (
                <div className="w-6 h-6 bg-minerva-600 rounded-full flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
              ) : (
                <div className="w-6 h-6 border-2 border-[var(--border-default)] rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 text-[var(--text-muted)] text-sm py-3 rounded-xl border border-[var(--border-default)] hover:bg-[var(--bg-subtle)] transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(selectedIds)}
          disabled={selectableCount === 0 || loading}
          className="flex-1 flex items-center justify-center gap-2 bg-minerva-600 text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-minerva-700 transition-colors disabled:opacity-50"
        >
          <Users className="w-4 h-4" />
          {loading
            ? 'Copying...'
            : `Copy to ${selectableCount} member${selectableCount !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}
