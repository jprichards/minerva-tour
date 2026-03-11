'use client';

import { useMemo, useState } from 'react';
import type { Score } from '@/types/database';

interface CourseExplorerProps {
  scores: Score[];
  members: { id: string; name: string }[];
}

interface CourseExplorerEntry {
  name: string;
  uniqueCourses: number;
}

export function computeCourseExplorer(
  scores: Score[],
  members: { id: string; name: string }[]
): CourseExplorerEntry[] {
  const userCourses: Record<string, Set<string>> = {};

  for (const s of scores) {
    const courseName = s.course?.course_name;
    if (!courseName) continue;
    if (!userCourses[s.user_id]) userCourses[s.user_id] = new Set();
    userCourses[s.user_id].add(courseName);
  }

  return members
    .filter((m) => userCourses[m.id])
    .map((m) => ({
      name: m.name,
      uniqueCourses: userCourses[m.id].size,
    }))
    .sort((a, b) => b.uniqueCourses - a.uniqueCourses);
}

function interpolateBarColor(rank: number, total: number): string {
  if (total <= 1) return 'rgba(16, 185, 129, 0.28)';
  const t = rank / (total - 1);
  const maxOpacity = 0.28;
  const minOpacity = 0.08;
  const opacity = maxOpacity + t * (minOpacity - maxOpacity);
  return `rgba(16, 185, 129, ${opacity.toFixed(3)})`;
}

const INITIAL_SHOW = 10;

export default function CourseExplorer({ scores, members }: CourseExplorerProps) {
  const [showAll, setShowAll] = useState(false);
  const data = useMemo(() => computeCourseExplorer(scores, members), [scores, members]);

  const totalUniqueCourses = useMemo(() => {
    const all = new Set<string>();
    for (const s of scores) {
      const name = s.course?.course_name;
      if (name) all.add(name);
    }
    return all.size;
  }, [scores]);

  if (data.length === 0) return null;

  const maxCount = data[0].uniqueCourses;
  const visible = showAll ? data : data.slice(0, INITIAL_SHOW);
  const hasMore = data.length > INITIAL_SHOW;

  return (
    <div>
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">Course Explorer</h3>
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden">
        <p className="text-xs text-[var(--text-muted)] px-3 pt-3 pb-2">
          {totalUniqueCourses} unique course{totalUniqueCourses !== 1 ? 's' : ''} played across the tour
        </p>
        <div className="px-3 pb-3 space-y-1.5">
          {visible.map((entry, idx) => {
            const firstName = entry.name.split(' ')[0];
            const barWidth = maxCount > 0 ? (entry.uniqueCourses / maxCount) * 100 : 0;
            return (
              <div key={entry.name} className="relative flex items-center gap-2 h-8 rounded-md overflow-hidden">
                <div
                  className="absolute inset-0 rounded-md"
                  style={{ width: `${barWidth}%`, backgroundColor: interpolateBarColor(idx, visible.length) }}
                />
                <span className="relative z-10 w-5 text-[11px] font-medium text-[var(--text-faint)] text-right shrink-0">
                  {idx + 1}
                </span>
                <span className="relative z-10 text-xs font-medium text-[var(--text-primary)] min-w-0 truncate">
                  {firstName}
                </span>
                <span className="relative z-10 ml-auto text-xs font-semibold text-[var(--text-primary)] shrink-0 pr-1">
                  {entry.uniqueCourses}
                </span>
              </div>
            );
          })}
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
