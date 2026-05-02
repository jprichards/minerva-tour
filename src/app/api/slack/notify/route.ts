import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { formatSlackMessage } from '@/lib/slack';
import { calculateProjectedPoints, calculateScratchScore, getMaxHoles } from '@/lib/scoring';
import { DEFAULT_BUCKET_RANGES, NO_CHIRP_BUCKETS, getChirpBucket, type BucketRange, type ChirpContext } from '@/lib/chirps';
import { generateChirps } from '@/lib/chirps-ai';
import { isFeatureEnabled, FEATURE_FLAGS } from '@/lib/feature-flags';
import type { SlackConfig, SlackNotifyPayload, SlackScorePayload, ChirpConfig, ChirpTrigger } from '@/types/database';

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

    // Check if this event type is enabled (default to true for event types not yet saved in config)
    if (config.events?.[payload.event_type] === false) {
      return NextResponse.json({ ok: false, reason: 'event_disabled' }, { status: 200 });
    }

    // Determine target channel — feedback goes to its own channel if configured
    const isFeedback = payload.event_type === 'feedback_submitted';
    const targetChannel = isFeedback
      ? (config.feedback_channel_id || config.channel_id)
      : config.channel_id;

    // Gate score posts by score_post_trigger (default: all_score_updates)
    const isScorePost = ['score_in_progress', 'round_complete'].includes(payload.event_type);
    if (isScorePost && config.score_post_trigger && config.score_post_trigger !== 'all_score_updates') {
      if (shouldSkipForTrigger(config.score_post_trigger, payload as SlackScorePayload)) {
        return NextResponse.json({ ok: false, reason: 'score_post_trigger_skip' }, { status: 200 });
      }
    }

    // Calculate projected points for score-related events
    if (['score_in_progress', 'round_complete', 'retroactive'].includes(payload.event_type)) {
      await enrichWithProjectedPoints(supabase, payload as SlackScorePayload);
    }

    // Determine if chirps should fire for this event type
    const isScoreEvent = ['score_in_progress', 'round_complete'].includes(payload.event_type);
    const chirpTrigger = isFeedback ? null : await loadChirpTrigger(supabase);
    const shouldSkipChirp = isScoreEvent && chirpTrigger != null
      && shouldSkipForTrigger(chirpTrigger, payload as SlackScorePayload);

    // Check if chirps-queue flag is enabled
    const queueEnabled = !isFeedback && !shouldSkipChirp && isScoreEvent
      ? await isFeatureEnabled(supabase, FEATURE_FLAGS.CHIRPS_QUEUE)
      : false;

    let chirpOverride: string | null | undefined;
    let consumedBucket: string | null = null;

    if (shouldSkipChirp) {
      chirpOverride = null;
    } else if (queueEnabled && isScoreEvent) {
      const scorePayload = payload as SlackScorePayload;
      if (scorePayload.net_strokes_over_par != null) {
        const bucketRanges = await loadBucketRanges(supabase);
        const bucket = getChirpBucket(scorePayload.net_strokes_over_par, bucketRanges);

        if (NO_CHIRP_BUCKETS.has(bucket)) {
          chirpOverride = null;
        } else {
          const popped = await popChirpFromQueue(supabase, bucket);
          if (popped) {
            chirpOverride = substituteWildcards(popped.template, scorePayload);
            consumedBucket = bucket;
          } else {
            chirpOverride = null;
          }
        }
      } else {
        chirpOverride = null;
      }
    }

    // Load chirp templates for non-queue path
    const dbTemplates = (!isFeedback && !queueEnabled && !shouldSkipChirp) ? await loadChirpTemplates(supabase) : undefined;
    const bucketRanges = (!isFeedback && !queueEnabled && !shouldSkipChirp) ? await loadBucketRanges(supabase) : undefined;

    // Format the message
    const message = formatSlackMessage(payload, dbTemplates, bucketRanges, chirpOverride);

    // Post to Slack first (don't let archiving/replenishment delay this)
    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.bot_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: targetChannel,
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

    // Trigger AI replenishment for the consumed bucket (archiving already
    // happened atomically inside popChirpFromQueue)
    if (consumedBucket) {
      try {
        await generateChirps(supabase, consumedBucket as import('@/lib/chirps').ChirpBucket);
      } catch (err) {
        console.error('Chirp replenish error (non-blocking):', err);
      }
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
  payload: SlackScorePayload
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
      const rating = payload.rating ?? payload.par;
      playerScratch = calculateScratchScore(
        payload.gross_score, rating, payload.par, holesPlayed, maxH
      ).scratchStrokesOverRating;
    }

    // The player's score may already be in the DB (just inserted before this call).
    // If not (e.g. in-progress round), we need to include it hypothetically.
    // Since we only queried is_complete=true, an in-progress player won't be in the list.
    // For projected points, include the player's score in the pool if it's a complete round.
    // For in-progress rounds, rank against the completed pool without adding themselves.
    let netScoresForRanking = [...allBestNetScores];
    let scratchScoresForRanking = [...allBestScratchScores];

    // Infer completeness from event_type when is_complete isn't explicitly set,
    // so that completed scores already in the DB aren't double-counted.
    const isComplete = payload.is_complete ??
      ['round_complete', 'retroactive'].includes(payload.event_type);

    if (!isComplete) {
      if (playerNet != null) netScoresForRanking.push(playerNet);
      if (playerScratch != null) scratchScoresForRanking.push(playerScratch);
    }

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
 * Decide whether to suppress a score event based on a trigger config value.
 * Used by both the score post trigger (gates the entire Slack message) and
 * the chirp trigger (gates whether a chirp line is included).
 *
 * - round_complete: only fire on round_complete events
 * - nine_holes_complete: fire at the turn (holes_played == 9 for in-progress)
 *   and at round completion. Suppress all other mid-round updates.
 * - all_score_updates: never skip
 */
function shouldSkipForTrigger(trigger: ChirpTrigger, payload: SlackScorePayload): boolean {
  switch (trigger) {
    case 'round_complete':
      return payload.event_type !== 'round_complete';
    case 'nine_holes_complete': {
      if (payload.event_type === 'round_complete') return false;
      const holes = payload.holes_played ?? 0;
      const maxHoles = payload.max_holes ?? 18;
      // For 9-hole courses, fire at completion (holes == maxHoles handled by round_complete event type above)
      // For 18+ hole courses, fire only at exact multiples of 9 (the turn)
      if (maxHoles <= 9) {
        return holes < maxHoles;
      }
      return holes < 9 || holes % 9 !== 0;
    }
    case 'all_score_updates':
      return false;
  }
}

/**
 * Load the chirp trigger config from app_settings.
 */
async function loadChirpTrigger(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<ChirpTrigger> {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'chirp_config')
      .maybeSingle();

    if (data?.value) {
      const config = data.value as unknown as ChirpConfig;
      return config.trigger || 'round_complete';
    }
    return 'round_complete';
  } catch {
    return 'round_complete';
  }
}

/**
 * Atomically pop the top chirp from the queue for a given bucket.
 * Calls a Postgres function that uses FOR UPDATE SKIP LOCKED so
 * concurrent score submissions always grab different rows.
 * The row is archived (queue_position cleared, archived_at set) in the
 * same transaction, so there is no separate archive step after Slack posts.
 */
async function popChirpFromQueue(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucket: string
): Promise<{ id: string; template: string } | null> {
  try {
    const { data } = await supabase
      .rpc('pop_chirp_from_queue', { target_bucket: bucket })
      .maybeSingle() as { data: { id: string; template: string } | null };

    return data ?? null;
  } catch {
    return null;
  }
}

function getFirstNameFromPayload(fullName: string): string {
  return fullName.split(' ')[0] || fullName;
}

function formatNetSign(n: number): string {
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `${n}`;
}

function substituteWildcards(template: string, p: SlackScorePayload): string {
  let result = template;
  result = result.replace(/\$first_name/g, getFirstNameFromPayload(p.player_name));
  if (p.course_name) result = result.replace(/\$course/g, p.course_name);
  if (p.gross_score != null) result = result.replace(/\$gross/g, String(p.gross_score));
  if (p.net_strokes_over_par != null) result = result.replace(/\$net/g, formatNetSign(p.net_strokes_over_par));
  if (p.holes_played != null) result = result.replace(/\$holes/g, String(p.holes_played));
  if (p.handicap_index != null) result = result.replace(/\$handicap/g, String(p.handicap_index));
  return result;
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
      .select('bucket, template')
      .is('archived_at', null);

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

/**
 * Load custom chirp bucket ranges from app_settings.
 * Returns undefined if not configured, causing fallback to DEFAULT_BUCKET_RANGES.
 */
async function loadBucketRanges(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<BucketRange[] | undefined> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'chirp_bucket_ranges')
      .single();

    if (error || !data?.value) return undefined;

    const stored = (data.value as unknown as { ranges: BucketRange[] })?.ranges;
    if (!Array.isArray(stored) || stored.length !== 6) return undefined;
    return stored;
  } catch {
    return undefined;
  }
}
