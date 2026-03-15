'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { Edit, LogOut, Camera, TrendingUp, TrendingDown, Minus, Trophy, Target, Calendar, Sun, Moon, Monitor, MessageSquare, BarChart3, ChevronDown } from 'lucide-react';
import TrophyCase from '@/components/TrophyCase';
import Avatar from '@/components/Avatar';
import { logAuditEvent } from '@/lib/audit';
import { formatNetScore } from '@/lib/scoring';
import { getHandicapTrend } from '@/lib/handicap-trend';
import { useThemeContext } from '@/components/ThemeProvider';
import type { ThemePreference } from '@/lib/hooks/useTheme';
import type { HandicapHistory, Score, Trophy as TrophyType, SeasonFinish } from '@/types/database';

interface NotableStats {
  totalRounds: number;
  avgNet: number;
  bestNet: number | null;
  worstNet: number | null;
  bestRound: Score | null;
  worstRound: Score | null;
  topCourses: { name: string; count: number }[];
  uniqueCourses: number;
}

export default function ProfilePage() {
  const { profile, authUser, loading: userLoading } = useUser();
  const router = useRouter();
  const supabase = createClient();
  const { preference, setTheme } = useThemeContext();
  const [handicapHistory, setHandicapHistory] = useState<HandicapHistory[]>([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [trophies, setTrophies] = useState<TrophyType[]>([]);
  const [seasonFinishes, setSeasonFinishes] = useState<SeasonFinish[]>([]);
  const [stats, setStats] = useState<NotableStats>({
    totalRounds: 0,
    avgNet: 0,
    bestNet: null,
    worstNet: null,
    bestRound: null,
    worstRound: null,
    topCourses: [],
    uniqueCourses: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!profile?.id) return;

      // Fetch handicap history
      const { data: history } = await supabase
        .from('handicap_history')
        .select('*')
        .eq('user_id', profile.id)
        .order('effective_date', { ascending: false });
      setHandicapHistory(history || []);

      // Fetch scores with course info for notable rounds + courses played
      const { data: scores } = await supabase
        .from('scores')
        .select('*, course:courses(course_name, tee_name, par, type)')
        .eq('user_id', profile.id)
        .eq('is_complete', true)
        .not('net_strokes_over_par', 'is', null)
        .order('created_at', { ascending: true });

      if (scores && scores.length > 0) {
        const nets = scores.map((s) => s.net_strokes_over_par!);
        const bestIdx = nets.indexOf(Math.min(...nets));
        const worstIdx = nets.indexOf(Math.max(...nets));

        const courseCount: Record<string, { name: string; count: number }> = {};
        for (const s of scores) {
          const name = s.course?.course_name || 'Unknown';
          if (!courseCount[name]) courseCount[name] = { name, count: 0 };
          courseCount[name].count++;
        }
        const topCourses = Object.values(courseCount).sort((a, b) => b.count - a.count).slice(0, 5);

        setStats({
          totalRounds: scores.length,
          avgNet: Math.round((nets.reduce((a, b) => a + b, 0) / nets.length) * 10) / 10,
          bestNet: Math.min(...nets),
          worstNet: Math.max(...nets),
          bestRound: scores[bestIdx],
          worstRound: scores[worstIdx],
          topCourses,
          uniqueCourses: new Set(scores.map((s) => s.course?.course_name)).size,
        });
      }

      // Fetch trophies
      const { data: trophyData } = await supabase
        .from('trophies')
        .select('*')
        .eq('user_id', profile.id)
        .order('year', { ascending: false });
      setTrophies(trophyData || []);

      // Fetch season finishes
      const { data: finishData } = await supabase
        .from('season_finishes')
        .select('*')
        .eq('user_id', profile.id)
        .order('year', { ascending: false });
      setSeasonFinishes(finishData || []);

      setLoading(false);
    };

    if (!userLoading) fetchData();
  }, [profile, userLoading, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleProfilePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    const ext = file.name.split('.').pop();
    const filePath = `${profile.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('profile-pictures')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('profile-pictures')
      .getPublicUrl(filePath);

    const { error: updateError } = await supabase
      .from('users')
      .update({ profile_picture_url: publicUrl })
      .eq('id', profile.id);

    if (!updateError) {
      await logAuditEvent('profile_picture_upload', 'user', profile.id, {});
    }

    window.location.reload();
  };

  if (userLoading || loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 bg-[var(--bg-skeleton)] rounded-full animate-pulse" />
          <div className="space-y-2 flex-1">
            <div className="h-5 bg-[var(--bg-skeleton)] rounded animate-pulse w-32" />
            <div className="h-4 bg-[var(--bg-skeleton)] rounded animate-pulse w-48" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      {/* Profile Header */}
      <div className="flex items-start gap-4">
        <div className="relative">
          <Avatar
            src={profile?.profile_picture_url}
            name={profile?.full_name || profile?.email}
            className="w-20 h-20 bg-minerva-100"
            textClassName="text-2xl font-bold text-minerva-600"
          />
          <label className="absolute bottom-0 right-0 w-7 h-7 bg-minerva-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-minerva-700 transition-colors">
            <Camera className="w-3.5 h-3.5 text-white" />
            <input
              type="file"
              accept="image/*"
              onChange={handleProfilePictureUpload}
              className="hidden"
            />
          </label>
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-[var(--text-primary)] truncate">
            {profile?.full_name || 'Unnamed User'}
          </h1>
          <p className="text-sm text-[var(--text-muted)] truncate">{profile?.email}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-xs text-[var(--text-faint)] capitalize">
              {profile?.role.replace(/_/g, ' ')}
            </p>
            {profile?.is_commissioner && (
              <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Commish</span>
            )}
          </div>
        </div>

        <Link href="/profile/edit" className="p-2 rounded-lg hover:bg-[var(--bg-subtle)]">
          <Edit className="w-5 h-5 text-[var(--text-muted)]" />
        </Link>
      </div>

      {/* Handicap Card */}
      <div className="bg-gradient-to-br from-minerva-600 to-minerva-800 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-minerva-200 uppercase tracking-wide">Current Handicap</p>
            <p className="text-4xl font-bold mt-1">
              {profile?.handicap_index != null ? profile.handicap_index : '--'}
            </p>
          </div>
          {profile?.ghin_number && (
            <div className="text-right">
              <p className="text-xs text-minerva-200 uppercase tracking-wide">GHIN #</p>
              <p className="text-lg font-semibold mt-1">{profile.ghin_number}</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats */}
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

      {/* Notable Rounds */}
      {(stats.bestRound || stats.worstRound) && (
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
                <div
                  key={h.id}
                  className={`flex items-center justify-between px-4 py-3 ${
                    idx < visible.length - 1 || (hasMore && !showAllHistory) ? 'border-b border-[var(--border-light)]' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-[var(--text-faint)]" />
                    <p className="text-sm text-[var(--text-secondary)]">
                      {new Date(h.effective_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
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

      {/* Theme Toggle */}
      <div>
        <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">Appearance</h3>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-1 flex gap-1">
          {([
            { value: 'system' as ThemePreference, icon: Monitor, label: 'System' },
            { value: 'light' as ThemePreference, icon: Sun, label: 'Light' },
            { value: 'dark' as ThemePreference, icon: Moon, label: 'Dark' },
          ]).map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                preference === value
                  ? 'bg-minerva-600 text-white'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Send Feedback */}
      <Link
        href="/feedback"
        className="flex items-center gap-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-4 hover:shadow-md transition-shadow"
      >
        <div className="w-10 h-10 bg-minerva-100 rounded-xl flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-minerva-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Send Feedback</p>
          <p className="text-xs text-[var(--text-muted)]">Report bugs or request features</p>
        </div>
      </Link>

      {/* Sign Out */}
      <button
        onClick={handleSignOut}
        className="flex items-center justify-center gap-2 w-full bg-[var(--bg-subtle)] text-[var(--text-muted)] rounded-xl px-4 py-3 text-sm font-medium hover:opacity-80 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>
    </div>
  );
}
