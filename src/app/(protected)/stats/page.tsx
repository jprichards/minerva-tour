'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { formatNetScore } from '@/lib/scoring';
import { TrendingUp, Trophy, Target, BarChart3, Users, ArrowRight } from 'lucide-react';
import type { Score, User } from '@/types/database';

export default function StatsPage() {
  const { profile } = useUser();
  const supabase = createClient();

  const { data: statsData, isLoading: statsLoading } = useSWR(
    profile?.id ? ['stats', profile.id] : null,
    async () => {
      const { data: scores } = await supabase
        .from('scores')
        .select('*, course:courses(course_name, tee_name, par, type)')
        .eq('user_id', profile!.id)
        .eq('is_complete', true)
        .not('net_strokes_over_par', 'is', null)
        .order('created_at', { ascending: true });

      const { data: members } = await supabase
        .from('users')
        .select('*')
        .in('role', ['admin', 'member'])
        .order('full_name');

      return { myScores: scores || [], allMembers: members || [] };
    },
    { revalidateOnFocus: true, dedupingInterval: 5000 }
  );

  const loading = !profile?.id || statsLoading;
  const myScores = statsData?.myScores ?? [];
  const allMembers = statsData?.allMembers ?? [];

  const stats = useMemo(() => {
    if (myScores.length === 0) return null;
    const nets = myScores.map((s) => s.net_strokes_over_par!);
    const grosses = myScores.filter((s) => s.gross_score).map((s) => s.gross_score!);

    // Courses played most
    const courseCount: Record<string, { name: string; count: number }> = {};
    for (const s of myScores) {
      const name = s.course?.course_name || 'Unknown';
      if (!courseCount[name]) courseCount[name] = { name, count: 0 };
      courseCount[name].count++;
    }
    const topCourses = Object.values(courseCount).sort((a, b) => b.count - a.count).slice(0, 5);

    // Best/worst rounds
    const bestIdx = nets.indexOf(Math.min(...nets));
    const worstIdx = nets.indexOf(Math.max(...nets));

    // Scoring trends (group by month)
    const byMonth: Record<string, { nets: number[]; month: string }> = {};
    for (const s of myScores) {
      const date = new Date(s.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      if (!byMonth[key]) byMonth[key] = { nets: [], month: label };
      byMonth[key].nets.push(s.net_strokes_over_par!);
    }
    const trends = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({
        month: v.month,
        avgNet: Math.round((v.nets.reduce((a, b) => a + b, 0) / v.nets.length) * 10) / 10,
        rounds: v.nets.length,
      }));

    return {
      totalRounds: myScores.length,
      avgNet: Math.round((nets.reduce((a, b) => a + b, 0) / nets.length) * 10) / 10,
      bestNet: Math.min(...nets),
      worstNet: Math.max(...nets),
      avgGross: grosses.length > 0 ? Math.round(grosses.reduce((a, b) => a + b, 0) / grosses.length) : null,
      bestRound: myScores[bestIdx],
      worstRound: myScores[worstIdx],
      topCourses,
      trends,
      uniqueCourses: new Set(myScores.map((s) => s.course?.course_name)).size,
    };
  }, [myScores]);

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 bg-gray-200 rounded-lg animate-pulse w-32" />
        <div className="h-40 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Tour Stats</h1>

      {!stats ? (
        <div className="text-center py-12">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Play some rounds to see your stats!</p>
        </div>
      ) : (
        <>
          {/* Overview */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center">
              <Target className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-gray-900">{stats.totalRounds}</p>
              <p className="text-xs text-gray-500">Rounds Played</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center">
              <TrendingUp className="w-5 h-5 text-blue-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-gray-900">
                {stats.avgNet > 0 ? `+${stats.avgNet}` : stats.avgNet === 0 ? 'E' : stats.avgNet}
              </p>
              <p className="text-xs text-gray-500">Avg Net</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center">
              <Trophy className="w-5 h-5 text-yellow-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-gray-900">{formatNetScore(stats.bestNet)}</p>
              <p className="text-xs text-gray-500">Best Net</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center">
              <BarChart3 className="w-5 h-5 text-red-500 mx-auto mb-1" />
              <p className="text-xl font-bold text-gray-900">{formatNetScore(stats.worstNet)}</p>
              <p className="text-xs text-gray-500">Worst Net</p>
            </div>
          </div>

          {/* Best/Worst Rounds */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">Notable Rounds</h3>
            <div className="space-y-2">
              {stats.bestRound && (
                <Link href={`/scores/${stats.bestRound.id}`} className="flex items-center justify-between bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                  <div>
                    <p className="text-xs text-emerald-600 font-medium">Best Round</p>
                    <p className="text-sm font-medium text-gray-900">{stats.bestRound.course?.course_name}</p>
                    <p className="text-xs text-gray-500">{new Date(stats.bestRound.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-emerald-700">{formatNetScore(stats.bestRound.net_strokes_over_par!)}</p>
                    <p className="text-xs text-gray-500">Gross: {stats.bestRound.gross_score}</p>
                  </div>
                </Link>
              )}
              {stats.worstRound && stats.worstRound.id !== stats.bestRound?.id && (
                <Link href={`/scores/${stats.worstRound.id}`} className="flex items-center justify-between bg-red-50 rounded-xl p-3 border border-red-100">
                  <div>
                    <p className="text-xs text-red-600 font-medium">Worst Round</p>
                    <p className="text-sm font-medium text-gray-900">{stats.worstRound.course?.course_name}</p>
                    <p className="text-xs text-gray-500">{new Date(stats.worstRound.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-red-700">{formatNetScore(stats.worstRound.net_strokes_over_par!)}</p>
                    <p className="text-xs text-gray-500">Gross: {stats.worstRound.gross_score}</p>
                  </div>
                </Link>
              )}
            </div>
          </div>

          {/* Scoring Trends */}
          {stats.trends.length > 1 && (
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">Scoring Trend</h3>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-end gap-1 h-32">
                  {stats.trends.map((t, idx) => {
                    const maxVal = Math.max(...stats.trends.map((x) => Math.abs(x.avgNet)), 1);
                    const height = Math.max((Math.abs(t.avgNet) / maxVal) * 100, 10);
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center justify-end gap-1">
                        <span className="text-[10px] font-medium text-gray-600">
                          {t.avgNet > 0 ? `+${t.avgNet}` : t.avgNet}
                        </span>
                        <div
                          className={`w-full rounded-t ${t.avgNet <= 0 ? 'bg-emerald-400' : 'bg-gray-300'}`}
                          style={{ height: `${height}%` }}
                        />
                        <span className="text-[9px] text-gray-400">{t.month}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Courses Played Most */}
          {stats.topCourses.length > 0 && (
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">
                Courses Played Most ({stats.uniqueCourses} total)
              </h3>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {stats.topCourses.map((c, idx) => (
                  <div key={c.name} className={`flex items-center justify-between px-4 py-3 ${idx < stats.topCourses.length - 1 ? 'border-b border-gray-50' : ''}`}>
                    <p className="text-sm text-gray-900">{c.name}</p>
                    <span className="text-sm font-semibold text-gray-600">{c.count} round{c.count !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Head-to-Head: Link to other members */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">Compare with Members</h3>
            <div className="space-y-2">
              {allMembers.filter((m) => m.id !== profile?.id).slice(0, 5).map((m) => (
                <Link
                  key={m.id}
                  href={`/stats/${m.id}`}
                  className="flex items-center justify-between bg-white rounded-xl p-3 border border-gray-100 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-gray-600">{(m.full_name || '?')[0].toUpperCase()}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{m.full_name || 'Unnamed'}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
