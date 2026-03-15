'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Trophy, Target, Calendar, BarChart3, ChevronDown } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { formatNetScore, formatGrossScore, getMaxHoles, calculatePartialPar } from '@/lib/scoring';
import { getHandicapTrend } from '@/lib/handicap-trend';
import TrophyCase from '@/components/TrophyCase';
import type { User, Score, HandicapHistory, Trophy as TrophyType, SeasonFinish } from '@/types/database';

export default function MemberProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [member, setMember] = useState<User | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [handicapHistory, setHandicapHistory] = useState<HandicapHistory[]>([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [trophies, setTrophies] = useState<TrophyType[]>([]);
  const [seasonFinishes, setSeasonFinishes] = useState<SeasonFinish[]>([]);
  const [stats, setStats] = useState({
    totalRounds: 0,
    avgNet: 0,
    bestNet: null as number | null,
    worstNet: null as number | null,
    coursesPlayed: 0,
    bestRound: null as Score | null,
    worstRound: null as Score | null,
    bestGrossRound: null as Score | null,
    worstGrossRound: null as Score | null,
    topCourses: [] as { name: string; count: number }[],
    uniqueCourses: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data: user } = await supabase.from('users').select('*').eq('id', id).single();
      setMember(user);

      const { data: scoresData } = await supabase
        .from('scores')
        .select('*, course:courses(course_name, tee_name, par, type), event:events(name, event_number, start_date)')
        .eq('user_id', id)
        .eq('is_complete', true)
        .not('net_strokes_over_par', 'is', null)
        .order('tee_time', { ascending: false });
      setScores(scoresData || []);

      if (scoresData && scoresData.length > 0) {
        const nets = scoresData.map((s) => s.net_strokes_over_par!);
        const grossOverPar = scoresData.map((s) => {
          if (s.gross_score == null || s.course?.par == null) return Infinity;
          const maxH = getMaxHoles(s.course?.type || '18_holes');
          const effectivePar = (s.holes_played != null && s.holes_played !== maxH)
            ? calculatePartialPar(s.course.par, s.holes_played, maxH)
            : s.course.par;
          return s.gross_score - effectivePar;
        });
        const uniqueCourses = new Set(scoresData.map((s) => s.course_id));
        const bestIdx = nets.indexOf(Math.min(...nets));
        const worstIdx = nets.indexOf(Math.max(...nets));
        const bestGrossIdx = grossOverPar.indexOf(Math.min(...grossOverPar));
        const finiteGrossOverPar = grossOverPar.filter((g) => g !== Infinity);
        const worstGrossIdx = finiteGrossOverPar.length > 0 ? grossOverPar.indexOf(Math.max(...finiteGrossOverPar)) : -1;

        const courseCount: Record<string, { name: string; count: number }> = {};
        for (const s of scoresData) {
          const name = s.course?.course_name || 'Unknown';
          if (!courseCount[name]) courseCount[name] = { name, count: 0 };
          courseCount[name].count++;
        }
        const topCourses = Object.values(courseCount).sort((a, b) => b.count - a.count).slice(0, 5);

        setStats({
          totalRounds: scoresData.length,
          avgNet: Math.round((nets.reduce((a, b) => a + b, 0) / nets.length) * 10) / 10,
          bestNet: Math.min(...nets),
          worstNet: Math.max(...nets),
          coursesPlayed: uniqueCourses.size,
          bestRound: scoresData[bestIdx],
          worstRound: scoresData[worstIdx],
          bestGrossRound: grossOverPar[bestGrossIdx] !== Infinity ? scoresData[bestGrossIdx] : null,
          worstGrossRound: worstGrossIdx >= 0 ? scoresData[worstGrossIdx] : null,
          topCourses,
          uniqueCourses: new Set(scoresData.map((s) => s.course?.course_name)).size,
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
        <div className="h-6 bg-[var(--bg-skeleton)] rounded animate-pulse w-32" />
        <div className="h-40 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!member) {
    return <div className="p-4 text-center text-[var(--text-muted)]">Member not found.</div>;
  }

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <Avatar
            src={member.profile_picture_url}
            name={member.full_name}
            className="w-12 h-12 bg-minerva-100"
            textClassName="text-lg font-bold text-minerva-600"
          />
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">{member.full_name || 'Unnamed'}</h1>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-[var(--text-muted)] capitalize">{member.role.replace(/_/g, ' ')}</p>
              {member.is_commissioner && (
                <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Commish</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Handicap */}
      <div className="bg-gradient-to-br from-minerva-600 to-minerva-800 rounded-2xl p-4 text-white flex items-center justify-between">
        <div>
          <p className="text-xs text-minerva-200 uppercase tracking-wide">Handicap</p>
          <p className="text-3xl font-bold mt-0.5">{member.handicap_index ?? '--'}</p>
        </div>
        {member.ghin_number && (
          <div className="text-right">
            <p className="text-xs text-minerva-200">GHIN</p>
            <p className="text-base font-semibold">{member.ghin_number}</p>
          </div>
        )}
      </div>

      {/* Recent Rounds */}
      {scores.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">Recent Rounds</h3>
          <div className="space-y-2">
            {scores.slice(0, 5).map((score) => (
              <Link
                key={score.id}
                href={`/scores/${score.id}`}
                className="flex items-center justify-between bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)]"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{score.course?.course_name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {score.course?.tee_name} &middot; {score.holes_played ?? getMaxHoles(score.course?.type || '18_holes')}h
                    {(score.tee_time || score.event?.start_date) && (
                      <> &middot; {new Date(score.tee_time || (score.event!.start_date + 'T00:00:00')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</>
                    )}
                    {score.event?.name && (
                      <> &middot; {score.event.name}</>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-[var(--text-primary)]">{score.gross_score}</p>
                  <p className={`text-xs font-medium ${
                    (score.net_strokes_over_par ?? 0) < 0 ? 'text-red-600' :
                    (score.net_strokes_over_par ?? 0) === 0 ? 'text-green-600' : 'text-[var(--text-muted)]'
                  }`}>
                    Net {score.net_strokes_over_par != null ? formatNetScore(score.net_strokes_over_par) : '-'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* All Time Stats */}
      <div>
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">All Time Stats</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)] text-center">
          <Target className="w-5 h-5 text-minerva-600 mx-auto mb-1" />
          <p className="text-lg font-bold text-[var(--text-primary)]">{stats.totalRounds}</p>
          <p className="text-xs text-[var(--text-muted)]">Rounds</p>
        </div>
        <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)] text-center">
          <TrendingUp className="w-5 h-5 text-blue-600 mx-auto mb-1" />
          <p className="text-lg font-bold text-[var(--text-primary)]">
            {stats.avgNet !== 0 ? (stats.avgNet > 0 ? `+${stats.avgNet}` : stats.avgNet) : '--'}
          </p>
          <p className="text-xs text-[var(--text-muted)]">Avg Net</p>
        </div>
        <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)] text-center">
          <Trophy className="w-5 h-5 text-yellow-600 mx-auto mb-1" />
          <p className="text-lg font-bold text-[var(--text-primary)]">
            {stats.bestNet != null ? formatNetScore(stats.bestNet) : '--'}
          </p>
          <p className="text-xs text-[var(--text-muted)]">Best Net</p>
        </div>
        <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)] text-center">
          <BarChart3 className="w-5 h-5 text-red-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-[var(--text-primary)]">
            {stats.worstNet != null ? formatNetScore(stats.worstNet) : '--'}
          </p>
          <p className="text-xs text-[var(--text-muted)]">Worst Net</p>
        </div>
      </div>
      </div>

      {/* Notable Rounds */}
      {(stats.bestRound || stats.worstRound || stats.bestGrossRound || stats.worstGrossRound) && (
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">Notable Rounds</h3>
          <div className="space-y-2">
            {stats.bestRound && (
              <Link href={`/scores/${stats.bestRound.id}`} className="flex items-center justify-between bg-green-50 dark:bg-green-900/30 rounded-xl p-3 border border-green-100 dark:border-green-800">
                <div>
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium">Best Net Round</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{stats.bestRound.course?.course_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(stats.bestRound.tee_time || stats.bestRound.created_at).toLocaleDateString('en-US', { timeZone: 'UTC' })}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-700 dark:text-green-400">{formatNetScore(stats.bestRound.net_strokes_over_par!)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Gross: {stats.bestRound.gross_score}</p>
                </div>
              </Link>
            )}
            {stats.worstRound && stats.worstRound.id !== stats.bestRound?.id && (
              <Link href={`/scores/${stats.worstRound.id}`} className="flex items-center justify-between bg-red-50 dark:bg-red-900/30 rounded-xl p-3 border border-red-100 dark:border-red-800">
                <div>
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium">Worst Net Round</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{stats.worstRound.course?.course_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(stats.worstRound.tee_time || stats.worstRound.created_at).toLocaleDateString('en-US', { timeZone: 'UTC' })}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-red-700 dark:text-red-400">{formatNetScore(stats.worstRound.net_strokes_over_par!)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Gross: {stats.worstRound.gross_score}</p>
                </div>
              </Link>
            )}
            {stats.bestGrossRound && (() => {
              const s = stats.bestGrossRound;
              const maxH = getMaxHoles(s.course?.type || '18_holes');
              const effPar = (s.holes_played != null && s.holes_played !== maxH) ? calculatePartialPar(s.course?.par ?? 72, s.holes_played, maxH) : (s.course?.par ?? 72);
              return (
              <Link href={`/scores/${s.id}`} className="flex items-center justify-between bg-green-50 dark:bg-green-900/30 rounded-xl p-3 border border-green-100 dark:border-green-800">
                <div>
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium">Best Gross Round</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.course?.course_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(s.tee_time || s.created_at).toLocaleDateString('en-US', { timeZone: 'UTC' })}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-700 dark:text-green-400">{formatGrossScore(s.gross_score!, effPar)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Net: {formatNetScore(s.net_strokes_over_par!)}</p>
                </div>
              </Link>
              );
            })()}
            {stats.worstGrossRound && stats.worstGrossRound.id !== stats.bestGrossRound?.id && (() => {
              const s = stats.worstGrossRound;
              const maxH = getMaxHoles(s.course?.type || '18_holes');
              const effPar = (s.holes_played != null && s.holes_played !== maxH) ? calculatePartialPar(s.course?.par ?? 72, s.holes_played, maxH) : (s.course?.par ?? 72);
              return (
              <Link href={`/scores/${s.id}`} className="flex items-center justify-between bg-red-50 dark:bg-red-900/30 rounded-xl p-3 border border-red-100 dark:border-red-800">
                <div>
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium">Worst Gross Round</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.course?.course_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(s.tee_time || s.created_at).toLocaleDateString('en-US', { timeZone: 'UTC' })}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-red-700 dark:text-red-400">{formatGrossScore(s.gross_score!, effPar)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Net: {formatNetScore(s.net_strokes_over_par!)}</p>
                </div>
              </Link>
              );
            })()}
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

      {/* Trophy Case */}
      <TrophyCase trophies={trophies} seasonFinishes={seasonFinishes} />

      {/* Handicap History */}
      {handicapHistory.length > 0 && (() => {
        const visible = showAllHistory ? handicapHistory : handicapHistory.slice(0, 5);
        const hasMore = handicapHistory.length > 5;
        return (
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">Handicap History</h3>
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden">
              {visible.map((h, idx) => (
                <div key={h.id} className={`flex items-center justify-between px-4 py-3 ${idx < visible.length - 1 || (hasMore && !showAllHistory) ? 'border-b border-[var(--border-light)]' : ''}`}>
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-[var(--text-faint)]" />
                    <p className="text-sm text-[var(--text-secondary)]">{new Date(h.effective_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const prev = idx < handicapHistory.length - 1 ? Number(handicapHistory[idx + 1].handicap_index) : null;
                      const trend = getHandicapTrend(Number(h.handicap_index), prev);
                      if (trend === 'improved') return <TrendingDown className="w-3.5 h-3.5 text-green-500" />;
                      if (trend === 'worsened') return <TrendingUp className="w-3.5 h-3.5 text-red-500" />;
                      return <Minus className="w-3.5 h-3.5 text-[var(--text-faint)]" />;
                    })()}
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{h.handicap_index}</p>
                  </div>
                </div>
              ))}
              {hasMore && (
                <button
                  onClick={() => setShowAllHistory(!showAllHistory)}
                  className="w-full flex items-center justify-center gap-1 px-4 py-2.5 text-xs font-medium text-minerva-600 hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  {showAllHistory ? 'Show Less' : `Show All (${handicapHistory.length})`}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllHistory ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>
          </div>
        );
      })()}

      <Link
        href={`/stats/${id}`}
        className="block text-center text-sm text-minerva-600 font-medium py-2"
      >
        View Head to Head &rarr;
      </Link>
    </div>
  );
}
