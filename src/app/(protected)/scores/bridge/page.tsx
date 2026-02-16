'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useSeason } from '@/lib/hooks/useSeason';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { ArrowLeft, Link2, CheckCircle, AlertCircle } from 'lucide-react';
import { formatNetScore, calculateNetScore } from '@/lib/scoring';
import type { Score, Event } from '@/types/database';

interface ScoreWithCourse extends Omit<Score, 'course'> {
  course: {
    course_name: string;
    tee_name: string;
    par: number;
    slope: number;
    rating: number;
    type: string;
  };
}

export default function BridgeScoresPage() {
  const router = useRouter();
  const { profile } = useUser();
  const { currentEvent: seasonEvent } = useSeason();
  const { showToast } = useToast();
  const supabase = createClient();

  // Block bridging for major and playoff events (PRD: "9 hole scores may not be combined in these events")
  const isMajorOrPlayoff = seasonEvent?.is_major || seasonEvent?.is_playoff;
  if (isMajorOrPlayoff) {
    return (
      <div className="p-4 text-center py-16">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Bridging Not Available</h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">Major and playoff events require full 18-hole rounds. 9-hole scores cannot be combined for these events.</p>
        <button onClick={() => router.back()} className="mt-4 text-minerva-600 text-sm font-medium">Go back</button>
      </div>
    );
  }

  const [nineHoleScores, setNineHoleScores] = useState<ScoreWithCourse[]>([]);
  const [selectedFirst, setSelectedFirst] = useState<ScoreWithCourse | null>(null);
  const [selectedSecond, setSelectedSecond] = useState<ScoreWithCourse | null>(null);
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!profile?.id) return;

      // Get current event
      const { data: seasons } = await supabase
        .from('seasons')
        .select('*')
        .order('year', { ascending: false })
        .limit(1);

      if (seasons && seasons.length > 0) {
        const season = seasons[0];
        if (season.current_event_id) {
          const { data: event } = await supabase
            .from('events')
            .select('*')
            .eq('id', season.current_event_id)
            .single();
          setCurrentEvent(event);
        }
      }

      // Fetch unbridged 9-hole scores for this user
      const { data: scores } = await supabase
        .from('scores')
        .select('*, course:courses(course_name, tee_name, par, slope, rating, type)')
        .eq('user_id', profile.id)
        .eq('is_complete', true)
        .eq('holes_played', 9)
        .is('combined_with_score_id', null)
        .order('created_at', { ascending: false });

      setNineHoleScores((scores as ScoreWithCourse[]) || []);
      setLoading(false);
    };
    fetchData();
  }, [profile, supabase]);

  const canBridge = selectedFirst && selectedSecond && selectedFirst.id !== selectedSecond.id;

  // Validate: one should be front 9, one should be back 9 (or any two 9-hole)
  const isValidPairing = canBridge && (() => {
    const types = [selectedFirst!.course.type, selectedSecond!.course.type];
    // Allow front_9+back_9 or any 9_holes combinations
    return types.includes('front_9') && types.includes('back_9')
      || types.filter(t => t === '9_holes').length === 2
      || (types.includes('front_9') || types.includes('back_9'));
  })();

  const handleBridge = async () => {
    if (!canBridge || !profile) return;
    setSubmitting(true);

    try {
      const first = selectedFirst!;
      const second = selectedSecond!;

      // Combined gross score
      const combinedGross = (first.gross_score || 0) + (second.gross_score || 0);
      const combinedPar = first.course.par + second.course.par;

      // Average the course ratings and slopes for net calculation
      const avgRating = (first.course.rating + second.course.rating) / 2;
      const avgSlope = (first.course.slope + second.course.slope) / 2;

      // Calculate net score using the full function
      const netResult = profile.handicap_index != null
        ? calculateNetScore(combinedGross, profile.handicap_index, avgSlope, avgRating, combinedPar, 18, 18)
        : { courseHandicap: 0, netScore: combinedGross, netStrokesOverPar: combinedGross - combinedPar };
      const handicap = netResult.courseHandicap;
      const netStrokesOverPar = netResult.netStrokesOverPar;

      // Insert the bridged score
      const { data: newScore, error } = await supabase.from('scores').insert({
        user_id: profile.id,
        course_id: first.course_id, // primary course
        event_id: currentEvent?.id || first.event_id,
        gross_score: combinedGross,
        holes_played: 18,
        course_handicap: handicap,
        net_score: combinedGross - handicap,
        net_strokes_over_par: netStrokesOverPar,
        is_complete: true,
        is_tournament_round: false,
      }).select().single();

      if (error) throw error;

      // Mark original scores as bridged
      await supabase.from('scores').update({ combined_with_score_id: newScore.id }).eq('id', first.id);
      await supabase.from('scores').update({ combined_with_score_id: newScore.id }).eq('id', second.id);

      logAuditEvent('bridge_scores', 'score', newScore.id, {
        first_score_id: first.id,
        second_score_id: second.id,
        combined_gross: combinedGross,
        net_strokes_over_par: netStrokesOverPar,
      });

      showToast('Scores bridged successfully!', 'success');
      router.push(`/scores/${newScore.id}`);
    } catch (error) {
      console.error('Error bridging scores:', error);
      showToast('Failed to bridge scores.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Bridge 9-Hole Scores</h1>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <p className="text-xs text-blue-700">
          Select two 9-hole rounds to combine into an 18-hole score. Ideally, pick one Front 9 and one Back 9 from the same course.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : nineHoleScores.length < 2 ? (
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)]">
            You need at least two unbridged 9-hole scores to bridge.
          </p>
        </div>
      ) : (
        <>
          {/* Selection */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-2">First 9</h3>
              <div className="space-y-2">
                {nineHoleScores
                  .filter((s) => s.id !== selectedSecond?.id)
                  .map((score) => (
                    <button
                      key={score.id}
                      onClick={() => setSelectedFirst(selectedFirst?.id === score.id ? null : score)}
                      className={`w-full flex items-center justify-between rounded-xl p-3 border transition-colors text-left ${
                        selectedFirst?.id === score.id
                          ? 'border-minerva-500 bg-minerva-50'
                          : 'border-[var(--border-light)] bg-[var(--bg-card)] hover:bg-[var(--input-bg)] border-[var(--input-border)]'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{score.course.course_name}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {score.course.tee_name} &middot; {score.course.type.replace(/_/g, ' ')} &middot; {new Date(score.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <span className="text-sm font-bold text-[var(--text-primary)]">{score.gross_score}</span>
                        {selectedFirst?.id === score.id && <CheckCircle className="w-4 h-4 text-minerva-600" />}
                      </div>
                    </button>
                  ))}
              </div>
            </div>

            <div className="flex justify-center">
              <Link2 className="w-5 h-5 text-[var(--text-faint)]" />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-2">Second 9</h3>
              <div className="space-y-2">
                {nineHoleScores
                  .filter((s) => s.id !== selectedFirst?.id)
                  .map((score) => (
                    <button
                      key={score.id}
                      onClick={() => setSelectedSecond(selectedSecond?.id === score.id ? null : score)}
                      className={`w-full flex items-center justify-between rounded-xl p-3 border transition-colors text-left ${
                        selectedSecond?.id === score.id
                          ? 'border-minerva-500 bg-minerva-50'
                          : 'border-[var(--border-light)] bg-[var(--bg-card)] hover:bg-[var(--input-bg)] border-[var(--input-border)]'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{score.course.course_name}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {score.course.tee_name} &middot; {score.course.type.replace(/_/g, ' ')} &middot; {new Date(score.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <span className="text-sm font-bold text-[var(--text-primary)]">{score.gross_score}</span>
                        {selectedSecond?.id === score.id && <CheckCircle className="w-4 h-4 text-minerva-600" />}
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          {canBridge && (
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-default)] shadow-[var(--shadow-sm)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-2">Combined Score Preview</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Gross</p>
                  <p className="text-xl font-bold text-[var(--text-primary)]">
                    {(selectedFirst!.gross_score || 0) + (selectedSecond!.gross_score || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Combined Par</p>
                  <p className="text-xl font-bold text-[var(--text-primary)]">
                    {selectedFirst!.course.par + selectedSecond!.course.par}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleBridge}
            disabled={!canBridge || submitting}
            className="w-full py-3 bg-minerva-600 text-white font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-minerva-700 transition-colors"
          >
            {submitting ? 'Bridging...' : 'Bridge Scores'}
          </button>
        </>
      )}
    </div>
  );
}
