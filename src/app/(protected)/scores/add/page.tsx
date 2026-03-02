'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { calculateNetScore, getMaxHoles, formatNetScore } from '@/lib/scoring';
import { notifySlack } from '@/lib/slack-notify';
import { useSeason } from '@/lib/hooks/useSeason';
import { ArrowLeft, Search, ChevronRight, User as UserIcon, AlertCircle } from 'lucide-react';
import type { Course, User } from '@/types/database';

type Step = 'course' | 'player' | 'details';

export default function AddScorePage() {
  return (
    <Suspense fallback={<div className="p-4"><div className="h-6 bg-[var(--bg-skeleton)] rounded animate-pulse w-32" /></div>}>
      <AddScoreContent />
    </Suspense>
  );
}

function AddScoreContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCourseId = searchParams.get('course_id');
  const teeTimeOnly = searchParams.get('tee_time_only') === 'true';

  const { profile, isPlayingGuest } = useUser();
  const { canSubmitScores, isOffSeason, isRegularSeason, currentEvent } = useSeason();
  const { showToast } = useToast();
  const supabase = createClient();

  const [step, setStep] = useState<Step>(preselectedCourseId ? 'player' : 'course');
  const [courses, setCourses] = useState<Course[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [courseSearch, setCourseSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');

  // Selected values
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<User | null>(null);
  const [playingForSelf, setPlayingForSelf] = useState(true);

  // Score details
  const [teeTime, setTeeTime] = useState('');
  const [grossScore, setGrossScore] = useState('');
  const [grossToPar, setGrossToPar] = useState('');
  const [scoreEntryMode, setScoreEntryMode] = useState<'gross' | 'toPar'>('gross');
  const [holesPlayed, setHolesPlayed] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      // Fetch courses
      const { data: coursesData } = await supabase
        .from('courses')
        .select('*')
        .order('course_name');
      setCourses(coursesData || []);

      // If preselected course
      if (preselectedCourseId && coursesData) {
        const course = coursesData.find((c) => c.id === preselectedCourseId);
        if (course) setSelectedCourse(course);
      }

      // Fetch members
      const { data: membersData } = await supabase
        .from('users')
        .select('*')
        .in('role', ['admin', 'member', 'playing_guest'])
        .order('full_name');
      setMembers(membersData || []);
    };

    fetchData();
  }, [preselectedCourseId, supabase]);

  // Block off-season submissions
  if (isOffSeason) {
    return (
      <div className="p-4 text-center py-16">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Off Season</h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">Score submissions are not available during the off-season.</p>
        <button onClick={() => router.back()} className="mt-4 text-minerva-600 text-sm font-medium">Go back</button>
      </div>
    );
  }

  // Block playing guests from regular season
  if (isPlayingGuest && isRegularSeason) {
    return (
      <div className="p-4 text-center py-16">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Tournament Only</h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">Playing guests can only submit scores during tournaments.</p>
        <button onClick={() => router.back()} className="mt-4 text-minerva-600 text-sm font-medium">Go back</button>
      </div>
    );
  }

  const filteredCourses = courses.filter((c) =>
    c.course_name.toLowerCase().includes(courseSearch.toLowerCase()) ||
    c.tee_name.toLowerCase().includes(courseSearch.toLowerCase())
  );

  const filteredMembers = members.filter((m) =>
    m.full_name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.email?.toLowerCase().includes(memberSearch.toLowerCase())
  );

  // Check if course meets major/playoff rating requirement (>= 68)
  const isMajorOrPlayoff = currentEvent?.is_major || currentEvent?.is_playoff;
  const courseFailsRatingCheck = isMajorOrPlayoff && selectedCourse && selectedCourse.rating < 68;

  const handleSelectCourse = (course: Course) => {
    setSelectedCourse(course);
    setStep('player');
  };

  const handleSelectSelf = () => {
    setSelectedPlayer(profile);
    setPlayingForSelf(true);
    setStep('details');
  };

  const handleSelectOther = (member: User) => {
    setSelectedPlayer(member);
    setPlayingForSelf(false);
    setStep('details');
  };

  // Whether the user has entered a score value (used by submit logic + render)
  const hasScoreEntry = scoreEntryMode === 'toPar' ? grossToPar !== '' : grossScore !== '';
  const missingHolesPlayed = hasScoreEntry && !holesPlayed;
  const missingScore = !hasScoreEntry && !!holesPlayed;
  const incompleteScoreEntry = missingHolesPlayed || missingScore;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !selectedPlayer) return;
    if (incompleteScoreEntry) {
      setError(missingHolesPlayed
        ? 'Holes played is required when submitting a score.'
        : 'A score is required when holes played is entered.');
      return;
    }
    setLoading(true);
    setError('');

    let grossScoreNum: number | null = null;
    if (scoreEntryMode === 'toPar' && grossToPar !== '' && selectedCourse) {
      // Convert gross-to-par to gross score
      const par = selectedCourse.par;
      const maxH = getMaxHoles(selectedCourse.type);
      const hp = holesPlayed ? parseInt(holesPlayed) : maxH;
      const partialPar = hp < maxH ? Math.round(par * (hp / maxH)) : par;
      grossScoreNum = partialPar + parseInt(grossToPar);
    } else {
      grossScoreNum = grossScore ? parseInt(grossScore) : null;
    }
    const holesPlayedNum = holesPlayed ? parseInt(holesPlayed) : null;
    const maxHoles = getMaxHoles(selectedCourse.type);

    // Calculate net score if we have gross score and holes and handicap
    let courseHandicap = null;
    let netScore = null;
    let netStrokesOverPar = null;
    const isComplete = grossScoreNum != null && holesPlayedNum != null && hasScoreEntry;

    if (isComplete && grossScoreNum && holesPlayedNum && selectedPlayer.handicap_index != null) {
      const result = calculateNetScore(
        grossScoreNum,
        selectedPlayer.handicap_index,
        selectedCourse.slope,
        selectedCourse.rating,
        selectedCourse.par,
        holesPlayedNum,
        maxHoles
      );
      courseHandicap = result.courseHandicap;
      netScore = result.netScore;
      netStrokesOverPar = result.netStrokesOverPar;
    }

    const { data: { user } } = await supabase.auth.getUser();

    const scoreData = {
      user_id: selectedPlayer.id,
      course_id: selectedCourse.id,
      event_id: currentEvent?.id || null,
      tee_time: teeTime ? new Date(teeTime).toISOString() : null,
      gross_score: grossScoreNum,
      holes_played: holesPlayedNum,
      is_complete: isComplete,
      course_handicap: courseHandicap,
      net_score: netScore,
      net_strokes_over_par: netStrokesOverPar,
      submitted_by: user?.id,
    };

    const { data, error: insertError } = await supabase
      .from('scores')
      .insert(scoreData)
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    await logAuditEvent('score_submission', 'score', data.id, {
      player: selectedPlayer.full_name || selectedPlayer.email,
      course: selectedCourse.course_name,
      tee: selectedCourse.tee_name,
      gross_score: grossScoreNum,
      net_strokes_over_par: netStrokesOverPar,
      holes_played: holesPlayedNum,
      submitted_for_self: playingForSelf,
    });

    // Fire Slack notification (fire-and-forget)
    const slackEventType = !isComplete
      ? 'tee_time' as const
      : (holesPlayedNum != null && holesPlayedNum < maxHoles)
      ? 'score_in_progress' as const
      : 'round_complete' as const;

    notifySlack({
      event_type: slackEventType,
      player_name: selectedPlayer.full_name || selectedPlayer.email || 'Unknown',
      handicap_index: selectedPlayer.handicap_index,
      course_name: selectedCourse.course_name,
      tee_name: selectedCourse.tee_name,
      course_type: selectedCourse.type,
      par: selectedCourse.par,
      gross_score: grossScoreNum,
      net_score: netScore,
      net_strokes_over_par: netStrokesOverPar,
      holes_played: holesPlayedNum,
      max_holes: maxHoles,
      tee_time: teeTime ? new Date(teeTime).toISOString() : null,
      event_name: currentEvent?.name || (currentEvent ? `Event ${currentEvent.event_number}` : null),
      is_complete: isComplete,
    });

    showToast(isComplete ? 'Score submitted!' : 'Tee time saved!');
    router.push('/scores');
  };

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => {
            if (step === 'details') setStep('player');
            else if (step === 'player') setStep('course');
            else router.back();
          }}
          className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]"
        >
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            {teeTimeOnly ? 'Add Tee Time' : 'Submit Score'}
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            Step {step === 'course' ? '1' : step === 'player' ? '2' : '3'} of 3:
            {step === 'course' ? ' Select course' : step === 'player' ? ' Select player' : ' Enter details'}
          </p>
        </div>
      </div>

      {/* Step 1: Select Course */}
      {step === 'course' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
            <input
              type="text"
              placeholder="Search courses..."
              value={courseSearch}
              onChange={(e) => setCourseSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            />
          </div>

          {isMajorOrPlayoff && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-700">
              <span className="font-semibold">Major/Playoff Event:</span> Course rating must be 68 or higher.
            </div>
          )}

          <div className="space-y-2">
            {filteredCourses.map((course) => {
              const ineligible = isMajorOrPlayoff && course.rating < 68;
              return (
                <button
                  key={course.id}
                  onClick={() => handleSelectCourse(course)}
                  className={`w-full flex items-center justify-between bg-[var(--bg-card)] rounded-xl p-3 border transition-colors text-left ${
                    ineligible
                      ? 'border-amber-200 opacity-60'
                      : 'border-[var(--border-light)] hover:border-minerva-200'
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {course.course_name}
                      {ineligible && <span className="text-amber-600 text-xs ml-1">(ineligible)</span>}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {course.tee_name} &middot; {course.type.replace(/_/g, ' ')} &middot;
                      Par {course.par} &middot; {course.rating}/{course.slope}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </button>
              );
            })}
          </div>

          <p className="text-xs text-[var(--text-faint)] text-center mt-4">
            Don&apos;t see your course?{' '}
            <a href="/courses/add" className="text-minerva-600 font-medium">Add it</a>
          </p>
        </div>
      )}

      {/* Step 2: Select Player */}
      {step === 'player' && (
        <div className="space-y-3">
          {selectedCourse && (
            <div className="bg-minerva-50 rounded-xl p-3 mb-4">
              <p className="text-sm font-medium text-minerva-800">{selectedCourse.course_name}</p>
              <p className="text-xs text-minerva-600">{selectedCourse.tee_name} &middot; Par {selectedCourse.par}</p>
            </div>
          )}

          {/* Me Button */}
          <button
            onClick={handleSelectSelf}
            className="w-full flex items-center gap-3 bg-minerva-600 text-white rounded-xl p-4 hover:bg-minerva-700 transition-colors"
          >
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <UserIcon className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold">Me</p>
              <p className="text-xs text-minerva-200">{profile?.full_name || profile?.email}</p>
            </div>
          </button>

          <div className="text-center text-xs text-[var(--text-faint)] uppercase tracking-wide py-1">
            or submit for another member
          </div>

          {/* Search Members */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
            <input
              type="text"
              placeholder="Search members..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            />
          </div>

          <div className="space-y-2">
            {filteredMembers
              .filter((m) => m.id !== profile?.id)
              .map((member) => (
                <button
                  key={member.id}
                  onClick={() => handleSelectOther(member)}
                  className="w-full flex items-center justify-between bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-light)] hover:border-minerva-200 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[var(--bg-subtle)] rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-[var(--text-muted)]">
                        {(member.full_name || member.email || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{member.full_name || 'Unnamed'}</p>
                      <p className="text-xs text-[var(--text-muted)]">{member.email}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Step 3: Enter Details */}
      {step === 'details' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Major/Playoff course rating warning */}
          {courseFailsRatingCheck && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Course Rating Too Low</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Major and Playoff events require a course/tee rated 68 or higher.
                  This tee is rated {selectedCourse?.rating}. Please select a different course or tee.
                </p>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="bg-[var(--bg-page)] rounded-xl p-3 space-y-1">
            <p className="text-sm font-medium text-gray-800">
              {selectedCourse?.course_name} &middot; {selectedCourse?.tee_name}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Player: {selectedPlayer?.full_name || selectedPlayer?.email}
              {!playingForSelf && ' (submitted by you)'}
            </p>
            {selectedPlayer?.handicap_index != null && (
              <p className="text-xs text-[var(--text-muted)]">Handicap: {selectedPlayer.handicap_index}</p>
            )}
          </div>

          {/* Tee Time */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Tee Time (optional)
            </label>
            <input
              type="datetime-local"
              value={teeTime}
              onChange={(e) => setTeeTime(e.target.value)}
              className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            />
          </div>

          {!teeTimeOnly && (
            <>
              {/* Score Entry Mode Toggle */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Score {missingScore && <span className="text-red-500">*</span>}
                </label>
                <div className="flex bg-[var(--bg-subtle)] rounded-lg p-0.5 mb-2">
                  <button
                    type="button"
                    onClick={() => { setScoreEntryMode('gross'); setGrossToPar(''); }}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      scoreEntryMode === 'gross' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    Gross Score
                  </button>
                  <button
                    type="button"
                    onClick={() => { setScoreEntryMode('toPar'); setGrossScore(''); }}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      scoreEntryMode === 'toPar' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    Gross to Par
                  </button>
                </div>

                {scoreEntryMode === 'gross' ? (
                  <input
                    type="number"
                    value={grossScore}
                    onChange={(e) => setGrossScore(e.target.value)}
                    placeholder={`e.g. ${(selectedCourse?.par || 72) + 10}`}
                    className={`w-full rounded-xl border bg-[var(--input-bg)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500 ${
                      missingScore ? 'border-red-400 focus:ring-red-400' : 'border-[var(--input-border)]'
                    }`}
                  />
                ) : (
                  <div>
                    <input
                      type="number"
                      value={grossToPar}
                      onChange={(e) => setGrossToPar(e.target.value)}
                      placeholder="e.g. +5 or -2 (enter number only)"
                      className={`w-full rounded-xl border bg-[var(--input-bg)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500 ${
                        missingScore ? 'border-red-400 focus:ring-red-400' : 'border-[var(--input-border)]'
                      }`}
                    />
                    {grossToPar !== '' && selectedCourse && (
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        = Gross {(() => {
                          const par = selectedCourse.par;
                          const maxH = getMaxHoles(selectedCourse.type);
                          const hp = holesPlayed ? parseInt(holesPlayed) : maxH;
                          const partialPar = hp < maxH ? Math.round(par * (hp / maxH)) : par;
                          return partialPar + parseInt(grossToPar || '0');
                        })()}
                      </p>
                    )}
                  </div>
                )}
                {missingScore && (
                  <p className="text-xs text-red-500 mt-1">Required when holes played is entered.</p>
                )}
              </div>

              {/* Holes Played */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Holes Played {hasScoreEntry && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="number"
                  min="1"
                  max={selectedCourse?.type === '18_holes' ? 18 : selectedCourse?.type === '9_holes' || selectedCourse?.type === 'front_9' || selectedCourse?.type === 'back_9' ? 9 : 36}
                  value={holesPlayed}
                  onChange={(e) => setHolesPlayed(e.target.value)}
                  placeholder={`1-${getMaxHoles(selectedCourse?.type || '18_holes')}`}
                  className={`w-full rounded-xl border bg-[var(--input-bg)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500 ${
                    missingHolesPlayed ? 'border-red-400 focus:ring-red-400' : 'border-[var(--input-border)]'
                  }`}
                />
                {missingHolesPlayed ? (
                  <p className="text-xs text-red-500 mt-1">
                    Required when submitting a score.
                  </p>
                ) : (
                  <p className="text-xs text-[var(--text-faint)] mt-1">
                    Partial rounds are supported. Enter as you play.
                  </p>
                )}
              </div>

              {/* Net Score Preview */}
              {((scoreEntryMode === 'gross' && grossScore) || (scoreEntryMode === 'toPar' && grossToPar !== '')) && holesPlayed && selectedPlayer?.handicap_index != null && selectedCourse && (
                <div className="bg-minerva-50 rounded-xl p-3">
                  {(() => {
                    let previewGross: number;
                    if (scoreEntryMode === 'toPar') {
                      const par = selectedCourse.par;
                      const maxH = getMaxHoles(selectedCourse.type);
                      const hp = parseInt(holesPlayed);
                      const partialPar = hp < maxH ? Math.round(par * (hp / maxH)) : par;
                      previewGross = partialPar + parseInt(grossToPar || '0');
                    } else {
                      previewGross = parseInt(grossScore);
                    }
                    const result = calculateNetScore(
                      previewGross,
                      selectedPlayer.handicap_index,
                      selectedCourse.slope,
                      selectedCourse.rating,
                      selectedCourse.par,
                      parseInt(holesPlayed),
                      getMaxHoles(selectedCourse.type)
                    );
                    return (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-minerva-600 font-medium">Net Score Preview</p>
                          <p className="text-xs text-minerva-500 mt-0.5">
                            Course Handicap: {result.courseHandicap}
                            {result.isPartial && ' (partial)'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-minerva-800">
                            {formatNetScore(result.netStrokesOverPar)}
                          </p>
                          <p className="text-xs text-minerva-500">Net: {result.netScore}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          )}

          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-xl">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || !!courseFailsRatingCheck || incompleteScoreEntry}
            className="w-full bg-minerva-600 text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-minerva-700 transition-colors disabled:opacity-50"
          >
            {loading
              ? 'Saving...'
              : courseFailsRatingCheck
              ? 'Course Rating Too Low for This Event'
              : teeTimeOnly || (!hasScoreEntry && !holesPlayed)
              ? 'Save Tee Time'
              : 'Submit Score'}
          </button>
        </form>
      )}
    </div>
  );
}
