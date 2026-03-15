'use client';

import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  calculateRegularEventPoints,
  calculateMajorEventPoints,
  splitTiedPoints,
  calculateScratchScore,
  getMaxHoles,
} from '@/lib/scoring';
import type { Score, Event } from '@/types/database';

type ScoringMode = 'net' | 'scratch';

const CHART_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c',
  '#0891b2', '#d946ef', '#ca8a04', '#4f46e5', '#059669',
  '#e11d48', '#7c3aed', '#0d9488', '#c026d3', '#b91c1c',
];

interface PointsRaceChartProps {
  scores: Score[];
  events: Event[];
  members: { id: string; name: string }[];
}

interface RaceDataPoint {
  eventLabel: string;
  eventNumber: number;
  [memberId: string]: string | number;
}

function computePointsRace(
  scores: Score[],
  events: Event[],
  members: { id: string; name: string }[],
  mode: ScoringMode
): { data: RaceDataPoint[]; activeMemberIds: string[] } {
  const eventsWithScores = new Set(scores.map((s) => s.event_id).filter(Boolean));
  const sortedEvents = [...events]
    .filter((e) => (mode === 'scratch' || !e.is_playoff) && eventsWithScores.has(e.id))
    .sort((a, b) => a.event_number - b.event_number);

  const cumulative: Record<string, number> = {};
  const participatedMembers = new Set<string>();
  const data: RaceDataPoint[] = [];
  const lastSeasonEventNumber = Math.max(...events.map((e) => e.event_number));

  for (const event of sortedEvents) {
    const eventScores = scores.filter((s) => s.event_id === event.id);

    // Best score per user for this event
    const byUser: Record<string, Score> = {};
    for (const score of eventScores) {
      const existing = byUser[score.user_id];
      if (mode === 'net') {
        const sNop = score.net_strokes_over_par ?? 999;
        const eNop = existing?.net_strokes_over_par ?? 999;
        if (!existing || sNop < eNop) byUser[score.user_id] = score;
      } else {
        const sMax = getMaxHoles(score.course?.type || '18_holes');
        const sDiff = score.gross_score != null
          ? calculateScratchScore(score.gross_score, score.course?.rating || 72, score.course?.par || 72, score.holes_played || sMax, sMax).scratchStrokesOverRating
          : 999;
        const eMax = existing ? getMaxHoles(existing.course?.type || '18_holes') : 18;
        const eDiff = existing?.gross_score != null
          ? calculateScratchScore(existing.gross_score, existing.course?.rating || 72, existing.course?.par || 72, existing.holes_played || eMax, eMax).scratchStrokesOverRating
          : 999;
        if (!existing || sDiff < eDiff) byUser[score.user_id] = score;
      }
    }

    // Rank and assign points
    const ranked = Object.entries(byUser).sort(([, a], [, b]) => {
      if (mode === 'net') {
        return (a.net_strokes_over_par ?? 999) - (b.net_strokes_over_par ?? 999);
      }
      const aMax = getMaxHoles(a.course?.type || '18_holes');
      const bMax = getMaxHoles(b.course?.type || '18_holes');
      const aS = a.gross_score != null
        ? calculateScratchScore(a.gross_score, a.course?.rating || 72, a.course?.par || 72, a.holes_played || aMax, aMax).scratchStrokesOverRating
        : 999;
      const bS = b.gross_score != null
        ? calculateScratchScore(b.gross_score, b.course?.rating || 72, b.course?.par || 72, b.holes_played || bMax, bMax).scratchStrokesOverRating
        : 999;
      return aS - bS;
    });

    const numParticipants = ranked.length;

    const isLastEvent = event.event_number === lastSeasonEventNumber;
    const isMajorForMode = mode === 'scratch'
      ? (event.is_major || isLastEvent)
      : event.is_major;

    let ri = 0;
    while (ri < ranked.length) {
      const [, refScore] = ranked[ri];
      const refVal = mode === 'net'
        ? (refScore.net_strokes_over_par ?? 999)
        : (() => {
            const m = getMaxHoles(refScore.course?.type || '18_holes');
            return refScore.gross_score != null
              ? calculateScratchScore(refScore.gross_score, refScore.course?.rating || 72, refScore.course?.par || 72, refScore.holes_played || m, m).scratchStrokesOverRating
              : 999;
          })();

      let rj = ri;
      while (rj < ranked.length) {
        const [, s] = ranked[rj];
        const val = mode === 'net'
          ? (s.net_strokes_over_par ?? 999)
          : (() => {
              const m = getMaxHoles(s.course?.type || '18_holes');
              return s.gross_score != null
                ? calculateScratchScore(s.gross_score, s.course?.rating || 72, s.course?.par || 72, s.holes_played || m, m).scratchStrokesOverRating
                : 999;
            })();
        if (val !== refVal) break;
        rj++;
      }

      const numTied = rj - ri;
      let assignedPoints: number;
      if (numTied > 1) {
        const tiedPts: number[] = [];
        for (let k = ri; k < rj; k++) {
          tiedPts.push(
            isMajorForMode
              ? calculateMajorEventPoints(numParticipants, k + 1)
              : calculateRegularEventPoints(numParticipants, k + 1)
          );
        }
        assignedPoints = splitTiedPoints(tiedPts, numTied);
      } else {
        assignedPoints = isMajorForMode
          ? calculateMajorEventPoints(numParticipants, ri + 1)
          : calculateRegularEventPoints(numParticipants, ri + 1);
      }

      for (let k = ri; k < rj; k++) {
        const [userId] = ranked[k];
        cumulative[userId] = (cumulative[userId] || 0) + assignedPoints;
        participatedMembers.add(userId);
      }

      ri = rj;
    }

    const point: RaceDataPoint = {
      eventLabel: event.is_major ? `${event.event_number}*` : `${event.event_number}`,
      eventNumber: event.event_number,
    };

    for (const member of members) {
      if (participatedMembers.has(member.id)) {
        point[member.id] = Math.round((cumulative[member.id] || 0) * 10) / 10;
      }
    }

    data.push(point);
  }

  if (data.length > 0) {
    const startPoint: RaceDataPoint = {
      eventLabel: '0',
      eventNumber: 0,
    };
    for (const memberId of participatedMembers) {
      startPoint[memberId] = 0;
    }
    data.unshift(startPoint);
  }

  const activeMemberIds = members
    .filter((m) => participatedMembers.has(m.id))
    .map((m) => m.id);

  return { data, activeMemberIds };
}

function getMemberColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  memberNameMap: Record<string, string>;
}

function CustomTooltip({ active, payload, label, memberNameMap }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-light)] shadow-lg rounded-lg p-2.5 max-w-[200px]">
      <p className="text-xs font-semibold text-[var(--text-primary)] mb-1.5">{label}</p>
      <div className="space-y-0.5">
        {sorted.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-[11px] text-[var(--text-muted)] truncate">
                {memberNameMap[entry.name] || entry.name}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-[var(--text-primary)] shrink-0">
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TOP_N = 6;

export default function PointsRaceChart({ scores, events, members }: PointsRaceChartProps) {
  const [mode, setMode] = useState<ScoringMode>('net');
  const [hiddenMembers, setHiddenMembers] = useState<Set<string> | null>(null);

  const { data, activeMemberIds } = useMemo(
    () => computePointsRace(scores, events, members, mode),
    [scores, events, members, mode]
  );

  const top6Ids = useMemo(() => {
    if (data.length === 0 || activeMemberIds.length <= TOP_N) return new Set<string>();
    const lastPoint = data[data.length - 1];
    const sorted = [...activeMemberIds].sort((a, b) => {
      const aVal = typeof lastPoint[a] === 'number' ? (lastPoint[a] as number) : 0;
      const bVal = typeof lastPoint[b] === 'number' ? (lastPoint[b] as number) : 0;
      return bVal - aVal;
    });
    return new Set(sorted.slice(TOP_N));
  }, [data, activeMemberIds]);

  const effectiveHidden = hiddenMembers ?? top6Ids;
  const showingAll = effectiveHidden.size === 0 || (hiddenMembers !== null && hiddenMembers.size === 0);

  const memberNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) map[m.id] = m.name;
    return map;
  }, [members]);

  const toggleMember = (id: string) => {
    setHiddenMembers((prev) => {
      const base = prev ?? new Set(top6Ids);
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleShowAll = () => {
    if (showingAll) {
      setHiddenMembers(null);
    } else {
      setHiddenMembers(new Set());
    }
  };

  if (data.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Points Race</h3>
        <div className="flex bg-[var(--bg-subtle)] rounded-lg p-0.5">
          <button
            onClick={() => setMode('net')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              mode === 'net'
                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--text-muted)]'
            }`}
          >
            Net
          </button>
          <button
            onClick={() => setMode('scratch')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              mode === 'scratch'
                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--text-muted)]'
            }`}
          >
            Scratch
          </button>
        </div>
      </div>

      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-3 overflow-hidden" style={{ WebkitTapHighlightColor: 'transparent' }}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
            <XAxis
              dataKey="eventLabel"
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              axisLine={{ stroke: 'var(--border-light)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
              width={35}
            />
            <Tooltip content={<CustomTooltip memberNameMap={memberNameMap} />} />
            {activeMemberIds.map((memberId, idx) => (
              <Line
                key={memberId}
                type="monotone"
                dataKey={memberId}
                stroke={getMemberColor(idx)}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0, fill: getMemberColor(idx) }}
                activeDot={{ r: 5, strokeWidth: 0 }}
                hide={effectiveHidden.has(memberId)}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>

        {/* Member filter chips */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-[var(--border-light)]">
          {activeMemberIds.length > TOP_N && (
            <button
              onClick={toggleShowAll}
              className={`px-2 py-1 rounded-full text-[11px] font-medium transition-colors ${
                showingAll
                  ? 'bg-minerva-600 text-white'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
              }`}
            >
              {showingAll ? 'Top 6' : 'All'}
            </button>
          )}
          {activeMemberIds.map((memberId, idx) => {
            const isHidden = effectiveHidden.has(memberId);
            const name = memberNameMap[memberId] || 'Unknown';
            const firstName = name.split(' ')[0];
            return (
              <button
                key={memberId}
                onClick={() => toggleMember(memberId)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium transition-all ${
                  isHidden
                    ? 'bg-[var(--bg-subtle)] text-[var(--text-faint)]'
                    : 'text-white'
                }`}
                style={!isHidden ? { backgroundColor: getMemberColor(idx) } : undefined}
              >
                {firstName}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { computePointsRace };
export type { RaceDataPoint };
