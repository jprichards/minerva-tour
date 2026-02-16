import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { formatSlackMessage } from '@/lib/slack';
import { calculateProjectedPoints, calculateScratchScore, getMaxHoles } from '@/lib/scoring';
import type { SlackConfig, SlackNotifyPayload } from '@/types/database';

/**
 * POST /api/slack/notify
 *
 * Reads the Slack configuration from app_settings, checks if the
 * event type is enabled, calculates projected points from current
 * event standings, formats a Block Kit message, and posts it to
 * the configured Slack channel.
 *
 * Body: SlackNotifyPayload
 * Returns: { ok: true } or error (caller should treat as best-effort)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload: SlackNotifyPayload = await request.json();

    if (!payload.event_type) {
      return NextResponse.json({ error: 'event_type is required' }, { status: 400 });
    }

    // Read Slack config from app_settings
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'slack_config')
      .single();

    if (!setting?.value) {
      return NextResponse.json({ ok: false, reason: 'no_config' }, { status: 200 });
    }

    const config = setting.value as unknown as SlackConfig;

    if (!config.bot_token || !config.channel_id) {
      return NextResponse.json({ ok: false, reason: 'incomplete_config' }, { status: 200 });
    }

    // Check if this event type is enabled
    if (!config.events?.[payload.event_type]) {
      return NextResponse.json({ ok: false, reason: 'event_disabled' }, { status: 200 });
    }

    // Calculate projected points for score-related events
    if (['score_in_progress', 'round_complete', 'retroactive'].includes(payload.event_type)) {
      await enrichWithProjectedPoints(supabase, payload);
    }

    // Load chirp templates from DB (best-effort, falls back to hardcoded)
    const dbTemplates = await loadChirpTemplates(supabase);

    // Format the message
    const message = formatSlackMessage(payload, dbTemplates);

    // Post to Slack
    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.bot_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: config.channel_id,
        text: message.text,
        blocks: message.blocks,
      }),
    });

    const slackData = await slackResponse.json();

    if (!slackData.ok) {
      console.error('Slack post failed:', slackData.error);
      return NextResponse.json(
        { ok: false, reason: slackData.error || 'slack_error' },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Slack notify error:', error);
    // Return 200 even on error — this is a best-effort notification
    return NextResponse.json({ ok: false, reason: 'internal_error' }, { status: 200 });
  }
}

/**
 * Query the current event's scores, rank the player, and add
 * projected_net_points and projected_scratch_points to the payload.
 * Mutates the payload in place. Silently skips if data is unavailable.
 */
async function enrichWithProjectedPoints(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: SlackNotifyPayload
): Promise<void> {
  try {
    // Find the current active event
    const today = new Date().toISOString().split('T')[0];
    const { data: seasons } = await supabase
      .from('seasons')
      .select('id')
      .order('year', { ascending: false })
      .limit(1);

    if (!seasons || seasons.length === 0) return;

    const { data: events } = await supabase
      .from('events')
      .select('id, is_major')
      .eq('season_id', seasons[0].id)
      .lte('start_date', today)
      .gte('end_date', today)
      .limit(1);

    if (!events || events.length === 0) return;

    const activeEvent = events[0];

    // Get all completed scores for this event with course data
    const { data: scores } = await supabase
      .from('scores')
      .select('user_id, gross_score, net_strokes_over_par, holes_played, is_complete, course:courses(rating, par, type)')
      .eq('event_id', activeEvent.id)
      .eq('is_complete', true);

    if (!scores || scores.length === 0) {
      // No completed scores yet — if this player just completed, they're the only one
      if (payload.net_strokes_over_par != null && payload.is_complete) {
        payload.projected_net_points = activeEvent.is_major ? 10 : 1;
      }
      if (payload.gross_score != null && payload.is_complete) {
        payload.projected_scratch_points = activeEvent.is_major ? 10 : 1;
      }
      return;
    }

    // Group by user, find best net score per user
    const bestNetByUser: Record<string, number> = {};
    const bestScratchByUser: Record<string, number> = {};

    for (const s of scores) {
      const course = s.course as unknown as { rating: number; par: number; type: string } | null;
      if (!course) continue;

      // Best net score per user
      if (s.net_strokes_over_par != null) {
        if (bestNetByUser[s.user_id] === undefined || s.net_strokes_over_par < bestNetByUser[s.user_id]) {
          bestNetByUser[s.user_id] = s.net_strokes_over_par;
        }
      }

      // Best scratch score per user
      if (s.gross_score != null) {
        const maxH = getMaxHoles(course.type || '18_holes');
        const holesPlayed = s.holes_played || maxH;
        const scratch = calculateScratchScore(
          s.gross_score, course.rating, course.par, holesPlayed, maxH
        ).scratchStrokesOverRating;

        if (bestScratchByUser[s.user_id] === undefined || scratch < bestScratchByUser[s.user_id]) {
          bestScratchByUser[s.user_id] = scratch;
        }
      }
    }

    const allBestNetScores = Object.values(bestNetByUser);
    const allBestScratchScores = Object.values(bestScratchByUser);

    // For the current player, determine their score to rank
    // Use the payload's net_strokes_over_par (the score just submitted)
    const playerNet = payload.net_strokes_over_par ?? null;

    let playerScratch: number | null = null;
    if (payload.gross_score != null && payload.par != null) {
      const maxH = payload.max_holes || 18;
      const holesPlayed = payload.holes_played || maxH;
      playerScratch = calculateScratchScore(
        payload.gross_score, payload.par, payload.par, holesPlayed, maxH
      ).scratchStrokesOverRating;
    }

    // The player's score may already be in the DB (just inserted before this call).
    // If not (e.g. in-progress round), we need to include it hypothetically.
    // Since we only queried is_complete=true, an in-progress player won't be in the list.
    // For projected points, include the player's score in the pool if it's a complete round.
    // For in-progress rounds, rank against the completed pool without adding themselves.
    let netScoresForRanking = [...allBestNetScores];
    let scratchScoresForRanking = [...allBestScratchScores];

    if (!payload.is_complete) {
      // In-progress: rank hypothetically against completed scores
      // Add the player temporarily to see where they'd rank
      if (playerNet != null) netScoresForRanking.push(playerNet);
      if (playerScratch != null) scratchScoresForRanking.push(playerScratch);
    }
    // For completed rounds, the score should already be in the DB query results

    const { netPoints, scratchPoints } = calculateProjectedPoints(
      playerNet,
      playerScratch,
      netScoresForRanking,
      scratchScoresForRanking,
      activeEvent.is_major
    );

    payload.projected_net_points = netPoints;
    payload.projected_scratch_points = scratchPoints;
  } catch (err) {
    // Silently skip — projected points are nice-to-have
    console.error('Error calculating projected points:', err);
  }
}

/**
 * Load chirp templates from the database, grouped by bucket.
 * Returns undefined if the query fails or returns empty results,
 * which causes the formatter to fall back to hardcoded templates.
 */
async function loadChirpTemplates(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Record<string, string[]> | undefined> {
  try {
    const { data, error } = await supabase
      .from('chirp_templates')
      .select('bucket, template');

    if (error || !data || data.length === 0) return undefined;

    const grouped: Record<string, string[]> = {};
    for (const row of data) {
      if (!grouped[row.bucket]) grouped[row.bucket] = [];
      grouped[row.bucket].push(row.template);
    }
    return grouped;
  } catch {
    return undefined;
  }
}
