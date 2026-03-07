/**
 * Slack message formatting utilities for Minerva Tour.
 *
 * Builds Slack Block Kit payloads for each notification event type.
 * Integrates with the chirps system for completed rounds.
 */

import { getChirp, getChirpFromTemplates, type ChirpContext } from '@/lib/chirps';
import { formatNetScore, formatGrossScore, calculatePartialPar } from '@/lib/scoring';
import type { SlackNotifyPayload, SlackScorePayload, SlackFeedbackPayload, CourseType } from '@/types/database';

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
  const hcp = p.handicap_index != null ? ` (${p.handicap_index})` : '';
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
    parts.push(`Net ${p.projected_net_points}`);
  }
  if (p.projected_scratch_points != null) {
    parts.push(`Scratch ${p.projected_scratch_points}`);
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
    parts.push(`*Holes:* ${payload.holes_played} of ${payload.max_holes}`);
  } else if (payload.holes_played != null) {
    parts.push(`*Holes:* ${payload.holes_played}`);
  }

  return parts.join('  |  ');
}

/**
 * Format a Slack message for the given payload.
 * @param dbTemplates - Optional DB-loaded chirp templates grouped by bucket.
 *   When provided, chirps are selected from these instead of the hardcoded fallback.
 */
export function formatSlackMessage(
  payload: SlackNotifyPayload,
  dbTemplates?: Record<string, string[]>
): SlackMessage {
  const { event_type } = payload;

  switch (event_type) {
    case 'tee_time':
      return formatTeeTime(payload as SlackScorePayload);
    case 'score_in_progress':
      return formatScoreInProgress(payload as SlackScorePayload, dbTemplates);
    case 'round_complete':
      return formatRoundComplete(payload as SlackScorePayload, dbTemplates);
    case 'score_edit':
      return formatScoreEdit(payload as SlackScorePayload);
    case 'retroactive':
      return formatRetroactive(payload as SlackScorePayload);
    case 'feedback_submitted':
      return formatFeedbackSubmitted(payload as SlackFeedbackPayload);
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

function formatScoreInProgress(p: SlackScorePayload, dbTemplates?: Record<string, string[]>): SlackMessage {
  const fallbackText = `Score Update — ${p.player_name} at ${p.course_name}`;

  const lines: string[] = [
    playerLine(p),
  ];

  if (p.tee_time) {
    lines.push(`Tee Time: ${formatTeeTimeDate(p.tee_time)}`);
  }

  lines.push(courseLine(p));

  const scoreLine = scoreLineMarkdown(p);
  if (scoreLine) {
    lines.push(scoreLine);
  }

  lines.push(pointsLine(p));

  const blocks: SlackBlock[] = [
    sectionBlock(lines.join('\n')),
  ];

  if (p.net_strokes_over_par != null) {
    const ctx = buildChirpContext(p);
    const chirp = dbTemplates
      ? getChirpFromTemplates(dbTemplates, p.net_strokes_over_par, ctx)
      : getChirp(p.net_strokes_over_par, ctx);
    blocks.push(sectionBlock(`:studio_microphone: _"${chirp}"_`));
  }

  return { text: fallbackText, blocks };
}

function formatRoundComplete(p: SlackScorePayload, dbTemplates?: Record<string, string[]>): SlackMessage {
  const fallbackText = `Round Complete — ${p.player_name} at ${p.course_name}`;

  const lines: string[] = [
    playerLine(p),
  ];

  if (p.tee_time) {
    lines.push(`Tee Time: ${formatTeeTimeDate(p.tee_time)}`);
  }

  lines.push(courseLine(p));

  const scoreLine = scoreLineMarkdown(p);
  if (scoreLine) {
    lines.push(scoreLine);
  }

  lines.push(pointsLine(p));

  const blocks: SlackBlock[] = [
    sectionBlock(lines.join('\n')),
  ];

  if (p.net_strokes_over_par != null) {
    const ctx = buildChirpContext(p);
    const chirp = dbTemplates
      ? getChirpFromTemplates(dbTemplates, p.net_strokes_over_par, ctx)
      : getChirp(p.net_strokes_over_par, ctx);
    blocks.push(sectionBlock(`:studio_microphone: _"${chirp}"_`));
  }

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
    parts.push(`*Holes:* ${p.holes_played}`);
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
