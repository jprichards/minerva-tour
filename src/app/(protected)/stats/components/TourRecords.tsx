'use client';

import { useMemo, useState } from 'react';
import { Trophy, Target, TrendingDown, Medal, Flame, Calendar } from 'lucide-react';
import type { Score, Event } from '@/types/database';
import { formatNetScore } from '@/lib/scoring';

export interface TourRecord {
  label: string;
  value: string;
  detail: string;
  icon: 'trophy' | 'target' | 'trending-down' | 'medal' | 'flame' | 'calendar';
}

interface TourRecordsProps {
  scores: Score[];
  events: Event[];
  members: { id: string; name: string }[];
}

const iconMap = {
  trophy: Trophy,
  target: Target,
  'trending-down': TrendingDown,
  medal: Medal,
  flame: Flame,
  calendar: Calendar,
} as const;

function memberName(members: { id: string; name: string }[], userId: string): string {
  return members.find((m) => m.id === userId)?.name ?? 'Unknown';
}

export function computeTourRecords(
  scores: Score[],
  events: Event[],
  members: { id: string; name: string }[]
): TourRecord[] {
  const completed = scores.filter((s) => s.is_complete && s.net_strokes_over_par != null);
  if (completed.length === 0) return [];

  const records: TourRecord[] = [];

  // Best Net Round
  let bestNet = completed[0];
  for (const s of completed) {
    if (s.net_strokes_over_par! < bestNet.net_strokes_over_par!) bestNet = s;
  }
  records.push({
    label: 'Best Net Round',
    value: formatNetScore(bestNet.net_strokes_over_par!),
    detail: `${memberName(members, bestNet.user_id)} - ${bestNet.course?.course_name ?? 'Unknown'}`,
    icon: 'trophy',
  });

  // Lowest Avg Net (min 5 rounds)
  const roundsByUser: Record<string, number[]> = {};
  for (const s of completed) {
    if (!roundsByUser[s.user_id]) roundsByUser[s.user_id] = [];
    roundsByUser[s.user_id].push(s.net_strokes_over_par!);
  }
  let bestAvgUserId: string | null = null;
  let bestAvg = Infinity;
  let bestAvgCount = 0;
  for (const userId of Object.keys(roundsByUser)) {
    const nets = roundsByUser[userId];
    if (nets.length < 5) continue;
    const avg = nets.reduce((a, b) => a + b, 0) / nets.length;
    if (avg < bestAvg) {
      bestAvg = avg;
      bestAvgUserId = userId;
      bestAvgCount = nets.length;
    }
  }
  if (bestAvgUserId) {
    const sign = bestAvg > 0 ? '+' : '';
    records.push({
      label: 'Lowest Avg Net',
      value: `${sign}${bestAvg.toFixed(1)}`,
      detail: `${memberName(members, bestAvgUserId)} - ${bestAvgCount} rounds`,
      icon: 'trending-down',
    });
  }

  // Most Rounds
  let mostRoundsUser = '';
  let mostRoundsCount = 0;
  for (const userId of Object.keys(roundsByUser)) {
    const nets = roundsByUser[userId];
    if (nets.length > mostRoundsCount) {
      mostRoundsCount = nets.length;
      mostRoundsUser = userId;
    }
  }
  if (mostRoundsUser) {
    records.push({
      label: 'Most Rounds',
      value: `${mostRoundsCount}`,
      detail: memberName(members, mostRoundsUser),
      icon: 'target',
    });
  }

  // Most Event Wins
  const eventScores = completed.filter((s) => s.event_id != null);
  const winsByUser: Record<string, number> = {};
  const eventIdSet: Record<string, boolean> = {};
  for (const s of eventScores) eventIdSet[s.event_id!] = true;
  for (const eid of Object.keys(eventIdSet)) {
    const eventRounds = eventScores.filter((s) => s.event_id === eid);
    const bestByUser: Record<string, number> = {};
    for (const s of eventRounds) {
      const prev = bestByUser[s.user_id];
      if (prev == null || s.net_strokes_over_par! < prev) {
        bestByUser[s.user_id] = s.net_strokes_over_par!;
      }
    }
    let winnerNet = Infinity;
    for (const uid of Object.keys(bestByUser)) {
      if (bestByUser[uid] < winnerNet) winnerNet = bestByUser[uid];
    }
    for (const uid of Object.keys(bestByUser)) {
      if (bestByUser[uid] === winnerNet) {
        winsByUser[uid] = (winsByUser[uid] ?? 0) + 1;
      }
    }
  }
  let mostWinsUser = '';
  let mostWins = 0;
  for (const userId of Object.keys(winsByUser)) {
    if (winsByUser[userId] > mostWins) {
      mostWins = winsByUser[userId];
      mostWinsUser = userId;
    }
  }
  if (mostWinsUser) {
    records.push({
      label: 'Most Event Wins',
      value: `${mostWins}`,
      detail: memberName(members, mostWinsUser),
      icon: 'medal',
    });
  }

  // Best Gross Round (18-hole only so 9-hole scores don't dominate)
  const withGross18 = completed.filter((s) => s.gross_score != null && s.course?.type === '18_holes');
  if (withGross18.length > 0) {
    let bestGross = withGross18[0];
    for (const s of withGross18) {
      if (s.gross_score! < bestGross.gross_score!) bestGross = s;
    }
    records.push({
      label: 'Best Gross Round',
      value: `${bestGross.gross_score}`,
      detail: `${memberName(members, bestGross.user_id)} - ${bestGross.course?.course_name ?? 'Unknown'}`,
      icon: 'flame',
    });
  }

  // Most Events Played
  const eventsByUser: Record<string, Record<string, boolean>> = {};
  for (const s of eventScores) {
    if (!eventsByUser[s.user_id]) eventsByUser[s.user_id] = {};
    eventsByUser[s.user_id][s.event_id!] = true;
  }
  let mostEventsUser = '';
  let mostEventsCount = 0;
  for (const userId of Object.keys(eventsByUser)) {
    const count = Object.keys(eventsByUser[userId]).length;
    if (count > mostEventsCount) {
      mostEventsCount = count;
      mostEventsUser = userId;
    }
  }
  if (mostEventsUser) {
    records.push({
      label: 'Most Events Played',
      value: `${mostEventsCount}`,
      detail: memberName(members, mostEventsUser),
      icon: 'calendar',
    });
  }

  return records;
}

export default function TourRecords({ scores, events, members }: TourRecordsProps) {
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null);

  const records = useMemo(
    () => computeTourRecords(scores, events, members),
    [scores, events, members]
  );

  if (records.length === 0) return null;

  return (
    <div>
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">Tour Records</h3>
      <div className="grid grid-cols-2 gap-3">
        {records.map((rec) => {
          const Icon = iconMap[rec.icon];
          const isExpanded = expandedLabel === rec.label;
          return (
            <div
              key={rec.label}
              className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] shadow-[var(--shadow-sm)] cursor-pointer"
              onClick={() => setExpandedLabel(isExpanded ? null : rec.label)}
            >
              <Icon className="w-5 h-5 text-minerva-600 mb-1" />
              <div className="text-lg font-bold text-[var(--text-primary)]">{rec.value}</div>
              <div className="text-xs text-[var(--text-muted)]">{rec.label}</div>
              <div className={`text-[10px] text-[var(--text-faint)] ${isExpanded ? 'whitespace-normal break-words' : 'truncate'}`}>{rec.detail}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
