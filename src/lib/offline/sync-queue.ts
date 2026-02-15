/**
 * Offline Score Submission Queue
 * Saves scores to IndexedDB when offline, syncs to Supabase when connection returns.
 */
import { get, set, del, keys } from 'idb-keyval';
import { createClient } from '@/lib/supabase/client';

const QUEUE_PREFIX = 'mt-sync-queue:';

export interface PendingScore {
  id: string;
  user_id: string;
  course_id: string;
  event_id: string | null;
  gross_score: number;
  holes_played: number;
  is_complete: boolean;
  course_handicap: number | null;
  net_score: number | null;
  net_strokes_over_par: number | null;
  is_tournament_round: boolean;
  created_at: string;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
  errorMessage?: string;
}

/**
 * Add a score to the offline queue
 */
export async function queueScore(score: Omit<PendingScore, 'id' | 'created_at' | 'status' | 'retryCount'>): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const pendingScore: PendingScore = {
    ...score,
    id,
    created_at: new Date().toISOString(),
    status: 'pending',
    retryCount: 0,
  };

  await set(`${QUEUE_PREFIX}${id}`, pendingScore);
  return id;
}

/**
 * Get all pending scores in the queue
 */
export async function getPendingScores(): Promise<PendingScore[]> {
  const allKeys = await keys();
  const queueKeys = allKeys.filter(
    (k) => typeof k === 'string' && k.startsWith(QUEUE_PREFIX)
  );

  const scores: PendingScore[] = [];
  for (const key of queueKeys) {
    const score = await get<PendingScore>(key);
    if (score) scores.push(score);
  }

  return scores.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * Remove a score from the queue (after successful sync)
 */
export async function removeFromQueue(id: string): Promise<void> {
  await del(`${QUEUE_PREFIX}${id}`);
}

/**
 * Get the count of pending scores
 */
export async function getPendingCount(): Promise<number> {
  const scores = await getPendingScores();
  return scores.filter((s) => s.status !== 'syncing').length;
}

/**
 * Flush the queue: sync all pending scores to Supabase
 * Returns the number of successfully synced scores.
 */
export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  const supabase = createClient();
  const pending = await getPendingScores();
  let synced = 0;
  let failed = 0;

  for (const score of pending) {
    if (score.status === 'syncing') continue; // Already being processed

    // Mark as syncing
    score.status = 'syncing';
    await set(`${QUEUE_PREFIX}${score.id}`, score);

    try {
      const { error } = await supabase.from('scores').insert({
        user_id: score.user_id,
        course_id: score.course_id,
        event_id: score.event_id,
        gross_score: score.gross_score,
        holes_played: score.holes_played,
        is_complete: score.is_complete,
        course_handicap: score.course_handicap,
        net_score: score.net_score,
        net_strokes_over_par: score.net_strokes_over_par,
        is_tournament_round: score.is_tournament_round,
      });

      if (error) throw error;

      await removeFromQueue(score.id);
      synced++;
    } catch (error: any) {
      score.status = 'failed';
      score.retryCount++;
      score.errorMessage = error?.message || 'Unknown error';
      await set(`${QUEUE_PREFIX}${score.id}`, score);
      failed++;
    }
  }

  return { synced, failed };
}

/**
 * Check if there are any pending scores in the queue
 */
export async function hasPendingScores(): Promise<boolean> {
  const count = await getPendingCount();
  return count > 0;
}
