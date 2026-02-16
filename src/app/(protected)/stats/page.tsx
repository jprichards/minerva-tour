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
        <div className="h-8 bg-[var(--bg-skeleton)] rounded-lg animate-pulse w-32" />
        <div className="h-40 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Tour Stats</h1>

      {!stats ? (
        <div className="text-center py-12">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-[var(--text-muted)] text-sm">Play some rounds to see your stats!</p>
        </div>
      ) : (
        <>
          {/* Overview */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)] text-center">
              <Target className="w-5 h-5 text-minerva-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-[var(--text-primary)]">{stats.totalRounds}</p>
              <p className="text-xs text-[var(--text-muted)]">Rounds Played</p>
            </div>
            <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)] text-center">
              <TrendingUp className="w-5 h-5 text-blue-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-[var(--text-primary)]">
                {stats.avgNet > 0 ? `+${stats.avgNet}` : stats.avgNet === 0 ? 'E' : stats.avgNet}
              </p>
              <p className="text-xs text-[var(--text-muted)]">Avg Net</p>
            </div>
            <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)] text-center">
              <Trophy className="w-5 h-5 text-yellow-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-[var(--text-primary)]">{formatNetScore(stats.bestNet)}</p>
              <p className="text-xs text-[var(--text-muted)]">Best Net</p>
            </div>
            <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)] text-center">
              <BarChart3 className="w-5 h-5 text-red-500 mx-auto mb-1" />
              <p className="text-xl font-bold text-[var(--text-primary)]">{formatNetScore(stats.worstNet)}</p>
              <p className="text-xs text-[var(--text-muted)]">Worst Net</p>
            </div>
          </div>

          {/* Best/Worst Rounds */}
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">Notable Rounds</h3>
            <div className="space-y-2">
              {stats.bestRound && (
                <Link href={`/scores/${stats.bestRound.id}`} className="flex items-center justify-between bg-green-50 rounded-xl p-3 border border-green-100">
                  <div>
                    <p className="text-xs text-green-600 font-medium">Best Round</p>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{stats.bestRound.course?.course_name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{new Date(stats.bestRound.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-700">{formatNetScore(stats.bestRound.net_strokes_over_par!)}</p>
                    <p className="text-xs text-[var(--text-muted)]">Gross: {stats.bestRound.gross_score}</p>
                  </div>
                </Link>
              )}
              {stats.worstRound && stats.worstRound.id !== stats.bestRound?.id && (
                <Link href={`/scores/${stats.worstRound.id}`} className="flex items-center justify-between bg-red-50 rounded-xl p-3 border border-red-100">
                  <div>
                    <p className="text-xs text-red-600 font-medium">Worst Round</p>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{stats.worstRound.course?.course_name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{new Date(stats.worstRound.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-red-700">{formatNetScore(stats.worstRound.net_strokes_over_par!)}</p>
                    <p className="text-xs text-[var(--text-muted)]">Gross: {stats.worstRound.gross_score}</p>
                  </div>
                </Link>
              )}
            </div>
          </div>

          {/* Scoring Trends */}
          {stats.trends.length > 1 && (
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">Scoring Trend</h3>
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-4">
                <div className="flex items-end gap-1 h-32">
                  {stats.trends.map((t, idx) => {
                    const maxVal = Math.max(...stats.trends.map((x) => Math.abs(x.avgNet)), 1);
                    const height = Math.max((Math.abs(t.avgNet) / maxVal) * 100, 10);
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center justify-end gap-1">
                        <span className="text-[10px] font-medium text-[var(--text-muted)]">
                          {t.avgNet > 0 ? `+${t.avgNet}` : t.avgNet}
                        </span>
                        <div
                          className={`w-full rounded-t ${t.avgNet <= 0 ? 'bg-green-400' : 'bg-gray-300'}`}
                          style={{ height: `${height}%` }}
                        />
                        <span className="text-[9px] text-[var(--text-faint)]">{t.month}</span>
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
              <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">
                Courses Played Most ({stats.uniqueCourses} total)
              </h3>
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden">
                {stats.topCourses.map((c, idx) => (
                  <div key={c.name} className={`flex items-center justify-between px-4 py-3 ${idx < stats.topCourses.length - 1 ? 'border-b border-[var(--border-light)]' : ''}`}>
                    <p className="text-sm text-[var(--text-primary)]">{c.name}</p>
                    <span className="text-sm font-semibold text-[var(--text-muted)]">{c.count} round{c.count !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Head-to-Head: Link to other members */}
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">Compare with Members</h3>
            <div className="space-y-2">
              {allMembers.filter((m) => m.id !== profile?.id).slice(0, 5).map((m) => (
                <Link
                  key={m.id}
                  href={`/stats/${m.id}`}
                  className="flex items-center justify-between bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[var(--bg-subtle)] rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-[var(--text-muted)]">{(m.full_name || '?')[0].toUpperCase()}</span>
                    </div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{m.full_name || 'Unnamed'}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[var(--text-faint)]" />
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
