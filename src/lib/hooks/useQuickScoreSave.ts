import { useRef, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { calculateNetScore, getMaxHoles, calculatePartialPar } from '@/lib/scoring';
import { notifySlack } from '@/lib/slack-notify';
import { logAuditEvent } from '@/lib/audit';
import type { Score, SlackScorePayload } from '@/types/database';

const DB_DEBOUNCE_MS = 800;
const SLACK_DEBOUNCE_MS = 20_000;

export interface QuickScoreState {
  grossToPar: number;
  holesPlayed: number;
}

export interface QuickScoreSaveOptions {
  score: Score;
  onSaved?: () => void;
  allowance?: number;
}

/**
 * Hook providing debounced DB saves (800ms) and Slack notifications (15s)
 * for the Quick Score tap-to-increment flow.
 *
 * DB writes happen quickly so the leaderboard stays near-real-time.
 * Slack notifications are delayed so rapid taps don't spam the channel.
 * Both flush immediately on unmount to avoid data loss.
 */
export function useQuickScoreSave({ score, onSaved, allowance = 95 }: QuickScoreSaveOptions) {
  const dbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStateRef = useRef<QuickScoreState | null>(null);
  const previousGrossRef = useRef<number | null>(score.gross_score);
  const hasFlushedRef = useRef(false);

  const doDbSave = useCallback(async (state: QuickScoreState) => {
    const course = score.course;
    if (!course) return;

    const maxHoles = getMaxHoles(course.type);
    const notStarted = state.holesPlayed === 0;

    let grossScore: number | null = null;
    let holesPlayedVal: number | null = null;
    let isComplete = false;
    let courseHandicap: number | null = null;
    let netScoreVal: number | null = null;
    let netStrokesOverPar: number | null = null;

    if (!notStarted) {
      const partialPar = state.holesPlayed < maxHoles
        ? calculatePartialPar(course.par, state.holesPlayed, maxHoles)
        : course.par;
      grossScore = partialPar + state.grossToPar;
      holesPlayedVal = state.holesPlayed;
      isComplete = state.holesPlayed >= maxHoles;

      const handicapIndex = (score.user as unknown as { handicap_index: number | null })?.handicap_index;
      if (handicapIndex != null) {
        const result = calculateNetScore(
          grossScore,
          handicapIndex,
          course.slope,
          course.rating,
          course.par,
          state.holesPlayed,
          maxHoles,
          allowance
        );
        courseHandicap = result.courseHandicap;
        netScoreVal = result.netScore;
        netStrokesOverPar = result.netStrokesOverPar;
      }
    }

    const supabase = createClient();
    const { error } = await supabase
      .from('scores')
      .update({
        gross_score: grossScore,
        holes_played: holesPlayedVal,
        is_complete: isComplete,
        course_handicap: courseHandicap,
        net_score: netScoreVal,
        net_strokes_over_par: netStrokesOverPar,
      })
      .eq('id', score.id);

    if (!error) {
      const playerUser = score.user as unknown as { full_name: string | null; email: string | null };
      await logAuditEvent('score_edit', 'score', score.id, {
        player: playerUser?.full_name || playerUser?.email,
        quick_score: true,
        before: {
          course: course.course_name,
          tee: course.tee_name,
          gross_score: previousGrossRef.current,
          holes_played: score.holes_played,
        },
        after: {
          course: course.course_name,
          tee: course.tee_name,
          gross_score: grossScore,
          holes_played: holesPlayedVal,
          net_strokes_over_par: netStrokesOverPar,
          course_handicap: courseHandicap,
          net_score: netScoreVal,
          is_complete: isComplete,
        },
      });
      onSaved?.();
    }
  }, [score, onSaved]);

  const doSlackNotify = useCallback((state: QuickScoreState) => {
    const course = score.course;
    if (!course) return;
    if (state.holesPlayed === 0) return;

    const maxHoles = getMaxHoles(course.type);
    const partialPar = state.holesPlayed < maxHoles
      ? calculatePartialPar(course.par, state.holesPlayed, maxHoles)
      : course.par;
    const grossScore = partialPar + state.grossToPar;
    const isFullRound = state.holesPlayed >= maxHoles;

    let netStrokesOverPar: number | null = null;
    const handicapIndex = (score.user as unknown as { handicap_index: number | null })?.handicap_index;
    if (handicapIndex != null) {
      const result = calculateNetScore(
        grossScore,
        handicapIndex,
        course.slope,
        course.rating,
        course.par,
        state.holesPlayed,
        maxHoles,
        allowance
      );
      netStrokesOverPar = result.netStrokesOverPar;
    }

    const hadScoreBefore = previousGrossRef.current != null;
    let eventType: 'score_in_progress' | 'round_complete' | 'score_edit';
    if (!isFullRound) {
      eventType = 'score_in_progress';
    } else if (!hadScoreBefore) {
      eventType = 'round_complete';
    } else {
      eventType = 'score_edit';
    }

    const playerUser = score.user as unknown as { full_name: string | null; email: string | null; handicap_index: number | null };

    const payload: SlackScorePayload = {
      event_type: eventType,
      player_name: playerUser?.full_name || playerUser?.email || 'Unknown',
      handicap_index: playerUser?.handicap_index,
      course_name: course.course_name,
      tee_name: course.tee_name,
      course_type: course.type,
      par: course.par,
      rating: course.rating,
      gross_score: grossScore,
      net_strokes_over_par: netStrokesOverPar,
      holes_played: state.holesPlayed,
      max_holes: maxHoles,
      tee_time: score.tee_time || null,
      event_name: score.event?.name || (score.event ? `Event ${score.event.event_number}` : null),
      old_gross_score: previousGrossRef.current,
    };

    notifySlack(payload);
    previousGrossRef.current = grossScore;
  }, [score]);

  const scheduleUpdate = useCallback((state: QuickScoreState) => {
    latestStateRef.current = state;
    hasFlushedRef.current = false;

    if (dbTimerRef.current) clearTimeout(dbTimerRef.current);
    dbTimerRef.current = setTimeout(() => {
      doDbSave(state);
      dbTimerRef.current = null;
    }, DB_DEBOUNCE_MS);

    if (slackTimerRef.current) clearTimeout(slackTimerRef.current);
    slackTimerRef.current = setTimeout(() => {
      doSlackNotify(state);
      slackTimerRef.current = null;
    }, SLACK_DEBOUNCE_MS);
  }, [doDbSave, doSlackNotify]);

  const flush = useCallback(() => {
    if (hasFlushedRef.current) return;
    hasFlushedRef.current = true;
    const state = latestStateRef.current;
    if (!state) return;

    if (dbTimerRef.current) {
      clearTimeout(dbTimerRef.current);
      dbTimerRef.current = null;
      doDbSave(state);
    }
    if (slackTimerRef.current) {
      clearTimeout(slackTimerRef.current);
      slackTimerRef.current = null;
      doSlackNotify(state);
    }
  }, [doDbSave, doSlackNotify]);

  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  return { scheduleUpdate, flush };
}
