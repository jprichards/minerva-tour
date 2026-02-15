'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { Edit, LogOut, Camera, TrendingUp, Trophy, Target, Calendar } from 'lucide-react';
import type { HandicapHistory, Score } from '@/types/database';

export default function ProfilePage() {
  const { profile, authUser, loading: userLoading } = useUser();
  const router = useRouter();
  const supabase = createClient();
  const [handicapHistory, setHandicapHistory] = useState<HandicapHistory[]>([]);
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
          <div className="w-20 h-20 bg-gray-200 rounded-full animate-pulse" />
          <div className="space-y-2 flex-1">
            <div className="h-5 bg-gray-200 rounded animate-pulse w-32" />
            <div className="h-4 bg-gray-200 rounded animate-pulse w-48" />
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
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center overflow-hidden">
            {profile?.profile_picture_url ? (
              <img
                src={profile.profile_picture_url}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold text-emerald-600">
                {(profile?.full_name || profile?.email || '?')[0].toUpperCase()}
              </span>
            )}
          </div>
          <label className="absolute bottom-0 right-0 w-7 h-7 bg-emerald-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-emerald-700 transition-colors">
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
          <h1 className="text-xl font-bold text-gray-900 truncate">
            {profile?.full_name || 'Unnamed User'}
          </h1>
          <p className="text-sm text-gray-500 truncate">{profile?.email}</p>
          <p className="text-xs text-gray-400 mt-0.5 capitalize">
            {profile?.role.replace(/_/g, ' ')}
          </p>
        </div>

        <Link href="/profile/edit" className="p-2 rounded-lg hover:bg-gray-100">
          <Edit className="w-5 h-5 text-gray-500" />
        </Link>
      </div>

      {/* Handicap Card */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-emerald-200 uppercase tracking-wide">Current Handicap</p>
            <p className="text-4xl font-bold mt-1">
              {profile?.handicap_index != null ? profile.handicap_index : '--'}
            </p>
          </div>
          {profile?.ghin_number && (
            <div className="text-right">
              <p className="text-xs text-emerald-200 uppercase tracking-wide">GHIN #</p>
              <p className="text-lg font-semibold mt-1">{profile.ghin_number}</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
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
            {stats.bestNet != null ? (stats.bestNet > 0 ? `+${stats.bestNet}` : stats.bestNet === 0 ? 'E' : stats.bestNet) : '--'}
          </p>
          <p className="text-xs text-gray-500">Best Net</p>
        </div>
      </div>

      {/* Handicap History */}
      {handicapHistory.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-3">Handicap History</h3>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {handicapHistory.map((h, idx) => (
              <div
                key={h.id}
                className={`flex items-center justify-between px-4 py-3 ${
                  idx < handicapHistory.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <p className="text-sm text-gray-700">
                    {new Date(h.effective_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{h.handicap_index}</p>
                  <span className="text-xs text-gray-400 capitalize">{h.source}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sign Out */}
      <button
        onClick={handleSignOut}
        className="flex items-center justify-center gap-2 w-full bg-gray-100 text-gray-600 rounded-xl px-4 py-3 text-sm font-medium hover:bg-gray-200 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>
    </div>
  );
}
