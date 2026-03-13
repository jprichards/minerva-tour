'use client';

import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { Score } from '@/types/database';

interface ActivityChartProps {
  scores: Score[];
  members: { id: string; name: string }[];
}

interface ActivityEntry {
  name: string;
  firstName: string;
  rounds: number;
}

const GOLD = '#ca8a04';
const SILVER = '#9ca3af';

function interpolateColor(rank: number, total: number): string {
  if (total <= 1) return GOLD;
  const t = rank / (total - 1);
  const goldRgb = [202, 138, 4];
  const silverRgb = [156, 163, 175];
  const r = Math.round(goldRgb[0] + t * (silverRgb[0] - goldRgb[0]));
  const g = Math.round(goldRgb[1] + t * (silverRgb[1] - goldRgb[1]));
  const b = Math.round(goldRgb[2] + t * (silverRgb[2] - goldRgb[2]));
  return `rgb(${r}, ${g}, ${b})`;
}

export function computeActivity(
  scores: Score[],
  members: { id: string; name: string }[]
): ActivityEntry[] {
  const countMap: Record<string, number> = {};
  for (const s of scores) {
    countMap[s.user_id] = (countMap[s.user_id] || 0) + 1;
  }

  return members
    .filter((m) => countMap[m.id])
    .map((m) => ({
      name: m.name,
      firstName: m.name.split(' ')[0],
      rounds: countMap[m.id],
    }))
    .sort((a, b) => b.rounds - a.rounds);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ActivityEntry }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0].payload;
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-light)] shadow-lg rounded-lg px-2.5 py-1.5">
      <p className="text-xs font-semibold text-[var(--text-primary)]">{entry.name}</p>
      <p className="text-[11px] text-[var(--text-muted)]">{entry.rounds} round{entry.rounds !== 1 ? 's' : ''}</p>
    </div>
  );
}

const INITIAL_SHOW = 10;

export default function ActivityChart({ scores, members }: ActivityChartProps) {
  const [showAll, setShowAll] = useState(false);
  const data = useMemo(() => computeActivity(scores, members), [scores, members]);

  if (data.length === 0) return null;

  const visible = showAll ? data : data.slice(0, INITIAL_SHOW);
  const hasMore = data.length > INITIAL_SHOW;
  const chartHeight = Math.max(visible.length * 36, 120);

  return (
    <div>
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">Rounds Played</h3>
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden" style={{ WebkitTapHighlightColor: 'transparent' }}>
        <div className="p-3">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={visible}
              layout="vertical"
              margin={{ top: 0, right: 30, bottom: 0, left: 0 }}
            >
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="firstName"
                tick={{ fontSize: 11, fill: 'var(--text-primary)' }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-subtle)', opacity: 0.5 }} />
              <Bar dataKey="rounds" radius={[0, 4, 4, 0]} barSize={20}>
                {visible.map((_, idx) => (
                  <Cell key={idx} fill={interpolateColor(idx, visible.length)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {hasMore && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full py-2.5 text-center text-xs font-medium text-minerva-600 hover:text-minerva-700 border-t border-[var(--border-light)] transition-colors"
          >
            {showAll ? 'Show less' : `Show all ${data.length} members`}
          </button>
        )}
      </div>
    </div>
  );
}
