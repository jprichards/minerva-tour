'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { Edit, LogOut, Camera, TrendingUp, Trophy, Target, Calendar, Sun, Moon, Monitor, MessageSquare } from 'lucide-react';
import TrophyCase from '@/components/TrophyCase';
import { useThemeContext } from '@/components/ThemeProvider';
import type { ThemePreference } from '@/lib/hooks/useTheme';
import type { HandicapHistory, Score, Trophy as TrophyType, SeasonFinish } from '@/types/database';

export default function ProfilePage() {
  const { profile, authUser, loading: userLoading } = useUser();
  const router = useRouter();
  const supabase = createClient();
  const { preference, setTheme } = useThemeContext();
  const [handicapHistory, setHandicapHistory] = useState<HandicapHistory[]>([]);
  const [trophies, setTrophies] = useState<TrophyType[]>([]);
  const [seasonFinishes, setSeasonFinishes] = useState<SeasonFinish[]>([]);
  const [stats, setStats] = useState({
    totalRounds: 0,
    avgNet: 0,
    bestNet: null as number | null,
    worstNet: null as number | null,
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

      // Fetch stats
      const { data: scores } = await supabase
        .from('scores')
        .select('net_strokes_over_par, gross_score')
        .eq('user_id', profile.id)
        .eq('is_complete', true)
        .not('net_strokes_over_par', 'is', null);

      if (scores && scores.length > 0) {
        const nets = scores.map((s) => s.net_strokes_over_par!);
        setStats({
          totalRounds: scores.length,
          avgNet: Math.round((nets.reduce((a, b) => a + b, 0) / nets.length) * 10) / 10,
          bestNet: Math.min(...nets),
          worstNet: Math.max(...nets),
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

    await supabase
      .from('users')
      .update({ profile_picture_url: publicUrl })
      .eq('id', profile.id);

    // Refresh page
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
          <div className="w-20 h-20 bg-minerva-100 rounded-full flex items-center justify-center overflow-hidden">
            {profile?.profile_picture_url ? (
              <img
                src={profile.profile_picture_url}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold text-minerva-600">
                {(profile?.full_name || profile?.email || '?')[0].toUpperCase()}
              </span>
            )}
          </div>
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
      <div className="grid grid-cols-3 gap-3">
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
            {stats.bestNet != null ? (stats.bestNet > 0 ? `+${stats.bestNet}` : stats.bestNet === 0 ? 'E' : stats.bestNet) : '--'}
          </p>
          <p className="text-xs text-[var(--text-muted)]">Best Net</p>
        </div>
      </div>

      {/* Trophy Case */}
      <TrophyCase trophies={trophies} seasonFinishes={seasonFinishes} />

      {/* Handicap History */}
      {handicapHistory.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">Handicap History</h3>
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden">
            {handicapHistory.map((h, idx) => (
              <div
                key={h.id}
                className={`flex items-center justify-between px-4 py-3 ${
                  idx < handicapHistory.length - 1 ? 'border-b border-[var(--border-light)]' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-[var(--text-faint)]" />
                  <p className="text-sm text-[var(--text-secondary)]">
                    {new Date(h.effective_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{h.handicap_index}</p>
              </div>
            ))}
          </div>
        </div>
      )}

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
