'use client';

import { useState, Suspense } from 'react';
import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { Plus, Search, Clock, CheckCircle, Target, Link2, User as UserIcon } from 'lucide-react';
import { formatNetScore } from '@/lib/scoring';
import type { Score } from '@/types/database';

type TabType = 'completed' | 'teetimes';

export default function ScoresPage() {
  return (
    <Suspense fallback={<div className="p-4"><div className="h-6 bg-gray-200 rounded animate-pulse w-32" /></div>}>
      <ScoresContent />
    </Suspense>
  );
}

function ScoresContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabType) || 'completed';
  const playerFilter = searchParams.get('player') || '';
  const [tab, setTab] = useState<TabType>(initialTab);
  const [search, setSearch] = useState('');
  const [filterMyRounds, setFilterMyRounds] = useState(!!playerFilter);
  const { profile } = useUser();
  const supabase = createClient();

  const { data: scores = [], isLoading: loading } = useSWR(
    ['scores', tab, profile?.id ?? null],
    async () => {
      let query = supabase
        .from('scores')
        .select('*, course:courses(*), user:users!user_id(full_name, email, profile_picture_url), event:events(*)')
        .order('created_at', { ascending: false });

      if (tab === 'teetimes') {
        query = query.eq('is_complete', false);
      } else {
        query = query.eq('is_complete', true);
      }

      const { data, error } = await query;
      if (error) console.error('Error fetching scores:', error.message, error.details, error.hint);

      // Sort tee times: current user first, then by tee_time desc
      let results = data || [];
      if (tab === 'teetimes' && profile?.id) {
        results = results.sort((a, b) => {
          if (a.user_id === profile.id && b.user_id !== profile.id) return -1;
          if (a.user_id !== profile.id && b.user_id === profile.id) return 1;
          return new Date(b.tee_time || b.created_at).getTime() - new Date(a.tee_time || a.created_at).getTime();
        });
      }

      return results;
    },
    { revalidateOnFocus: true, dedupingInterval: 5000 }
  );

  const filtered = scores.filter((s) => {
    // Apply "My Rounds" filter
    if (filterMyRounds && profile?.id && s.user_id !== profile.id) return false;

    if (!search) return true;
    const lower = search.toLowerCase();
    return (
      s.course?.course_name?.toLowerCase().includes(lower) ||
      s.course?.tee_name?.toLowerCase().includes(lower) ||
      s.user?.full_name?.toLowerCase().includes(lower) ||
      s.user?.email?.toLowerCase().includes(lower)
    );
  });

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Scores</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/scores/bridge"
            className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-200 transition-colors"
          >
            <Link2 className="w-4 h-4" />
            Bridge
          </Link>
          <Link
            href="/scores/add"
            className="flex items-center gap-1.5 bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setTab('completed')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === 'completed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          Completed
        </button>
        <button
          onClick={() => setTab('teetimes')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === 'teetimes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          <Clock className="w-4 h-4" />
          Tee Times
        </button>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by course, player..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <button
          onClick={() => setFilterMyRounds(!filterMyRounds)}
          className={`px-3 py-2 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap ${
            filterMyRounds
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          My Rounds
        </button>
      </div>

      {/* Score List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {tab === 'teetimes' ? 'No tee times yet.' : 'No completed rounds yet.'}
          </p>
          <Link href="/scores/add" className="text-emerald-600 text-sm font-medium mt-2 inline-block">
            {tab === 'teetimes' ? 'Add a tee time' : 'Submit a score'}
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((score) => (
            <Link
              key={score.id}
              href={`/scores/${score.id}`}
              className="block bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Profile Picture */}
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden mt-0.5">
                    {score.user?.profile_picture_url ? (
                      <Image
                        src={score.user.profile_picture_url}
                        alt={score.user?.full_name || 'Player'}
                        width={36}
                        height={36}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UserIcon className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {score.course?.course_name || 'Unknown Course'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {score.course?.tee_name} &middot; {score.course?.type.replace(/_/g, ' ')}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">
                      {score.user?.full_name || score.user?.email || 'Unknown'}
                    </span>
                    {(score.event?.start_date || score.tee_time) && (
                      <>
                        <span className="text-xs text-gray-300">&middot;</span>
                        <span className="text-xs text-gray-400">
                          {new Date((score.event?.start_date ? score.event.start_date + 'T00:00:00' : score.tee_time)!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {score.tee_time && (
                            <> &middot; {new Date(score.tee_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
                          )}
                        </span>
                      </>
                    )}
                  </div>
                  </div>
                </div>
                <div className="text-right ml-3">
                  {score.is_complete && score.gross_score ? (
                    <>
                      <p className="text-lg font-bold text-gray-900">{score.gross_score}</p>
                      {score.net_strokes_over_par != null && (
                        <p className={`text-xs font-semibold ${
                          score.net_strokes_over_par < 0 ? 'text-red-600' :
                          score.net_strokes_over_par === 0 ? 'text-emerald-600' :
                          'text-gray-500'
                        }`}>
                          Net {formatNetScore(score.net_strokes_over_par)}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">{score.holes_played}h</p>
                    </>
                  ) : (
                    <span className="inline-block bg-amber-100 text-amber-700 text-xs font-medium px-2 py-1 rounded-lg">
                      Pending
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
