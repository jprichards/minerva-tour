'use client';

import type { Season } from '@/types/database';

interface SeasonFilterProps {
  seasons: Season[];
  selectedYear: number | 'all';
  onChange: (year: number | 'all') => void;
}

export default function SeasonFilter({ seasons, selectedYear, onChange }: SeasonFilterProps) {
  return (
    <select
      value={selectedYear}
      onChange={(e) => {
        const val = e.target.value;
        onChange(val === 'all' ? 'all' : Number(val));
      }}
      className="w-full py-2.5 px-3 text-sm rounded-lg border border-[var(--border-default)] bg-[var(--bg-page)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-minerva-500"
    >
      {seasons.map((s) => (
        <option key={s.id} value={s.year}>
          {s.year} Season
        </option>
      ))}
      {seasons.length > 0 && <option value="all">All Time</option>}
    </select>
  );
}
