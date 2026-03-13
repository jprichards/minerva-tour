'use client';

import { useMemo, useState } from 'react';
import type { Score } from '@/types/database';

interface CourseDifficultyProps {
  scores: Score[];
}

interface CourseDifficultyEntry {
  courseName: string;
  avgNet: number;
  avgGross: number;
  roundCount: number;
}

const MIN_ROUNDS = 3;

function courseKey(s: Score): string | null {
  const name = s.course?.course_name;
  if (!name) return null;
  const type = s.course?.type;
  if (type && type !== '18_holes') return `${name} (9H)`;
  return name;
}

export function computeCourseDifficulty(scores: Score[]): CourseDifficultyEntry[] {
  const grouped: Record<string, { nets: number[]; grosses: number[] }> = {};

  for (const s of scores) {
    const key = courseKey(s);
    const nop = s.net_strokes_over_par;
    if (!key || nop == null) continue;
    if (!grouped[key]) grouped[key] = { nets: [], grosses: [] };
    grouped[key].nets.push(nop);
    if (s.gross_score != null) grouped[key].grosses.push(s.gross_score);
  }

  return Object.entries(grouped)
    .filter(([, v]) => v.nets.length >= MIN_ROUNDS)
    .map(([courseName, v]) => ({
      courseName,
      avgNet: Math.round((v.nets.reduce((a, b) => a + b, 0) / v.nets.length) * 10) / 10,
      avgGross: v.grosses.length > 0
        ? Math.round((v.grosses.reduce((a, b) => a + b, 0) / v.grosses.length) * 10) / 10
        : 0,
      roundCount: v.nets.length,
    }))
    .sort((a, b) => b.avgNet - a.avgNet);
}

function formatAvgNet(n: number): string {
  if (n === 0) return 'E';
  if (n > 0) return `+${n.toFixed(1)}`;
  return n.toFixed(1);
}

function getNetColor(n: number): string {
  if (n < 0) return 'text-green-600';
  if (n > 0) return 'text-red-500';
  return 'text-[var(--text-muted)]';
}

const INITIAL_SHOW = 10;

export default function CourseDifficulty({ scores }: CourseDifficultyProps) {
  const [sortHardest, setSortHardest] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [expandedName, setExpandedName] = useState<string | null>(null);

  const computed = useMemo(() => computeCourseDifficulty(scores), [scores]);

  const data = useMemo(
    () => (sortHardest ? computed : [...computed].reverse()),
    [computed, sortHardest]
  );

  if (data.length === 0) return null;

  const visible = showAll ? data : data.slice(0, INITIAL_SHOW);
  const hasMore = data.length > INITIAL_SHOW;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Course Difficulty</h3>
        <div className="flex bg-[var(--bg-subtle)] rounded-lg p-0.5">
          <button
            onClick={() => setSortHardest(true)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              sortHardest
                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--text-muted)]'
            }`}
          >
            Hardest
          </button>
          <button
            onClick={() => setSortHardest(false)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              !sortHardest
                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--text-muted)]'
            }`}
          >
            Easiest
          </button>
        </div>
      </div>
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="px-3 py-2 flex items-center gap-2.5 text-[10px] font-medium text-[var(--text-faint)] uppercase tracking-wider border-b border-[var(--border-light)]">
          <span className="flex-1 min-w-0">Course</span>
          <span className="w-12 text-right">Net</span>
          <span className="w-12 text-right">Gross</span>
          <span className="w-10 text-right">Rnds</span>
        </div>
        <div className="divide-y divide-[var(--border-light)]">
          {visible.map((entry) => (
            <div key={entry.courseName} className="flex items-center px-3 py-2.5 gap-2.5">
              <span
                className={`flex-1 min-w-0 text-xs text-[var(--text-primary)] cursor-pointer ${expandedName === entry.courseName ? 'whitespace-normal' : 'truncate'}`}
                onClick={() => setExpandedName(expandedName === entry.courseName ? null : entry.courseName)}
              >
                {entry.courseName}
              </span>
              <span className={`w-12 text-right text-xs font-semibold ${getNetColor(entry.avgNet)}`}>
                {formatAvgNet(entry.avgNet)}
              </span>
              <span className="w-12 text-right text-xs text-[var(--text-primary)]">
                {entry.avgGross > 0 ? entry.avgGross.toFixed(1) : '-'}
              </span>
              <span className="w-10 text-right text-[11px] text-[var(--text-muted)]">
                {entry.roundCount}
              </span>
            </div>
          ))}
        </div>
        {hasMore && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full py-2.5 text-center text-xs font-medium text-minerva-600 hover:text-minerva-700 border-t border-[var(--border-light)] transition-colors"
          >
            {showAll ? 'Show less' : `Show all ${data.length} courses`}
          </button>
        )}
      </div>
    </div>
  );
}
