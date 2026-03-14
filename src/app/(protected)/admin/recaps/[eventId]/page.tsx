'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { computeEventLeaderboard, computeSeasonStandings } from '@/lib/standings';
import { formatNetScore } from '@/lib/scoring';
import { ArrowLeft, Sparkles, Send, Loader2, AlertTriangle, RotateCcw, CheckCircle } from 'lucide-react';
import type { Score, Event, Season, EventRecap } from '@/types/database';

export default function RecapPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const router = useRouter();
  const { isAdmin, loading: userLoading } = useUser();
  const { showToast } = useToast();
  const supabase = createClient();

  const [commissionerNotes, setCommissionerNotes] = useState('');
  const [recapText, setRecapText] = useState('');
  const [modelUsed, setModelUsed] = useState('');
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  useEffect(() => {
    if (!userLoading && !isAdmin) router.push('/home');
  }, [isAdmin, userLoading, router]);

  const { data, isLoading } = useSWR(
    eventId ? `recap-data-${eventId}` : null,
    async () => {
      const { data: event } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (!event) throw new Error('Event not found');

      const { data: season } = await supabase
        .from('seasons')
        .select('*')
        .eq('id', event.season_id)
        .single();

      if (!season) throw new Error('Season not found');

      const { data: seasonEvents } = await supabase
        .from('events')
        .select('*')
        .eq('season_id', season.id)
        .order('event_number');

      const eventIds = (seasonEvents || []).map((e: Event) => e.id);
      const { data: allScores } = await supabase
        .from('scores')
        .select('*, course:courses(*), user:users!user_id(full_name, email, profile_picture_url, handicap_index), event:events(*)')
        .in('event_id', eventIds);

      const { data: existingRecap } = await supabase
        .from('event_recaps')
        .select('*')
        .eq('event_id', eventId)
        .maybeSingle();

      const { data: aiSetting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'ai_config')
        .maybeSingle();

      const aiModel = (aiSetting?.value as Record<string, unknown>)?.model as string | undefined;

      return {
        event: event as Event,
        season,
        seasonEvents: (seasonEvents || []) as Event[],
        allScores: (allScores || []) as Score[],
        existingRecap: existingRecap as EventRecap | null,
        aiModel: aiModel || null,
      };
    }
  );

  useEffect(() => {
    if (data?.existingRecap) {
      setRecapText(data.existingRecap.recap_text);
      setCommissionerNotes(data.existingRecap.commissioner_notes || '');
      if (data.existingRecap.posted_to_slack) setPublished(true);
    }
    if (data?.aiModel && !modelUsed) {
      setModelUsed(data.aiModel);
    }
  }, [data?.existingRecap, data?.aiModel, modelUsed]);

  const event = data?.event;
  const season = data?.season;
  const seasonEvents = data?.seasonEvents ?? [];
  const allScores = data?.allScores ?? [];

  const eventScores = useMemo(
    () => allScores.filter((s) => s.event_id === eventId),
    [allScores, eventId]
  );

  const eventNetStandings = useMemo(
    () => event && season ? computeEventLeaderboard(eventScores, event, season, 'net') : [],
    [eventScores, event, season]
  );

  const eventScratchStandings = useMemo(
    () => event && season ? computeEventLeaderboard(eventScores, event, season, 'scratch') : [],
    [eventScores, event, season]
  );

  const seasonNetStandings = useMemo(
    () => event ? computeSeasonStandings(allScores, seasonEvents, 'net', event.event_number) : [],
    [allScores, seasonEvents, event]
  );

  const seasonScratchStandings = useMemo(
    () => event ? computeSeasonStandings(allScores, seasonEvents, 'scratch', event.event_number) : [],
    [allScores, seasonEvents, event]
  );

  const previousSeasonNetStandings = useMemo(
    () => event && event.event_number > 1
      ? computeSeasonStandings(allScores, seasonEvents, 'net', event.event_number - 1)
      : [],
    [allScores, seasonEvents, event]
  );

  const buildStandingsPayload = useCallback(() => {
    if (!event || !season) return null;

    const prevRanks: Record<string, number> = {};
    previousSeasonNetStandings.forEach((s, i) => { prevRanks[s.userId] = i + 1; });

    const totalEvents = seasonEvents.filter((e) => !e.is_playoff).length;
    const pastEvents = seasonEvents.filter((e) => !e.is_playoff && e.event_number <= event.event_number).length;

    return {
      event: {
        name: event.name || `Event ${event.event_number}`,
        number: event.event_number,
        total_events_in_season: totalEvents,
        season_year: season.year,
        start_date: event.start_date,
        end_date: event.end_date,
        is_major: event.is_major,
        holes: event.holes,
      },
      highlight_players: eventNetStandings.slice(0, 3).map((e) => e.playerName),
      event_standings_net: eventNetStandings.map((e, i) => ({
        rank: i + 1,
        player: e.playerName,
        net_score: e.bestNetOverPar != null ? formatNetScore(e.bestNetOverPar) : 'N/A',
        points: e.projectedPoints,
        course: e.courseName,
      })),
      event_standings_scratch: eventScratchStandings.map((e, i) => ({
        rank: i + 1,
        player: e.playerName,
        scratch_over_rating: e.scratchOverRating != null
          ? (e.scratchOverRating === 0 ? 'E' : e.scratchOverRating > 0 ? `+${e.scratchOverRating.toFixed(1)}` : e.scratchOverRating.toFixed(1))
          : 'N/A',
        points: e.projectedPoints,
        course: e.courseName,
      })),
      season_standings_net: seasonNetStandings.map((s, i) => ({
        rank: i + 1,
        player: s.playerName,
        total_points: s.totalPoints,
        events_played: s.eventsPlayed,
        rank_change: prevRanks[s.userId]
          ? (prevRanks[s.userId] - (i + 1) > 0 ? `+${prevRanks[s.userId] - (i + 1)}` : prevRanks[s.userId] === i + 1 ? 0 : prevRanks[s.userId] - (i + 1))
          : 'new',
      })),
      season_standings_scratch: seasonScratchStandings.map((s, i) => ({
        rank: i + 1,
        player: s.playerName,
        total_points: s.totalPoints,
        events_played: s.eventsPlayed,
      })),
      context: {
        is_final_regular_season_event: event.event_number === totalEvents,
        events_remaining: totalEvents - pastEvents,
        playoff_spots: 6,
        season_mode: season.mode,
      },
      ...(commissionerNotes.trim() ? { commissioner_notes: commissionerNotes.trim() } : {}),
    };
  }, [event, season, seasonEvents, eventNetStandings, eventScratchStandings, seasonNetStandings, seasonScratchStandings, previousSeasonNetStandings, commissionerNotes]);

  const handleGenerate = async () => {
    const payload = buildStandingsPayload();
    if (!payload) return;

    setGenerating(true);
    try {
      const res = await fetch('/api/recaps/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ standings: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to generate recap', 'error');
        return;
      }
      setRecapText(data.recap_text);
      if (data.model) setModelUsed(data.model);
      showToast('Recap generated!', 'success');
    } catch {
      showToast('Failed to generate recap', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!recapText.trim() || !event) return;

    setPublishing(true);
    try {
      const eventName = event.name || `Event ${event.event_number}`;
      const eventDates = `${new Date(event.start_date).toLocaleDateString()} – ${new Date(event.end_date).toLocaleDateString()}`;

      const standingsImages = {
        event_net: {
          title: `${eventName} — Net Standings`,
          subtitle: eventDates,
          columns: { value: 'Score', secondary: 'Points' },
          rows: eventNetStandings.map((e, i) => ({
            rank: i + 1,
            player: e.playerName,
            value: e.bestNetOverPar != null ? formatNetScore(e.bestNetOverPar) : '-',
            secondary: String(e.projectedPoints),
            course: e.courseName,
          })),
        },
        event_scratch: {
          title: `${eventName} — Scratch Standings`,
          subtitle: eventDates,
          columns: { value: 'Score', secondary: 'Points' },
          rows: eventScratchStandings.map((e, i) => ({
            rank: i + 1,
            player: e.playerName,
            value: e.scratchOverRating != null
              ? (e.scratchOverRating === 0 ? 'E' : e.scratchOverRating > 0 ? `+${Math.round(e.scratchOverRating)}` : `${Math.round(e.scratchOverRating)}`)
              : '-',
            secondary: String(e.projectedPoints),
            course: e.courseName,
          })),
        },
        season_net: {
          title: `${season!.year} Season — Net Standings`,
          subtitle: `Through ${eventName}`,
          columns: { value: 'Points' },
          rows: seasonNetStandings.map((s, i) => ({
            rank: i + 1,
            player: s.playerName,
            value: `${s.totalPoints}`,
          })),
        },
        season_scratch: {
          title: `${season!.year} Season — Scratch Standings`,
          subtitle: `Through ${eventName}`,
          columns: { value: 'Points' },
          rows: seasonScratchStandings.map((s, i) => ({
            rank: i + 1,
            player: s.playerName,
            value: `${s.totalPoints}`,
          })),
        },
      };

      const res = await fetch('/api/recaps/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          recap_text: recapText,
          commissioner_notes: commissionerNotes.trim() || undefined,
          standings_images: standingsImages,
          event_name: eventName,
          event_dates: eventDates,
          model: modelUsed || undefined,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        showToast(result.error || 'Failed to publish', 'error');
        return;
      }

      setPublished(true);
      showToast('Recap posted to Slack!', 'success');
    } catch {
      showToast('Failed to publish recap', 'error');
    } finally {
      setPublishing(false);
    }
  };

  if (!isAdmin) return null;

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 bg-[var(--bg-skeleton)] rounded-lg animate-pulse w-48" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!event) {
    return (
      <div className="p-4 text-center py-16">
        <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Event Not Found</h2>
      </div>
    );
  }

  const eventName = event.name || `Event ${event.event_number}`;

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">{eventName} Recap</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {new Date(event.start_date).toLocaleDateString()} – {new Date(event.end_date).toLocaleDateString()}
            {event.is_major && ' · Major'}
          </p>
        </div>
      </div>

      {/* Already posted warning */}
      {published && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-start gap-2">
          <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-green-800">
            This recap has been posted to Slack. You can still edit and re-post.
          </p>
        </div>
      )}

      {/* Event Standings Preview */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Event Standings (Net)</h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-light)]">
                <th className="text-left px-3 py-2 text-xs font-medium text-[var(--text-muted)]">#</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-[var(--text-muted)]">Player</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text-muted)]">Score</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text-muted)]">Pts</th>
              </tr>
            </thead>
            <tbody>
              {eventNetStandings.slice(0, 10).map((e, i) => (
                <tr key={e.userId} className={i % 2 === 0 ? 'bg-[var(--bg-page)]' : ''}>
                  <td className="px-3 py-1.5 text-[var(--text-muted)]">{i + 1}</td>
                  <td className="px-3 py-1.5 font-medium text-[var(--text-primary)]">{e.playerName}</td>
                  <td className={`px-3 py-1.5 text-right font-semibold ${
                    (e.bestNetOverPar ?? 0) < 0 ? 'text-red-600' : (e.bestNetOverPar ?? 0) === 0 ? 'text-green-600' : 'text-[var(--text-primary)]'
                  }`}>{e.bestNetOverPar != null ? formatNetScore(e.bestNetOverPar) : '-'}</td>
                  <td className="px-3 py-1.5 text-right text-yellow-600">{e.projectedPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {eventNetStandings.length > 10 && (
            <div className="px-3 py-1.5 text-xs text-[var(--text-faint)] text-center border-t border-[var(--border-light)]">
              +{eventNetStandings.length - 10} more
            </div>
          )}
        </div>

        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Season Standings (Net)</h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-light)]">
                <th className="text-left px-3 py-2 text-xs font-medium text-[var(--text-muted)]">#</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-[var(--text-muted)]">Player</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text-muted)]">Pts</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text-muted)]">Events</th>
              </tr>
            </thead>
            <tbody>
              {seasonNetStandings.slice(0, 10).map((s, i) => (
                <tr key={s.userId} className={i % 2 === 0 ? 'bg-[var(--bg-page)]' : ''}>
                  <td className="px-3 py-1.5 text-[var(--text-muted)]">{i + 1}</td>
                  <td className="px-3 py-1.5 font-medium text-[var(--text-primary)]">{s.playerName}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-[var(--text-primary)]">{s.totalPoints}</td>
                  <td className="px-3 py-1.5 text-right text-[var(--text-muted)]">{s.eventsPlayed}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {seasonNetStandings.length > 10 && (
            <div className="px-3 py-1.5 text-xs text-[var(--text-faint)] text-center border-t border-[var(--border-light)]">
              +{seasonNetStandings.length - 10} more
            </div>
          )}
        </div>
      </div>

      {/* Commissioner Notes */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-[var(--text-primary)]">Commissioner Notes (optional)</label>
        <textarea
          value={commissionerNotes}
          onChange={(e) => setCommissionerNotes(e.target.value)}
          rows={3}
          placeholder='e.g. "Matt played a career round at St. Andrews" or "wind was 25mph on the back nine"'
          className="w-full px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500 resize-y"
        />
        <p className="text-xs text-[var(--text-faint)]">
          Add color the standings don&apos;t show. This gets woven into the AI-generated recap.
        </p>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-orange-600 transition-colors"
      >
        {generating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        {generating ? 'Generating...' : recapText ? 'Re-generate Recap' : 'Generate Recap'}
      </button>

      {/* Recap Editor */}
      {recapText && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-[var(--text-primary)]">Recap</label>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="text-xs text-orange-600 flex items-center gap-1 hover:underline disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              Regenerate
            </button>
          </div>
          <textarea
            value={recapText}
            onChange={(e) => setRecapText(e.target.value)}
            rows={12}
            className="w-full px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500 resize-y leading-relaxed"
          />

          {/* Post to Slack */}
          <button
            onClick={handlePublish}
            disabled={publishing || !recapText.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 bg-minerva-600 text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-minerva-700 transition-colors"
          >
            {publishing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {publishing ? 'Posting...' : published ? 'Re-post to Slack' : 'Post to Slack'}
          </button>
        </div>
      )}
    </div>
  );
}
