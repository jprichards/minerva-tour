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
      <h3 className="text-base font-semibold text-gray-900">Trophy Case</h3>

      {/* Awards list */}
      {sorted.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {sorted.map((trophy, idx) => (
            <div
              key={trophy.id}
              className={`flex items-center gap-3 px-4 py-3 ${
                idx < sorted.length - 1 ? 'border-b border-gray-50' : ''
              }`}
            >
              <span className="text-xl flex-shrink-0" role="img" aria-label={trophy.award_name}>
                {trophy.emoji}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {trophy.award_name}
                  {trophy.description && (
                    <span className="text-gray-500 font-normal"> ({trophy.description})</span>
                  )}
                </p>
                <p className="text-xs text-gray-500">{trophy.year}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Season Finishes */}
      {sortedFinishes.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Season Finishes</h4>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="grid grid-cols-2 gap-px bg-gray-100">
              {sortedFinishes.map((finish) => (
                <div key={finish.id} className="bg-white px-4 py-2.5 flex items-center justify-between">
                  <span className="text-sm text-gray-600">{finish.year}</span>
                  <span className={`text-sm font-semibold ${
                    finish.finish_position === '1st' ? 'text-yellow-600' :
                    finish.finish_position === '2nd' ? 'text-gray-500' :
                    finish.finish_position === '3rd' ? 'text-amber-700' :
                    'text-gray-700'
                  }`}>
                    {finish.finish_position}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
