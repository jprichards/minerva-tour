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
import type { HandicapHistory } from '@/types/database';

const CHART_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c',
  '#0891b2', '#d946ef', '#ca8a04', '#4f46e5', '#059669',
  '#e11d48', '#7c3aed', '#0d9488', '#c026d3', '#b91c1c',
];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface HandicapTrendsProps {
  handicapHistory: HandicapHistory[];
  members: { id: string; name: string }[];
}

interface DataPoint {
  date: string;
  [memberId: string]: string | number;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${MONTH_ABBR[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

export function computeHandicapTrends(
  handicapHistory: HandicapHistory[],
  members: { id: string; name: string }[]
): { data: DataPoint[]; activeMemberIds: string[] } {
  if (handicapHistory.length === 0) {
    return { data: [], activeMemberIds: [] };
  }

  const byUser: Record<string, HandicapHistory[]> = {};
  for (const entry of handicapHistory) {
    if (!byUser[entry.user_id]) byUser[entry.user_id] = [];
    byUser[entry.user_id].push(entry);
  }
  for (const userId of Object.keys(byUser)) {
    byUser[userId].sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  }

  const dateSet = new Set<string>();
  for (const entry of handicapHistory) {
    dateSet.add(entry.effective_date);
  }
  const allDates = [...dateSet].sort();

  const activeMemberIds = members
    .filter((m) => byUser[m.id] && byUser[m.id].length > 0)
    .map((m) => m.id);

  const data: DataPoint[] = [];
  const lastKnown: Record<string, number | undefined> = {};

  for (const date of allDates) {
    const point: DataPoint = { date: formatDate(date) };

    for (const memberId of activeMemberIds) {
      const entries = byUser[memberId];
      if (entries) {
        const match = entries.find((e) => e.effective_date === date);
        if (match) {
          lastKnown[memberId] = match.handicap_index;
        }
      }
      if (lastKnown[memberId] !== undefined) {
        point[memberId] = lastKnown[memberId]!;
      }
    }

    data.push(point);
  }

  return { data, activeMemberIds };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  memberNameMap: Record<string, string>;
}

function CustomTooltip({ active, payload, label, memberNameMap }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const sorted = [...payload].sort((a, b) => (a.value ?? 0) - (b.value ?? 0));

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

export default function HandicapTrends({ handicapHistory, members }: HandicapTrendsProps) {
  const [hiddenMembers, setHiddenMembers] = useState<Set<string>>(new Set());

  const { data, activeMemberIds } = useMemo(
    () => computeHandicapTrends(handicapHistory, members),
    [handicapHistory, members]
  );

  const memberNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) map[m.id] = m.name;
    return map;
  }, [members]);

  const toggleMember = (id: string) => {
    setHiddenMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (data.length === 0) {
    return null;
  }

  const tickInterval = data.length <= 8 ? 0 : Math.floor(data.length / 7);

  return (
    <div>
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">Handicap Trends</h3>

      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-3" style={{ WebkitTapHighlightColor: 'transparent' }}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              axisLine={{ stroke: 'var(--border-light)' }}
              tickLine={false}
              interval={tickInterval}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
              width={35}
              allowDecimals={false}
              reversed
            />
            <Tooltip content={<CustomTooltip memberNameMap={memberNameMap} />} wrapperStyle={{ zIndex: 50 }} />
            {activeMemberIds.map((memberId, idx) => (
              <Line
                key={memberId}
                type="monotone"
                dataKey={memberId}
                stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0, fill: CHART_COLORS[idx % CHART_COLORS.length] }}
                activeDot={{ r: 5, strokeWidth: 0 }}
                hide={hiddenMembers.has(memberId)}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>

        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-[var(--border-light)]">
          {activeMemberIds.map((memberId, idx) => {
            const isHidden = hiddenMembers.has(memberId);
            const firstName = (memberNameMap[memberId] || 'Unknown').split(' ')[0];
            return (
              <button
                key={memberId}
                onClick={() => toggleMember(memberId)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium transition-all ${
                  isHidden
                    ? 'bg-[var(--bg-subtle)] text-[var(--text-faint)]'
                    : 'text-white'
                }`}
                style={!isHidden ? { backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] } : undefined}
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
