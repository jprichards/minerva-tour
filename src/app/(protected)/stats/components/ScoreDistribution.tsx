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

interface ScoreDistributionProps {
  scores: Score[];
  currentUserId?: string;
}

interface BinEntry {
  label: string;
  total: number;
  mine: number;
  netValue: number;
}

function formatBinLabel(n: number): string {
  if (n === 0) return 'E';
  if (n > 0) return `+${n}`;
  return `${n}`;
}

export function computeDistribution(
  scores: Score[],
  currentUserId?: string
): BinEntry[] {
  const totalCounts: Record<number, number> = {};
  const myCounts: Record<number, number> = {};
  let minVal = Infinity;
  let maxVal = -Infinity;

  for (const s of scores) {
    const nop = s.net_strokes_over_par;
    if (nop == null) continue;
    totalCounts[nop] = (totalCounts[nop] || 0) + 1;
    if (currentUserId && s.user_id === currentUserId) {
      myCounts[nop] = (myCounts[nop] || 0) + 1;
    }
    if (nop < minVal) minVal = nop;
    if (nop > maxVal) maxVal = nop;
  }

  if (minVal > maxVal) return [];

  const bins: BinEntry[] = [];
  for (let n = minVal; n <= maxVal; n++) {
    const total = totalCounts[n] || 0;
    const mine = myCounts[n] || 0;
    if (total === 0 && n !== 0) continue;
    bins.push({ label: formatBinLabel(n), total, mine, netValue: n });
  }

  return bins;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: BinEntry }>;
  showMine: boolean;
}

function CustomTooltip({ active, payload, showMine }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0].payload;
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-light)] shadow-lg rounded-lg px-2.5 py-1.5">
      <p className="text-xs font-semibold text-[var(--text-primary)]">
        Net {entry.label}
      </p>
      <p className="text-[11px] text-[var(--text-muted)]">
        {entry.total} round{entry.total !== 1 ? 's' : ''} total
      </p>
      {showMine && entry.mine > 0 && (
        <p className="text-[11px] text-minerva-600">
          {entry.mine} of yours
        </p>
      )}
    </div>
  );
}

function computeCoreRange(bins: BinEntry[]): { coreStart: number; coreEnd: number } {
  const totalScores = bins.reduce((sum, b) => sum + b.total, 0);
  if (totalScores === 0 || bins.length <= 20) {
    return { coreStart: bins[0]?.netValue ?? 0, coreEnd: bins[bins.length - 1]?.netValue ?? 0 };
  }
  const trimTarget = Math.ceil(totalScores * 0.02);
  let leftTrim = 0;
  let coreStart = bins[0].netValue;
  for (const b of bins) {
    if (leftTrim + b.total > trimTarget) { coreStart = b.netValue; break; }
    leftTrim += b.total;
    coreStart = b.netValue;
  }
  let rightTrim = 0;
  let coreEnd = bins[bins.length - 1].netValue;
  for (let i = bins.length - 1; i >= 0; i--) {
    if (rightTrim + bins[i].total > trimTarget) { coreEnd = bins[i].netValue; break; }
    rightTrim += bins[i].total;
    coreEnd = bins[i].netValue;
  }
  return { coreStart, coreEnd };
}

export default function ScoreDistribution({ scores, currentUserId }: ScoreDistributionProps) {
  const [highlightMine, setHighlightMine] = useState(false);
  const [showAllScores, setShowAllScores] = useState(false);

  const allData = useMemo(
    () => computeDistribution(scores, currentUserId),
    [scores, currentUserId]
  );

  const { coreStart, coreEnd } = useMemo(() => computeCoreRange(allData), [allData]);
  const hasTrimmedEdges = allData.length > 0 && (allData[0].netValue < coreStart || allData[allData.length - 1].netValue > coreEnd);

  const data = showAllScores ? allData : allData.filter((b) => b.netValue >= coreStart && b.netValue <= coreEnd);

  if (allData.length === 0) return null;

  const xInterval = data.length > 30 ? 4 : data.length > 20 ? 3 : data.length > 12 ? 2 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Score Distribution</h3>
        {currentUserId && (
          <button
            onClick={() => setHighlightMine((v) => !v)}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors ${
              highlightMine
                ? 'bg-minerva-600 text-white'
                : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
            }`}
          >
            My Scores
          </button>
        )}
      </div>
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden" style={{ WebkitTapHighlightColor: 'transparent' }}>
        <div className="p-3">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                axisLine={{ stroke: 'var(--border-light)' }}
                tickLine={false}
                interval={xInterval}
                height={25}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={30}
              />
              <Tooltip content={<CustomTooltip showMine={highlightMine} />} cursor={{ fill: 'var(--bg-subtle)', opacity: 0.5 }} />
              <Bar dataKey="total" radius={[3, 3, 0, 0]} barSize={data.length > 15 ? undefined : 20}>
                {data.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={
                      highlightMine && entry.mine > 0
                        ? 'var(--color-minerva-600, #7c3aed)'
                        : entry.netValue <= 0
                          ? '#22c55e'
                          : '#9ca3af'
                    }
                    opacity={highlightMine && entry.mine === 0 ? 0.3 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-[var(--text-faint)] text-center mt-1">
            Net strokes over par
          </p>
        </div>
        {hasTrimmedEdges && (
          <button
            onClick={() => setShowAllScores(!showAllScores)}
            className="w-full py-2.5 text-center text-xs font-medium text-minerva-600 hover:text-minerva-700 border-t border-[var(--border-light)] transition-colors"
          >
            {showAllScores ? 'Show core range' : `Show all scores (${allData[0].label} to ${allData[allData.length - 1].label})`}
          </button>
        )}
      </div>
    </div>
  );
}
