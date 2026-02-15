'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { Trophy, Target, MapPin, Calendar, ExternalLink, Clock, TrendingUp, Image } from 'lucide-react';
import NotificationBell from '@/components/navigation/NotificationBell';
import type { Event, Season, Score } from '@/types/database';

export default function HomePage() {
  const { profile, loading: userLoading } = useUser();
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null);
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [recentScores, setRecentScores] = useState<Score[]>([]);
  const [googlePhotosUrl, setGooglePhotosUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get current season
        const { data: seasons } = await supabase
          .from('seasons')
          .select('*')
          .order('year', { ascending: false })
          .limit(1);

        if (seasons && seasons.length > 0) {
          setCurrentSeason(seasons[0]);

          // Get current event
          if (seasons[0].current_event_id) {
            const { data: event } = await supabase
              .from('events')
              .select('*')
              .eq('id', seasons[0].current_event_id)
              .single();
            setCurrentEvent(event);
          } else {
            // Find active event by dates
            const today = new Date().toISOString().split('T')[0];
            const { data: events } = await supabase
              .from('events')
              .select('*')
              .eq('season_id', seasons[0].id)
              .lte('start_date', today)
              .gte('end_date', today)
              .limit(1);
            if (events && events.length > 0) {
              setCurrentEvent(events[0]);
            }
          }
        }

        // Get Google Photos URL from settings
        const { data: photosSetting } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'google_photos_url')
          .single();
        if (photosSetting?.value?.url) {
          setGooglePhotosUrl(photosSetting.value.url);
        }

        // Get recent scores for current user
        if (profile?.id) {
          const { data: scores } = await supabase
            .from('scores')
            .select('*, course:courses(*), event:events(start_date, end_date)')
            .eq('user_id', profile.id)
            .order('created_at', { ascending: false })
            .limit(5);
          setRecentScores(scores || []);
        }
      } catch (error) {
        console.error('Error fetching home data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (!userLoading) {
      fetchData();
    }
  }, [profile, userLoading, supabase]);

  if (userLoading || loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 bg-gray-200 rounded-lg animate-pulse w-48" />
        <div className="h-40 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="h-32 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Hey, {profile?.full_name?.split(' ')[0] || 'Golfer'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {currentSeason
              ? `${currentSeason.year} Season — ${currentSeason.mode.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`
              : 'Welcome to the Minerva Tour'}
          </p>
        </div>
        <NotificationBell />
      </div>

      {/* Current Event Card */}
      {currentEvent ? (
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-emerald-300" />
            <span className="text-xs font-medium text-emerald-200 uppercase tracking-wide">
              Current Event
            </span>
          </div>
          <h2 className="text-lg font-bold">
            {currentEvent.name || `Event ${currentEvent.event_number}`}
            {currentEvent.is_major && (
              <span className="ml-2 text-xs bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full font-semibold">
                MAJOR
              </span>
            )}
          </h2>
          <p className="text-emerald-200 text-sm mt-1">
            {currentEvent.holes} holes &middot;{' '}
            {new Date(currentEvent.start_date).toLocaleDateString()} &ndash;{' '}
            {new Date(currentEvent.end_date).toLocaleDateString()}
          </p>
          <div className="mt-3 flex gap-2">
            <Link
              href="/scores/add"
              className="bg-white/20 backdrop-blur-sm text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-white/30 transition-colors"
            >
              Submit Score
            </Link>
            <Link
              href="/leaderboard"
              className="bg-white/10 backdrop-blur-sm text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-white/20 transition-colors"
            >
              Leaderboard
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-gray-100 rounded-2xl p-5">
          <p className="text-gray-500 text-sm">No active event right now.</p>
          {currentSeason?.mode === 'off_season' && (
            <p className="text-gray-400 text-xs mt-1">The season hasn&apos;t started yet. Check back soon!</p>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/scores/add"
          className="flex items-center gap-3 bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
            <Target className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Start Round</p>
            <p className="text-xs text-gray-500">Submit a score</p>
          </div>
        </Link>
        <Link
          href="/scores?tab=teetimes"
          className="flex items-center gap-3 bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Clock className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Tee Times</p>
            <p className="text-xs text-gray-500">View / add</p>
          </div>
        </Link>
        <Link
          href="/leaderboard"
          className="flex items-center gap-3 bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
            <Trophy className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Standings</p>
            <p className="text-xs text-gray-500">Leaderboard</p>
          </div>
        </Link>
        <Link
          href="/courses"
          className="flex items-center gap-3 bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <MapPin className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Courses</p>
            <p className="text-xs text-gray-500">Browse / add</p>
          </div>
        </Link>
      </div>

      {/* Handicap Card */}
      {profile?.handicap_index != null && (
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Current Handicap</p>
                <p className="text-xl font-bold text-gray-900">{profile.handicap_index}</p>
              </div>
            </div>
            <Link href="/profile" className="text-emerald-600 text-sm font-medium">
              View Profile
            </Link>
          </div>
        </div>
      )}

      {/* Recent Scores */}
      {recentScores.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">Recent Rounds</h3>
            <Link href={`/scores?player=${profile?.id || ''}`} className="text-sm text-emerald-600 font-medium">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {recentScores.map((score) => (
              <Link
                key={score.id}
                href={`/scores/${score.id}`}
                className="block bg-white rounded-xl p-3 border border-gray-100 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {score.course?.course_name || 'Unknown Course'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {score.course?.tee_name} &middot; {score.holes_played} holes
                      {(score.event?.start_date || score.tee_time) && (
                        <> &middot; {new Date((score.event?.start_date ? score.event.start_date + 'T00:00:00' : score.tee_time)!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    {score.gross_score && (
                      <p className="text-sm font-bold text-gray-900">{score.gross_score}</p>
                    )}
                    {score.net_strokes_over_par != null && (
                      <p className={`text-xs font-medium ${
                        score.net_strokes_over_par < 0 ? 'text-red-600' :
                        score.net_strokes_over_par === 0 ? 'text-emerald-600' :
                        'text-gray-600'
                      }`}>
                        Net: {score.net_strokes_over_par === 0 ? 'E' :
                          score.net_strokes_over_par > 0 ? `+${score.net_strokes_over_par}` :
                          score.net_strokes_over_par}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-gray-900">Quick Links</h3>
        <div className="grid grid-cols-2 gap-2">
          <a
            href="https://minervatour.wordpress.com/rules/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-white rounded-xl p-3 border border-gray-100 text-sm text-gray-700"
          >
            <ExternalLink className="w-4 h-4 text-gray-400" />
            Rules
          </a>
          <a
            href="https://ncrdb.usga.org"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-white rounded-xl p-3 border border-gray-100 text-sm text-gray-700"
          >
            <ExternalLink className="w-4 h-4 text-gray-400" />
            USGA NCRDB
          </a>
          {googlePhotosUrl && (
            <a
              href={googlePhotosUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-white rounded-xl p-3 border border-gray-100 text-sm text-gray-700 col-span-2"
            >
              <Image className="w-4 h-4 text-green-500" />
              Tour Photos
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
