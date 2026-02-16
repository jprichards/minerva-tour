/**
 * Slack message formatting utilities for Minerva Tour.
 *
 * Builds Slack Block Kit payloads for each notification event type.
 * Integrates with the chirps system for completed rounds.
 */

import { getChirp } from '@/lib/chirps';
import { formatNetScore, formatGrossScore, calculatePartialPar } from '@/lib/scoring';
import type { SlackEventType, SlackNotifyPayload, CourseType } from '@/types/database';

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

/**
 * Format a tee time date as "Saturday, Feb 16 at 10:30 AM"
 */
function formatTeeTimeDate(isoString: string): string {
  const d = new Date(isoString);
  const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${dayOfWeek}, ${monthDay} at ${time}`;
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
function playerLine(p: SlackNotifyPayload): string {
  const hcp = p.handicap_index != null ? ` (${p.handicap_index})` : '';
  return `*${p.player_name}*${hcp}`;
}

/**
 * Format the course line: "Pine Valley - White Tees (18 Holes)"
 */
function courseLine(p: SlackNotifyPayload): string {
  const holesLabel = formatCourseType(p.course_type);
  const holesStr = holesLabel ? ` (${holesLabel})` : '';
  return `${p.course_name} - ${p.tee_name}${holesStr}`;
}

/**
 * Format the projected points line for display.
 * Shows "Points: Net X | Scratch Y", falling back to "-" when unavailable.
 */
function pointsLine(p: SlackNotifyPayload): string {
  const parts: string[] = [];
  if (p.projected_net_points != null) {
    parts.push(`Net ${p.projected_net_points}`);
  }
  if (p.projected_scratch_points != null) {
    parts.push(`Scratch ${p.projected_scratch_points}`);
  }
  return parts.length > 0 ? `Points: ${parts.join(' | ')}` : 'Points: -';
}

function scoreLineMarkdown(payload: SlackNotifyPayload): string {
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

export function formatSlackMessage(payload: SlackNotifyPayload): SlackMessage {
  const { event_type } = payload;

  switch (event_type) {
    case 'tee_time':
      return formatTeeTime(payload);
    case 'score_in_progress':
      return formatScoreInProgress(payload);
    case 'round_complete':
      return formatRoundComplete(payload);
    case 'score_edit':
      return formatScoreEdit(payload);
    case 'retroactive':
      return formatRetroactive(payload);
    default: {
      const _exhaustive: never = event_type;
      throw new Error(`Unknown event type: ${_exhaustive}`);
    }
  }
}

function formatTeeTime(p: SlackNotifyPayload): SlackMessage {
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

function formatScoreInProgress(p: SlackNotifyPayload): SlackMessage {
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
    const chirp = getChirp(p.net_strokes_over_par, getFirstName(p.player_name));
    blocks.push(sectionBlock(`:studio_microphone: _"${chirp}"_`));
  }

  return { text: fallbackText, blocks };
}

function formatRoundComplete(p: SlackNotifyPayload): SlackMessage {
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
    const chirp = getChirp(p.net_strokes_over_par, getFirstName(p.player_name));
    blocks.push(sectionBlock(`:studio_microphone: _"${chirp}"_`));
  }

  return { text: fallbackText, blocks };
}

function formatScoreEdit(p: SlackNotifyPayload): SlackMessage {
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

function formatRetroactive(p: SlackNotifyPayload): SlackMessage {
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
