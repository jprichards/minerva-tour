'use client';

import { useState, useMemo } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { ArrowLeft, Search, Edit, Save, X, ChevronDown, ChevronUp, Database } from 'lucide-react';

const TABLES = [
  { value: 'users', label: 'Users', columns: ['id', 'full_name', 'email', 'role', 'handicap_index', 'created_at'] },
  { value: 'scores', label: 'Scores', columns: ['id', 'user_id', 'course_id', 'event_id', 'gross_score', 'net_score', 'holes_played', 'is_complete', 'created_at'] },
  { value: 'courses', label: 'Courses', columns: ['id', 'course_name', 'tee_name', 'par', 'slope', 'rating', 'type', 'created_at'] },
  { value: 'events', label: 'Events', columns: ['id', 'season_id', 'event_number', 'name', 'start_date', 'end_date', 'holes', 'is_major', 'is_playoff'] },
  { value: 'seasons', label: 'Seasons', columns: ['id', 'year', 'mode', 'current_event_id', 'created_at'] },
  { value: 'tournaments', label: 'Tournaments', columns: ['id', 'name', 'season_id', 'start_date', 'end_date', 'format', 'is_active'] },
  { value: 'notifications', label: 'Notifications', columns: ['id', 'user_id', 'type', 'title', 'message', 'is_read', 'created_at'] },
  { value: 'audit_log', label: 'Audit Log', columns: ['id', 'user_id', 'action', 'entity_type', 'entity_id', 'created_at'] },
  { value: 'app_settings', label: 'App Settings', columns: ['id', 'key', 'value', 'updated_at'] },
];

const PAGE_SIZE = 25;

export default function AdminDataPage() {
  const { isAdmin, loading: userLoading } = useUser();
  const router = useRouter();
  const { showToast } = useToast();
  const supabase = createClient();
  const { mutate: globalMutate } = useSWRConfig();

  const [selectedTable, setSelectedTable] = useState('users');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const tableConfig = TABLES.find((t) => t.value === selectedTable)!;

  // Fetch data using SWR
  const { data: rows = [], isLoading, mutate } = useSWR(
    isAdmin ? ['admin-data', selectedTable, page] : null,
    async () => {
      const { data, error } = await supabase
        .from(selectedTable)
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      return data || [];
    },
    { revalidateOnFocus: false, dedupingInterval: 5000 }
  );

  // Count total rows
  const { data: totalCount = 0 } = useSWR(
    isAdmin ? ['admin-data-count', selectedTable] : null,
    async () => {
      const { count } = await supabase
        .from(selectedTable)
        .select('*', { count: 'exact', head: true });
      return count || 0;
    },
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  // Filter rows by search
  const filteredRows = useMemo(() => {
    if (!search) return rows;
    const lower = search.toLowerCase();
    return rows.filter((row: Record<string, unknown>) =>
      Object.values(row).some(
        (val) => val != null && String(val).toLowerCase().includes(lower)
      )
    );
  }, [rows, search]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleStartEdit = (row: Record<string, unknown>) => {
    setEditingRow(row.id as string);
    setEditData({ ...row });
  };

  const handleSaveEdit = async () => {
    if (!editingRow) return;

    const updateData = { ...editData };
    delete updateData.id;
    delete updateData.created_at;

    const { error } = await supabase
      .from(selectedTable)
      .update(updateData)
      .eq('id', editingRow);

    if (error) {
      showToast(`Error: ${error.message}`, 'error');
      return;
    }

    logAuditEvent('admin_edit_record', selectedTable, editingRow, { table: selectedTable });
    showToast('Record updated!', 'success');
    setEditingRow(null);
    setEditData({});
    mutate();
  };

  const handleCancelEdit = () => {
    setEditingRow(null);
    setEditData({});
  };

  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  const truncate = (str: string, max: number = 30): string =>
    str.length > max ? str.slice(0, max) + '...' : str;

  if (!isAdmin) return null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Database Viewer</h1>
      </div>

      {/* Table Selector */}
      <div className="flex gap-2">
        <select
          value={selectedTable}
          onChange={(e) => {
            setSelectedTable(e.target.value);
            setPage(0);
            setSearch('');
            setEditingRow(null);
          }}
          className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {TABLES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search records..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Row count */}
      <p className="text-xs text-gray-500">
        {totalCount} total records &middot; Page {page + 1} of {totalPages || 1}
      </p>

      {/* Data Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />)}
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="text-center py-12">
          <Database className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No records found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRows.map((row: Record<string, unknown>) => {
            const rowId = row.id as string;
            const isEditing = editingRow === rowId;
            const isExpanded = expandedRow === rowId;
            const displayColumns = tableConfig.columns.slice(0, 3);
            const extraColumns = tableConfig.columns.slice(3);

            return (
              <div
                key={rowId}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                  isEditing ? 'border-emerald-300 ring-1 ring-emerald-300' : 'border-gray-100'
                }`}
              >
                {/* Card Header: show first 3 fields */}
                <div className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 space-y-1">
                      {displayColumns.map((col) => (
                        <div key={col} className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-400 uppercase w-20 flex-shrink-0">{col.replace(/_/g, ' ')}</span>
                          {isEditing && col !== 'id' && col !== 'created_at' ? (
                            <input
                              type="text"
                              value={editData[col] != null ? String(editData[col]) : ''}
                              onChange={(e) => setEditData({ ...editData, [col]: e.target.value })}
                              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-0.5 bg-gray-50"
                            />
                          ) : (
                            <span className="text-sm text-gray-900 truncate">
                              {truncate(formatValue(row[col]))}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      {isEditing ? (
                        <>
                          <button onClick={handleSaveEdit} className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100">
                            <Save className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={handleCancelEdit} className="p-1.5 bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => handleStartEdit(row)} className="p-1.5 text-gray-400 rounded-lg hover:bg-gray-50 hover:text-gray-600">
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setExpandedRow(isExpanded ? null : rowId)}
                            className="p-1.5 text-gray-400 rounded-lg hover:bg-gray-50 hover:text-gray-600"
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {(isExpanded || isEditing) && extraColumns.length > 0 && (
                  <div className="border-t border-gray-100 px-3 py-2 bg-gray-50/50 space-y-1">
                    {extraColumns.map((col) => (
                      <div key={col} className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-400 uppercase w-20 flex-shrink-0">{col.replace(/_/g, ' ')}</span>
                        {isEditing && col !== 'id' && col !== 'created_at' ? (
                          <input
                            type="text"
                            value={editData[col] != null ? String(editData[col]) : ''}
                            onChange={(e) => setEditData({ ...editData, [col]: e.target.value })}
                            className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-0.5 bg-white"
                          />
                        ) : (
                          <span className="text-sm text-gray-700 truncate">
                            {truncate(formatValue(row[col]), 50)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
