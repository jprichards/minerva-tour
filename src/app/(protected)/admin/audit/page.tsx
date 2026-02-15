'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { ArrowLeft, Search, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import type { AuditLog } from '@/types/database';

const actionTypes = [
  'all',
  'login',
  'score_submission',
  'score_edit',
  'score_delete',
  'course_add',
  'course_edit',
  'course_delete',
  'user_role_change',
  'user_provision',
  'handicap_update',
  'profile_update',
  'profile_picture_upload',
];

export default function AdminAuditPage() {
  const { isAdmin, loading: userLoading } = useUser();
  const router = useRouter();
  const supabase = createClient();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    if (!userLoading && !isAdmin) router.push('/home');
  }, [isAdmin, userLoading, router]);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      let query = supabase
        .from('audit_logs')
        .select('*, user:users(full_name, email)')
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (filterType !== 'all') {
        query = query.eq('action_type', filterType);
      }

      const { data, error } = await query;
      if (error) console.error('Error fetching audit logs:', error);
      setLogs(data || []);
      setLoading(false);
    };

    fetchLogs();
  }, [filterType, page, supabase, isAdmin, userLoading]);

  const filteredLogs = logs.filter((log) => {
    if (!search) return true;
    const lower = search.toLowerCase();
    return (
      log.action_type.toLowerCase().includes(lower) ||
      log.entity_type?.toLowerCase().includes(lower) ||
      log.user?.full_name?.toLowerCase().includes(lower) ||
      log.user?.email?.toLowerCase().includes(lower) ||
      JSON.stringify(log.details).toLowerCase().includes(lower)
    );
  });

  const getActionColor = (type: string) => {
    if (type.includes('delete')) return 'text-red-600 bg-red-50';
    if (type.includes('edit') || type.includes('update') || type.includes('change')) return 'text-amber-600 bg-amber-50';
    if (type.includes('add') || type.includes('submission') || type.includes('provision')) return 'text-emerald-600 bg-emerald-50';
    if (type === 'login') return 'text-blue-600 bg-blue-50';
    return 'text-gray-600 bg-gray-50';
  };

  if (!isAdmin) return null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Audit Logs</h1>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search logs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
        {actionTypes.map((type) => (
          <button
            key={type}
            onClick={() => { setFilterType(type); setPage(0); }}
            className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
              filterType === type
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {type === 'all' ? 'All' : type.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Logs */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredLogs.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-8">No logs found.</p>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map((log) => (
            <div key={log.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                className="w-full p-3 flex items-start gap-3 text-left"
              >
                <span className={`text-xs font-medium px-2 py-1 rounded-lg flex-shrink-0 mt-0.5 ${getActionColor(log.action_type)}`}>
                  {log.action_type.replace(/_/g, ' ')}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">
                    {log.user?.full_name || log.user?.email || 'System'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(log.created_at).toLocaleString()}
                    {log.entity_type && ` · ${log.entity_type}`}
                  </p>
                </div>
                {expandedLog === log.id ? (
                  <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                )}
              </button>

              {expandedLog === log.id && log.details && (
                <div className="px-3 pb-3 border-t border-gray-50 pt-2">
                  <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                  {log.entity_id && (
                    <p className="text-xs text-gray-400 mt-2">Entity ID: {log.entity_id}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="text-sm text-emerald-600 font-medium disabled:text-gray-300"
        >
          Previous
        </button>
        <span className="text-xs text-gray-400">Page {page + 1}</span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={logs.length < pageSize}
          className="text-sm text-emerald-600 font-medium disabled:text-gray-300"
        >
          Next
        </button>
      </div>
    </div>
  );
}
