'use client';

import { useState, useCallback, useMemo } from 'react';
import { Minus, Plus, ArrowLeft, ArrowRight } from 'lucide-react';
import { getMaxHoles, calculatePartialPar, calculateNetScore, formatNetScore, formatGrossScore } from '@/lib/scoring';
import { useQuickScoreSave } from '@/lib/hooks/useQuickScoreSave';
import type { Score } from '@/types/database';

interface QuickScoreProps {
  score: Score;
  onSaved: () => void;
  allowance?: number;
}

export default function QuickScore({ score, onSaved, allowance = 95 }: QuickScoreProps) {
  const course = score.course;
  if (!course) return null;

  const maxHoles = getMaxHoles(course.type);

  const initialGrossToPar = useMemo(() => {
    if (score.gross_score == null || score.holes_played == null) return 0;
    const hp = score.holes_played;
    const partialPar = hp < maxHoles
      ? calculatePartialPar(course.par, hp, maxHoles)
      : course.par;
    return score.gross_score - partialPar;
  }, [score.gross_score, score.holes_played, course.par, maxHoles]);

  const initialHoles = useMemo(() => {
    if (score.holes_played != null && score.holes_played > 0) return score.holes_played;
    return 0;
  }, [score.holes_played]);

  const [grossToPar, setGrossToPar] = useState(initialGrossToPar);
  const [holesPlayed, setHolesPlayed] = useState(initialHoles);

  const { scheduleUpdate } = useQuickScoreSave({ score, onSaved, allowance });

  const updateScore = useCallback((nextGrossToPar: number, nextHoles: number) => {
    setGrossToPar(nextGrossToPar);
    setHolesPlayed(nextHoles);
    scheduleUpdate({ grossToPar: nextGrossToPar, holesPlayed: nextHoles });
  }, [scheduleUpdate]);

  const handleScoreDecrement = () => updateScore(grossToPar - 1, holesPlayed);
  const handleScoreIncrement = () => updateScore(grossToPar + 1, holesPlayed);
  const handleHoleBack = () => {
    if (holesPlayed > 0) updateScore(grossToPar, holesPlayed - 1);
  };
  const handleHoleForward = () => {
    if (holesPlayed < maxHoles) updateScore(grossToPar, holesPlayed + 1);
  };

  const formatScoreToPar = (val: number) => {
    if (val === 0) return 'E';
    if (val > 0) return `+${val}`;
    return `${val}`;
  };

  const notStarted = holesPlayed === 0;
  const isFinished = holesPlayed >= maxHoles;
  const partialPar = notStarted
    ? course.par
    : holesPlayed < maxHoles
      ? calculatePartialPar(course.par, holesPlayed, maxHoles)
      : course.par;
  const grossScore = partialPar + grossToPar;

  const handicapIndex = (score.user as unknown as { handicap_index: number | null })?.handicap_index;
  let netDisplay: string | null = null;
  if (!notStarted && handicapIndex != null) {
    const result = calculateNetScore(
      grossScore,
      handicapIndex,
      course.slope,
      course.rating,
      course.par,
      holesPlayed,
      maxHoles,
      allowance
    );
    netDisplay = formatNetScore(result.netStrokesOverPar);
  }

  return (
    <div className="space-y-4">
      {/* Quick Score Panel */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-5 space-y-5">
        {/* Score to Par */}
        <div className="space-y-3">
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Gross Score to Par</p>
            <p className="text-xl font-bold text-[var(--text-primary)]">{formatScoreToPar(grossToPar)}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleScoreDecrement}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-default)] active:bg-[var(--bg-page)] transition-colors"
            >
              <Minus className="w-5 h-5 text-minerva-400" />
            </button>
            <button
              onClick={handleScoreIncrement}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-default)] active:bg-[var(--bg-page)] transition-colors"
            >
              <Plus className="w-5 h-5 text-minerva-400" />
            </button>
          </div>
          <p className="text-xs text-[var(--text-faint)] text-center">
            Tap &minus;/+ to increment or decrement &quot;Gross Score to Par&quot;
          </p>
        </div>

        <div className="border-t border-[var(--border-light)]" />

        {/* Hole Thru */}
        <div className="space-y-3">
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Hole</p>
            <p className="text-xl font-bold text-[var(--text-primary)]">
              {notStarted ? 'Not Started' : isFinished ? 'Thru F' : `Thru ${holesPlayed}`}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleHoleBack}
              disabled={holesPlayed <= 0}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-default)] active:bg-[var(--bg-page)] transition-colors disabled:opacity-30"
            >
              <ArrowLeft className="w-5 h-5 text-minerva-400" />
            </button>
            <button
              onClick={handleHoleForward}
              disabled={holesPlayed >= maxHoles}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-default)] active:bg-[var(--bg-page)] transition-colors disabled:opacity-30"
            >
              <ArrowRight className="w-5 h-5 text-minerva-400" />
            </button>
          </div>
          <p className="text-xs text-[var(--text-faint)] text-center">
            Tap left/right to increment or decrement Thru
          </p>
        </div>
      </div>

      {/* Summary Line */}
      <div className="px-1">
        <p className="text-sm text-[var(--text-muted)] text-center">
          {notStarted ? (
            `Score to Par: ${formatScoreToPar(grossToPar)} · Not Started`
          ) : (
            <>
              {formatGrossScore(grossScore, partialPar)}
              {netDisplay && <> &middot; Net {netDisplay}</>}
              {' '}&middot; Thru {isFinished ? 'F' : holesPlayed} of {maxHoles}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
