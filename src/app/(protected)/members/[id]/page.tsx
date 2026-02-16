'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, TrendingUp, Trophy, Target, Calendar, BarChart3 } from 'lucide-react';
import { formatNetScore } from '@/lib/scoring';
import TrophyCase from '@/components/TrophyCase';
import type { User, Score, HandicapHistory, Trophy as TrophyType, SeasonFinish } from '@/types/database';

export default function MemberProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [member, setMember] = useState<User | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [handicapHistory, setHandicapHistory] = useState<HandicapHistory[]>([]);
  const [trophies, setTrophies] = useState<TrophyType[]>([]);
  const [seasonFinishes, setSeasonFinishes] = useState<SeasonFinish[]>([]);
  const [stats, setStats] = useState({
    totalRounds: 0,
    avgNet: 0,
    bestNet: null as number | null,
    worstNet: null as number | null,
    coursesPlayed: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data: user } = await supabase.from('users').select('*').eq('id', id).single();
      setMember(user);

      const { data: scoresData } = await supabase
        .from('scores')
        .select('*, course:courses(course_name, tee_name, par)')
        .eq('user_id', id)
        .eq('is_complete', true)
        .not('net_strokes_over_par', 'is', null)
        .order('created_at', { ascending: false });
      setScores(scoresData || []);

      if (scoresData && scoresData.length > 0) {
        const nets = scoresData.map((s) => s.net_strokes_over_par!);
        const uniqueCourses = new Set(scoresData.map((s) => s.course_id));
        setStats({
          totalRounds: scoresData.length,
          avgNet: Math.round((nets.reduce((a, b) => a + b, 0) / nets.length) * 10) / 10,
          bestNet: Math.min(...nets),
          worstNet: Math.max(...nets),
          coursesPlayed: uniqueCourses.size,
        });
      }

      const { data: history } = await supabase
        .from('handicap_history')
        .select('*')
        .eq('user_id', id)
        .order('effective_date', { ascending: false });
      setHandicapHistory(history || []);

      // Fetch trophies
      const { data: trophyData } = await supabase
        .from('trophies')
        .select('*')
        .eq('user_id', id)
        .order('year', { ascending: false });
      setTrophies(trophyData || []);

      // Fetch season finishes
      const { data: finishData } = await supabase
        .from('season_finishes')
        .select('*')
        .eq('user_id', id)
        .order('year', { ascending: false });
      setSeasonFinishes(finishData || []);

      setLoading(false);
    };
    fetchData();
  }, [id, supabase]);

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-6 bg-gray-200 rounded animate-pulse w-32" />
        <div className="h-40 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!member) {
    return <div className="p-4 text-center text-gray-500">Member not found.</div>;
  }

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center overflow-hidden">
            {member.profile_picture_url ? (
              <img src={member.profile_picture_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg font-bold text-emerald-600">
                {(member.full_name || '?')[0].toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{member.full_name || 'Unnamed'}</h1>
            <p className="text-xs text-gray-500 capitalize">{member.role.replace(/_/g, ' ')}</p>
          </div>
        </div>
      </div>

      {/* Handicap */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-4 text-white flex items-center justify-between">
        <div>
          <p className="text-xs text-emerald-200 uppercase tracking-wide">Handicap</p>
          <p className="text-3xl font-bold mt-0.5">{member.handicap_index ?? '--'}</p>
        </div>
        {member.ghin_number && (
          <div className="text-right">
            <p className="text-xs text-emerald-200">GHIN</p>
            <p className="text-base font-semibold">{member.ghin_number}</p>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center">
          <Target className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
          <p className="text-lg font-bold text-gray-900">{stats.totalRounds}</p>
          <p className="text-xs text-gray-500">Rounds</p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center">
          <TrendingUp className="w-5 h-5 text-blue-600 mx-auto mb-1" />
          <p className="text-lg font-bold text-gray-900">
            {stats.avgNet !== 0 ? (stats.avgNet > 0 ? `+${stats.avgNet}` : stats.avgNet) : '--'}
          </p>
          <p className="text-xs text-gray-500">Avg Net</p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center">
          <Trophy className="w-5 h-5 text-yellow-600 mx-auto mb-1" />
          <p className="text-lg font-bold text-gray-900">
            {stats.bestNet != null ? formatNetScore(stats.bestNet) : '--'}
          </p>
          <p className="text-xs text-gray-500">Best Net</p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center">
          <BarChart3 className="w-5 h-5 text-red-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-gray-900">
            {stats.worstNet != null ? formatNetScore(stats.worstNet) : '--'}
          </p>
          <p className="text-xs text-gray-500">Worst Net</p>
        </div>
      </div>

      {/* Trophy Case */}
      <TrophyCase trophies={trophies} seasonFinishes={seasonFinishes} />

      {/* Recent Scores */}
      {scores.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-3">Recent Rounds</h3>
          <div className="space-y-2">
            {scores.slice(0, 10).map((score) => (
              <Link
                key={score.id}
                href={`/scores/${score.id}`}
                className="flex items-center justify-between bg-white rounded-xl p-3 border border-gray-100 shadow-sm"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{score.course?.course_name}</p>
                  <p className="text-xs text-gray-500">{score.course?.tee_name} &middot; {score.holes_played}h &middot; {new Date(score.created_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{score.gross_score}</p>
                  <p className={`text-xs font-medium ${
                    (score.net_strokes_over_par ?? 0) < 0 ? 'text-red-600' :
                    (score.net_strokes_over_par ?? 0) === 0 ? 'text-emerald-600' : 'text-gray-500'
                  }`}>
                    Net {score.net_strokes_over_par != null ? formatNetScore(score.net_strokes_over_par) : '-'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Handicap History */}
      {handicapHistory.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-3">Handicap History</h3>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {handicapHistory.map((h, idx) => (
              <div key={h.id} className={`flex items-center justify-between px-4 py-3 ${idx < handicapHistory.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <p className="text-sm text-gray-700">{new Date(h.effective_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</p>
                </div>
                <p className="text-sm font-semibold text-gray-900">{h.handicap_index}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Link
        href={`/stats/${id}`}
        className="block text-center text-sm text-emerald-600 font-medium py-2"
      >
        View Full Stats &rarr;
      </Link>
    </div>
  );
}
