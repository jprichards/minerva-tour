'use client';

import type { Trophy, SeasonFinish } from '@/types/database';
import { AWARD_DISPLAY_NAMES, type AwardType } from '@/lib/trophy-utils';

interface TrophyCaseProps {
  trophies: Trophy[];
  seasonFinishes?: SeasonFinish[];
  compact?: boolean;
}

export default function TrophyCase({ trophies, seasonFinishes = [], compact = false }: TrophyCaseProps) {
  if (trophies.length === 0 && seasonFinishes.length === 0) return null;

  // Sort trophies by year descending
  const sorted = [...trophies].sort((a, b) => b.year - a.year);
  const sortedFinishes = [...seasonFinishes].sort((a, b) => b.year - a.year);

  if (compact) {
    // Compact mode: just emoji badges in a row
    const uniqueEmojis: string[] = [];
    const seen = new Set<string>();
    for (const t of sorted) {
      if (!seen.has(t.emoji)) {
        seen.add(t.emoji);
        uniqueEmojis.push(t.emoji);
      }
    }
    return (
      <span className="flex items-center gap-0.5" aria-label="Trophy badges">
        {uniqueEmojis.map((emoji, i) => (
          <span key={i} className="text-sm" role="img" aria-label={`trophy ${i + 1}`}>
            {emoji}
          </span>
        ))}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      {/* Trophy Case Header */}
      <h3 className="text-base font-semibold text-[var(--text-primary)]">Trophy Case</h3>

      {/* Awards list */}
      {sorted.length > 0 && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden">
          {sorted.map((trophy, idx) => (
            <div
              key={trophy.id}
              className={`flex items-center gap-3 px-4 py-3 ${
                idx < sorted.length - 1 ? 'border-b border-[var(--border-light)]' : ''
              }`}
            >
              <span className="text-xl flex-shrink-0" role="img" aria-label={trophy.award_name}>
                {trophy.emoji}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {trophy.award_name}
                  {trophy.description && (
                    <span className="text-[var(--text-muted)] font-normal"> ({trophy.description})</span>
                  )}
                </p>
                <p className="text-xs text-[var(--text-muted)]">{trophy.year}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Season Finishes */}
      {sortedFinishes.length > 0 && (() => {
        // Group finishes by year, each year may have net, scratch, and/or playoff
        const byYear = new Map<number, { net?: string; scratch?: string; playoff?: string }>();
        for (const f of sortedFinishes) {
          if (!byYear.has(f.year)) byYear.set(f.year, {});
          const entry = byYear.get(f.year)!;
          if (f.standing_type === 'scratch') entry.scratch = f.finish_position;
          else if (f.standing_type === 'playoff') entry.playoff = f.finish_position;
          else entry.net = f.finish_position;
        }
        const years = [...byYear.entries()].sort(([a], [b]) => b - a);
        const hasScratch = years.some(([, v]) => !!v.scratch);
        const hasPlayoff = years.some(([, v]) => !!v.playoff);

        // Tailwind requires full class names at build time (no dynamic interpolation)
        const gridCols = (hasScratch && hasPlayoff) ? 'grid-cols-4'
          : (hasScratch || hasPlayoff) ? 'grid-cols-3'
          : 'grid-cols-2';

        const posColor = (pos: string | undefined) =>
          pos === '1st' ? 'text-yellow-600' :
          pos === '2nd' ? 'text-[var(--text-muted)]' :
          pos === '3rd' ? 'text-amber-700' :
          'text-[var(--text-secondary)]';

        return (
          <div>
            <h4 className="text-sm font-semibold text-[var(--text-secondary)] mb-2">Season Finishes</h4>
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden">
              {/* Header row */}
              <div className={`grid ${gridCols} px-4 py-2 bg-[var(--bg-subtle)] border-b border-[var(--border-light)]`}>
                <span className="text-xs font-medium text-[var(--text-faint)]">Year</span>
                <span className="text-xs font-medium text-[var(--text-faint)] text-right">Net</span>
                {hasScratch && <span className="text-xs font-medium text-[var(--text-faint)] text-right">Scratch</span>}
                {hasPlayoff && <span className="text-xs font-medium text-[var(--text-faint)] text-right">Playoff</span>}
              </div>
              {years.map(([year, finishes]) => (
                <div key={year} className={`grid ${gridCols} px-4 py-2.5 border-b border-[var(--border-light)] last:border-b-0`}>
                  <span className="text-sm text-[var(--text-muted)]">{year}</span>
                  <span className={`text-sm font-semibold text-right ${posColor(finishes.net)}`}>
                    {finishes.net || '—'}
                  </span>
                  {hasScratch && (
                    <span className={`text-sm font-semibold text-right ${posColor(finishes.scratch)}`}>
                      {finishes.scratch || '—'}
                    </span>
                  )}
                  {hasPlayoff && (
                    <span className={`text-sm font-semibold text-right ${posColor(finishes.playoff)}`}>
                      {finishes.playoff || '—'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
