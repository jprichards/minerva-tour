'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Score } from '@/types/database';

interface HeadToHeadMatrixProps {
  scores: Score[];
  members: { id: string; name: string }[];
}

interface H2HRecord {
  wins: number;
  losses: number;
  ties: number;
}

type H2HMatrix = Record<string, Record<string, H2HRecord>>;

export function computeH2HMatrix(
  scores: Score[],
  members: { id: string; name: string }[]
): { matrix: H2HMatrix; activeMembers: string[] } {
  const eventScores = new Map<string, Score[]>();
  for (const s of scores) {
    if (s.event_id == null || s.net_strokes_over_par == null || !s.is_complete)
      continue;
    const group = eventScores.get(s.event_id);
    if (group) group.push(s);
    else eventScores.set(s.event_id, [s]);
  }

  const participantIds = new Set<string>();
  const matrix: H2HMatrix = {};

  const ensure = (a: string, b: string) => {
    if (!matrix[a]) matrix[a] = {};
    if (!matrix[a][b]) matrix[a][b] = { wins: 0, losses: 0, ties: 0 };
  };

  for (const [, group] of eventScores) {
    // Best score per user for this event
    const best = new Map<string, number>();
    for (const s of group) {
      const prev = best.get(s.user_id);
      if (prev === undefined || s.net_strokes_over_par! < prev) {
        best.set(s.user_id, s.net_strokes_over_par!);
      }
    }

    const userIds = Array.from(best.keys());
    for (const uid of userIds) participantIds.add(uid);

    for (let i = 0; i < userIds.length; i++) {
      for (let j = i + 1; j < userIds.length; j++) {
        const a = userIds[i];
        const b = userIds[j];
        const scoreA = best.get(a)!;
        const scoreB = best.get(b)!;

        ensure(a, b);
        ensure(b, a);

        if (scoreA < scoreB) {
          matrix[a][b].wins++;
          matrix[b][a].losses++;
        } else if (scoreA > scoreB) {
          matrix[a][b].losses++;
          matrix[b][a].wins++;
        } else {
          matrix[a][b].ties++;
          matrix[b][a].ties++;
        }
      }
    }
  }

  const memberMap = new Map(members.map((m) => [m.id, m.name]));

  const activeMembers = Array.from(participantIds)
    .filter((id) => memberMap.has(id))
    .sort((a, b) => (memberMap.get(a)! > memberMap.get(b)! ? 1 : -1));

  // Ensure every active pair has an entry (even if they never shared an event)
  for (const a of activeMembers) {
    for (const b of activeMembers) {
      if (a !== b) ensure(a, b);
    }
  }

  if (activeMembers.length < 2) {
    return { matrix: {}, activeMembers: [] };
  }

  return { matrix, activeMembers };
}

interface H2HLeaderboardEntry {
  id: string;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
}

export function computeH2HLeaderboard(
  matrix: H2HMatrix,
  activeMembers: string[],
  memberMap: Map<string, string>
): H2HLeaderboardEntry[] {
  return activeMembers
    .map((id) => {
      let wins = 0;
      let losses = 0;
      let ties = 0;
      for (const oppId of activeMembers) {
        if (oppId === id) continue;
        const rec = matrix[id]?.[oppId];
        if (rec) {
          wins += rec.wins;
          losses += rec.losses;
          ties += rec.ties;
        }
      }
      const total = wins + losses + ties;
      const winPct = total > 0
        ? Math.round(((wins + ties * 0.5) / total) * 1000) / 10
        : 0;
      return { id, name: memberMap.get(id) ?? id, wins, losses, ties, winPct };
    })
    .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
}

const LEADERBOARD_INITIAL = 10;

function cellBg(rec: H2HRecord | undefined): string {
  if (!rec || (rec.wins === 0 && rec.losses === 0 && rec.ties === 0))
    return '';
  if (rec.wins > rec.losses) return 'bg-green-200 dark:bg-green-800/40';
  if (rec.losses > rec.wins) return 'bg-red-200 dark:bg-red-800/40';
  return 'bg-yellow-100 dark:bg-yellow-800/25';
}

function cellText(rec: H2HRecord | undefined): string {
  if (!rec || (rec.wins === 0 && rec.losses === 0 && rec.ties === 0))
    return '-';
  if (rec.ties > 0) return `${rec.wins}-${rec.losses}-${rec.ties}`;
  return `${rec.wins}-${rec.losses}`;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function getFirstName(name: string): string {
  return name.split(/\s+/)[0];
}

export function HeadToHeadMatrix({ scores, members }: HeadToHeadMatrixProps) {
  const [showAllLb, setShowAllLb] = useState(false);

  const { matrix, activeMembers } = useMemo(
    () => computeH2HMatrix(scores, members),
    [scores, members]
  );

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.id, m.name])),
    [members]
  );

  const leaderboard = useMemo(
    () => computeH2HLeaderboard(matrix, activeMembers, memberMap),
    [matrix, activeMembers, memberMap]
  );

  if (activeMembers.length < 2) return null;

  const useInitials = activeMembers.length > 8;
  const colLabel = (id: string) => {
    const name = memberMap.get(id) ?? id;
    return useInitials ? getInitials(name) : getFirstName(name);
  };

  const visibleLb = showAllLb ? leaderboard : leaderboard.slice(0, LEADERBOARD_INITIAL);
  const hasMoreLb = leaderboard.length > LEADERBOARD_INITIAL;

  return (
    <div>
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">
        Head to Head Leaderboard
      </h3>

      {/* Leaderboard */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden mb-4">
        <div className="px-3 py-2 flex items-center gap-2.5 text-[10px] font-medium text-[var(--text-faint)] uppercase tracking-wider border-b border-[var(--border-light)]">
          <span className="flex-1 min-w-0">Member</span>
          <span className="w-10 text-right">W</span>
          <span className="w-10 text-right">L</span>
          <span className="w-10 text-right">T</span>
          <span className="w-14 text-right">Win%</span>
        </div>
        <div className="divide-y divide-[var(--border-light)]">
          {visibleLb.map((entry, idx) => (
            <div key={entry.id} className="flex items-center px-3 py-2.5 gap-2.5">
              <span className="flex-1 min-w-0 text-xs font-medium text-[var(--text-primary)] truncate">
                {getFirstName(entry.name)}
              </span>
              <span className="w-10 text-right text-xs text-green-600 font-semibold">
                {entry.wins}
              </span>
              <span className="w-10 text-right text-xs text-red-500 font-semibold">
                {entry.losses}
              </span>
              <span className="w-10 text-right text-xs text-[var(--text-muted)]">
                {entry.ties}
              </span>
              <span className="w-14 text-right text-xs font-semibold text-[var(--text-primary)]">
                {entry.winPct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
        {hasMoreLb && (
          <button
            onClick={() => setShowAllLb(!showAllLb)}
            className="w-full py-2.5 text-center text-xs font-medium text-minerva-600 hover:text-minerva-700 border-t border-[var(--border-light)] transition-colors"
          >
            {showAllLb ? 'Show less' : `Show all ${leaderboard.length} members`}
          </button>
        )}
      </div>

      {/* Matrix */}
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">
        Head to Head Matrix
      </h3>
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="overflow-x-auto -mx-0 px-0 pb-3">
        <table className="border-collapse w-full" style={{ minWidth: 'max-content' }}>
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 bg-[var(--bg-card)] p-1"
                aria-label="Player"
              />
              {activeMembers.map((colId) => (
                <th
                  key={colId}
                  className="p-1 text-center font-medium text-[var(--text-secondary)]"
                  style={{ fontSize: '11px', minWidth: '44px' }}
                >
                  {colLabel(colId)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeMembers.map((rowId) => (
              <tr key={rowId}>
                <td
                  className="sticky left-0 z-10 bg-[var(--bg-card)] px-2 py-1 font-medium text-[var(--text-primary)] whitespace-nowrap"
                  style={{ fontSize: '11px' }}
                >
                  {getFirstName(memberMap.get(rowId) ?? rowId)}
                </td>
                {activeMembers.map((colId) => {
                  if (rowId === colId) {
                    return (
                      <td
                        key={colId}
                        className="text-center bg-[var(--bg-subtle)] text-[var(--text-tertiary)]"
                        style={{
                          fontSize: '10px',
                          minWidth: '44px',
                          minHeight: '44px',
                          padding: '8px 4px',
                        }}
                      >
                        -
                      </td>
                    );
                  }

                  const rec = matrix[rowId]?.[colId];
                  const bg = cellBg(rec);
                  const text = cellText(rec);
                  const hasMatchups =
                    rec &&
                    (rec.wins > 0 || rec.losses > 0 || rec.ties > 0);

                  return (
                    <td
                      key={colId}
                      className={`text-center ${bg}`}
                      style={{
                        fontSize: '10px',
                        minWidth: '44px',
                        minHeight: '44px',
                        padding: '0',
                      }}
                    >
                      {hasMatchups ? (
                        <Link
                          href={`/stats/${colId}?vs=${rowId}`}
                          className="flex items-center justify-center w-full h-full text-[var(--text-primary)] no-underline"
                          style={{
                            minHeight: '44px',
                            padding: '8px 4px',
                          }}
                        >
                          {text}
                        </Link>
                      ) : (
                        <span
                          className="flex items-center justify-center text-[var(--text-tertiary)]"
                          style={{ minHeight: '44px', padding: '8px 4px' }}
                        >
                          {text}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  );
}
