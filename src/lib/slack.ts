/**
 * Slack message formatting utilities for Minerva Tour.
 *
 * Builds Slack Block Kit payloads for each notification event type.
 * Integrates with the chirps system for completed rounds.
 */

import { getChirp, getChirpFromTemplates, type ChirpContext, type BucketRange } from '@/lib/chirps';
import { formatNetScore, formatGrossScore, calculatePartialPar, formatPoints } from '@/lib/scoring';
import type { SlackNotifyPayload, SlackScorePayload, SlackFeedbackPayload, SlackPlayoffPayload, SlackEventType, CourseType } from '@/types/database';

/**
 * Default enabled/disabled state for each Slack event type. Shared between
 * the App Settings admin UI and the notify route so a stored config that
 * predates a new event type (missing key) still gets the intended default
 * instead of silently falling back to "enabled".
 *
 * Playoff defaults (per commish): match play fires live on every
 * hole/score entry (`playoff_status_update` ON); stroke play relies on the
 * existing score-update messages instead (`playoff_stroke_score` OFF).
 * `playoff_format_set` is chatty/low-value so it ships OFF; the rest
 * default ON.
 */
export const DEFAULT_SLACK_EVENTS: Record<SlackEventType, boolean> = {
  tee_time: true,
  score_in_progress: true,
  round_complete: true,
  score_edit: true,
  retroactive: true,
  feedback_submitted: true,
  playoff_format_set: false,
  playoff_match_start: true,
  playoff_status_update: true,
  playoff_stroke_score: false,
  playoff_match_final: true,
  playoff_round_complete: true,
};

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
}

export interface SlackMessage {
  text: string;
  blocks: SlackBlock[];
}

function sectionBlock(markdown: string): SlackBlock {
  return { type: 'section', text: { type: 'mrkdwn', text: markdown } };
}

function buildChirpContext(p: SlackScorePayload): ChirpContext {
  return {
    firstName: getFirstName(p.player_name),
    course: p.course_name || null,
    gross: p.gross_score ?? null,
    net: p.net_strokes_over_par ?? null,
    holes: p.holes_played ?? null,
    handicap: p.handicap_index ?? null,
  };
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Format a tee time date as "Sunday, Mar 15 at 1:00 PM".
 *
 * Parses the date/time components directly from the string and uses
 * Date only for day-of-week calculation (via UTC methods) so that no
 * local-timezone conversion can shift the displayed time.
 */
function formatTeeTimeDate(dateTimeStr: string): string {
  const [datePart, timePart] = dateTimeStr.split('T');
  const [yearStr, monthStr, dayStr] = datePart.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const day = parseInt(dayStr);

  const d = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = DAY_NAMES[d.getUTCDay()];
  const monthName = MONTH_NAMES[month - 1];

  let timeFormatted = '';
  if (timePart) {
    const [hourStr, minStr] = timePart.split(':');
    let hour = parseInt(hourStr);
    const min = minStr?.slice(0, 2) || '00';
    const hasExplicitTime = hour !== 0 || min !== '00';
    if (hasExplicitTime) {
      const ampm = hour >= 12 ? 'PM' : 'AM';
      if (hour === 0) hour = 12;
      else if (hour > 12) hour -= 12;
      timeFormatted = ` at ${hour}:${min} ${ampm}`;
    }
  }

  return `${dayOfWeek}, ${monthName} ${day}${timeFormatted}`;
}

function getFirstName(fullName: string): string {
  return fullName.split(' ')[0] || fullName;
}

/**
 * Format course type for display: "18 Holes", "9 Holes", "Front 9", "Back 9"
 */
function formatCourseType(courseType?: CourseType): string {
  switch (courseType) {
    case '18_holes': return '18 Holes';
    case '9_holes': return '9 Holes';
    case 'front_9': return 'Front 9';
    case 'back_9': return 'Back 9';
    default: return '';
  }
}

/**
 * Format the player line: "John Smith (12.4)" or "John Smith" if no handicap
 */
function playerLine(p: SlackScorePayload): string {
  const hcp = p.handicap_index != null ? ` *(${p.handicap_index})*` : '';
  return `*${p.player_name}*${hcp}`;
}

/**
 * Format the course line: "Pine Valley - White Tees (18 Holes)"
 */
function courseLine(p: SlackScorePayload): string {
  const holesLabel = formatCourseType(p.course_type);
  const holesStr = holesLabel ? ` (${holesLabel})` : '';
  return `${p.course_name} - ${p.tee_name}${holesStr}`;
}

/**
 * Format the projected points line for display.
 * Shows "Points: Net X | Scratch Y", falling back to "-" when unavailable.
 */
function pointsLine(p: SlackScorePayload): string {
  const parts: string[] = [];
  if (p.projected_net_points != null) {
    parts.push(`Net ${formatPoints(p.projected_net_points)}`);
  }
  if (p.projected_scratch_points != null) {
    parts.push(`Scratch ${formatPoints(p.projected_scratch_points)}`);
  }
  return parts.length > 0 ? `Points: ${parts.join(' | ')}` : 'Points: -';
}

function scoreLineMarkdown(payload: SlackScorePayload): string {
  const parts: string[] = [];
  const isPartial = payload.holes_played != null
    && payload.max_holes != null
    && payload.holes_played < payload.max_holes;

  if (payload.gross_score != null) {
    // Use partial par for partial rounds so the to-par number makes sense
    const effectivePar = isPartial
      ? calculatePartialPar(payload.par, payload.holes_played!, payload.max_holes!)
      : payload.par;
    parts.push(`*Gross:* ${formatGrossScore(payload.gross_score, effectivePar)}`);
  }

  if (payload.net_strokes_over_par != null) {
    parts.push(`*Net:* ${formatNetScore(payload.net_strokes_over_par)}`);
  }

  if (payload.holes_played != null && payload.max_holes) {
    const thruValue = payload.holes_played >= payload.max_holes
      ? 'F'
      : `${payload.holes_played} of ${payload.max_holes}`;
    parts.push(`*Thru:* ${thruValue}`);
  } else if (payload.holes_played != null) {
    parts.push(`*Thru:* ${payload.holes_played}`);
  }

  return parts.join('  |  ');
}

/**
 * Format a Slack message for the given payload.
 * @param dbTemplates - Optional DB-loaded chirp templates grouped by bucket.
 *   When provided, chirps are selected from these instead of the hardcoded fallback.
 * @param bucketRanges - Optional custom bucket ranges loaded from app_settings.
 * @param chirpOverride - Pre-selected chirp text (already substituted). When provided,
 *   score_in_progress and round_complete use this instead of selecting from templates.
 *   Pass null to explicitly skip chirps for this message.
 */
export function formatSlackMessage(
  payload: SlackNotifyPayload,
  dbTemplates?: Record<string, string[]>,
  bucketRanges?: BucketRange[],
  chirpOverride?: string | null
): SlackMessage {
  const { event_type } = payload;

  switch (event_type) {
    case 'tee_time':
      return formatTeeTime(payload as SlackScorePayload);
    case 'score_in_progress':
      return formatScoreInProgress(payload as SlackScorePayload, dbTemplates, bucketRanges, chirpOverride);
    case 'round_complete':
      return formatRoundComplete(payload as SlackScorePayload, dbTemplates, bucketRanges, chirpOverride);
    case 'score_edit':
      return formatScoreEdit(payload as SlackScorePayload);
    case 'retroactive':
      return formatRetroactive(payload as SlackScorePayload);
    case 'feedback_submitted':
      return formatFeedbackSubmitted(payload as SlackFeedbackPayload);
    case 'playoff_format_set':
      return formatPlayoffFormatSet(payload as SlackPlayoffPayload);
    case 'playoff_match_start':
      return formatPlayoffMatchStart(payload as SlackPlayoffPayload);
    case 'playoff_status_update':
      return formatPlayoffStatusUpdate(payload as SlackPlayoffPayload);
    case 'playoff_stroke_score':
      return formatPlayoffStrokeScore(payload as SlackPlayoffPayload);
    case 'playoff_match_final':
      return formatPlayoffMatchFinal(payload as SlackPlayoffPayload);
    case 'playoff_round_complete':
      return formatPlayoffRoundComplete(payload as SlackPlayoffPayload);
    default: {
      const _exhaustive: never = event_type;
      throw new Error(`Unknown event type: ${_exhaustive}`);
    }
  }
}

function formatTeeTime(p: SlackScorePayload): SlackMessage {
  const fallbackText = `New Tee Time — ${p.player_name} at ${p.course_name} (${p.tee_name})`;

  const lines: string[] = [
    playerLine(p),
  ];

  if (p.tee_time) {
    lines.push(`Tee Time: ${formatTeeTimeDate(p.tee_time)}`);
  }

  lines.push(courseLine(p));
  lines.push('Points: -');

  const blocks: SlackBlock[] = [
    sectionBlock(lines.join('\n')),
  ];

  return { text: fallbackText, blocks };
}

function formatScoreInProgress(p: SlackScorePayload, dbTemplates?: Record<string, string[]>, bucketRanges?: BucketRange[], chirpOverride?: string | null): SlackMessage {
  const fallbackText = `Score Update — ${p.player_name} at ${p.course_name}`;

  const lines: string[] = [];

  if (chirpOverride !== null) {
    if (chirpOverride) {
      lines.push(chirpOverride);
    } else if (p.net_strokes_over_par != null) {
      const ctx = buildChirpContext(p);
      const chirp = dbTemplates
        ? getChirpFromTemplates(dbTemplates, p.net_strokes_over_par, ctx, bucketRanges)
        : getChirp(p.net_strokes_over_par, ctx, bucketRanges);
      lines.push(chirp);
    }
  }

  lines.push(playerLine(p));
  lines.push(courseLine(p));

  const scoreLine = scoreLineMarkdown(p);
  if (scoreLine) {
    lines.push(scoreLine);
  }

  lines.push(pointsLine(p));

  const blocks: SlackBlock[] = [
    sectionBlock(lines.join('\n')),
  ];

  return { text: fallbackText, blocks };
}

function formatRoundComplete(p: SlackScorePayload, dbTemplates?: Record<string, string[]>, bucketRanges?: BucketRange[], chirpOverride?: string | null): SlackMessage {
  const fallbackText = `Round Complete — ${p.player_name} at ${p.course_name}`;

  const lines: string[] = [];

  if (chirpOverride !== null) {
    if (chirpOverride) {
      lines.push(chirpOverride);
    } else if (p.net_strokes_over_par != null) {
      const ctx = buildChirpContext(p);
      const chirp = dbTemplates
        ? getChirpFromTemplates(dbTemplates, p.net_strokes_over_par, ctx, bucketRanges)
        : getChirp(p.net_strokes_over_par, ctx, bucketRanges);
      lines.push(chirp);
    }
  }

  lines.push(playerLine(p));
  lines.push(courseLine(p));

  const scoreLine = scoreLineMarkdown(p);
  if (scoreLine) {
    lines.push(scoreLine);
  }

  lines.push(pointsLine(p));

  const blocks: SlackBlock[] = [
    sectionBlock(lines.join('\n')),
  ];

  return { text: fallbackText, blocks };
}

function formatScoreEdit(p: SlackScorePayload): SlackMessage {
  const fallbackText = `Score Updated — ${p.player_name} at ${p.course_name}`;

  const lines: string[] = [
    playerLine(p),
    courseLine(p),
  ];

  const parts: string[] = [];
  if (p.old_gross_score != null && p.gross_score != null) {
    parts.push(`*Gross:* ${p.old_gross_score} → ${p.gross_score}`);
  }
  if (p.old_net_score != null && p.net_strokes_over_par != null) {
    parts.push(`*Net:* ${formatNetScore(p.old_net_score)} → ${formatNetScore(p.net_strokes_over_par)}`);
  }
  if (p.holes_played != null) {
    parts.push(`*Thru:* ${p.holes_played}`);
  }
  if (parts.length > 0) {
    lines.push(parts.join('  |  '));
  }

  const blocks: SlackBlock[] = [
    sectionBlock(lines.join('\n')),
  ];

  return { text: fallbackText, blocks };
}

function formatRetroactive(p: SlackScorePayload): SlackMessage {
  const fallbackText = `Retroactive Score — ${p.player_name} at ${p.course_name}`;

  const lines: string[] = [
    playerLine(p),
    courseLine(p),
  ];

  const scoreLine = scoreLineMarkdown(p);
  if (scoreLine) {
    lines.push(scoreLine);
  }

  if (p.event_name) {
    lines.push(`Event: ${p.event_name}`);
  }

  lines.push(pointsLine(p));

  const blocks: SlackBlock[] = [
    sectionBlock(lines.join('\n')),
  ];

  return { text: fallbackText, blocks };
}

const FEEDBACK_TYPE_LABELS: Record<string, string> = {
  bug: 'Bug Report',
  feature_request: 'Feature Request',
  other: 'Other',
};

const FEEDBACK_TYPE_EMOJI: Record<string, string> = {
  bug: ':bug:',
  feature_request: ':bulb:',
  other: ':speech_balloon:',
};

function formatFeedbackSubmitted(p: SlackFeedbackPayload): SlackMessage {
  const typeLabel = FEEDBACK_TYPE_LABELS[p.feedback_type] || p.feedback_type;
  const emoji = FEEDBACK_TYPE_EMOJI[p.feedback_type] || ':memo:';
  const fallbackText = `New Feedback — ${typeLabel} from ${p.user_name}: ${p.title}`;

  const lines: string[] = [
    `${emoji} *${typeLabel}* from *${p.user_name}*`,
    `*${p.title}*`,
    p.description,
  ];

  if (p.attachments && p.attachments.length > 0) {
    const attachmentLinks = p.attachments
      .map((url, i) => `<${url}|Attachment ${i + 1}>`)
      .join('  ');
    lines.push(`\n:paperclip: ${attachmentLinks}`);
  }

  const blocks: SlackBlock[] = [
    sectionBlock(lines.join('\n')),
  ];

  return { text: fallbackText, blocks };
}

const PLAYOFF_FLIGHT_LABELS: Record<string, string> = {
  championship: 'Championship',
  consolation: 'Consolation',
  unicorn: 'Unicorn',
};

const PLAYOFF_FORMAT_LABELS: Record<string, string> = {
  stroke_play: 'Stroke Play',
  match_play: 'Match Play',
};

function matchupLine(p: SlackPlayoffPayload): string {
  return `*${p.player1_name ?? 'Player 1'}* vs *${p.player2_name ?? 'Player 2'}*`;
}

function flightRoundLine(p: SlackPlayoffPayload): string {
  const flightLabel = PLAYOFF_FLIGHT_LABELS[p.flight] || p.flight;
  const roundLabel = p.round_label || `Round ${p.round}`;
  return `${flightLabel} — ${roundLabel}`;
}

function formatPlayoffFormatSet(p: SlackPlayoffPayload): SlackMessage {
  const formatLabel = p.format ? PLAYOFF_FORMAT_LABELS[p.format] : 'a format';
  const holesLabel = p.holes ? ` (${p.holes} holes)` : '';
  const fallbackText = `Playoff format set — ${p.player1_name} vs ${p.player2_name}: ${formatLabel}${holesLabel}`;

  const lines = [
    `⛳ ${matchupLine(p)} set their matchup to *${formatLabel}${holesLabel}*.`,
    flightRoundLine(p),
  ];

  return { text: fallbackText, blocks: [sectionBlock(lines.join('\n'))] };
}

function formatPlayoffMatchStart(p: SlackPlayoffPayload): SlackMessage {
  const formatLabel = p.format ? PLAYOFF_FORMAT_LABELS[p.format] : null;
  const holesLabel = p.holes ? `, ${p.holes} holes` : '';
  const detail = formatLabel ? ` (${formatLabel}${holesLabel})` : '';
  const fallbackText = `Match started — ${p.player1_name} vs ${p.player2_name}`;

  const lines = [
    `🏁 Match started: ${matchupLine(p)}${detail}`,
    flightRoundLine(p),
  ];

  return { text: fallbackText, blocks: [sectionBlock(lines.join('\n'))] };
}

function formatPlayoffStatusUpdate(p: SlackPlayoffPayload): SlackMessage {
  const statusSuffix = p.status_text ? ` — ${p.status_text}` : '';
  const fallbackText = `Playoff update — ${p.player1_name} vs ${p.player2_name}${statusSuffix}`;

  const lines = [
    `⛳ ${matchupLine(p)}${statusSuffix}`,
    flightRoundLine(p),
  ];
  if (p.hole_number != null) lines.push(`Hole ${p.hole_number}`);

  return { text: fallbackText, blocks: [sectionBlock(lines.join('\n'))] };
}

function formatPlayoffStrokeScore(p: SlackPlayoffPayload): SlackMessage {
  const statusSuffix = p.status_text ? ` — ${p.status_text}` : '';
  const fallbackText = `Playoff stroke play update — ${p.player1_name} vs ${p.player2_name}${statusSuffix}`;

  const lines = [
    `⛳ ${matchupLine(p)}${statusSuffix}`,
    flightRoundLine(p),
  ];

  return { text: fallbackText, blocks: [sectionBlock(lines.join('\n'))] };
}

function formatPlayoffMatchFinal(p: SlackPlayoffPayload): SlackMessage {
  const loserName = p.winner_name === p.player1_name ? p.player2_name : p.player1_name;
  const resultSuffix = p.status_text ? ` ${p.status_text}` : '';
  const fallbackText = `Match Final — ${p.winner_name} defeats ${loserName}${resultSuffix}`;

  const lines = [
    `🏆 *${p.winner_name}* defeats *${loserName}*${resultSuffix} and advances!`,
    flightRoundLine(p),
  ];

  return { text: fallbackText, blocks: [sectionBlock(lines.join('\n'))] };
}

function formatPlayoffRoundComplete(p: SlackPlayoffPayload): SlackMessage {
  const flightLabel = PLAYOFF_FLIGHT_LABELS[p.flight] || p.flight;
  const roundLabel = p.round_label || `Round ${p.round}`;
  const countLabel = p.matchup_count != null ? ` (${p.matchup_count} matchup${p.matchup_count !== 1 ? 's' : ''})` : '';
  const fallbackText = `${roundLabel} complete — ${flightLabel}${countLabel}`;

  const lines = [`🎉 *${roundLabel}* complete for the *${flightLabel}* flight${countLabel}!`];

  return { text: fallbackText, blocks: [sectionBlock(lines.join('\n'))] };
}
