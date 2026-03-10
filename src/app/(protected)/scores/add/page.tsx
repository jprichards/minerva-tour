'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { calculateNetScore, getMaxHoles, courseMatchesEventHoles, formatNetScore } from '@/lib/scoring';
import { notifySlack } from '@/lib/slack-notify';
import { useSeason } from '@/lib/hooks/useSeason';
import { fetchAllCourses, formatCourseType } from '@/lib/courses';
import { ArrowLeft, Search, ChevronRight, User as UserIcon, AlertCircle, CheckCircle, X } from 'lucide-react';
import MemberPicker from '@/components/MemberPicker';
import type { Course, User } from '@/types/database';

type Step = 'course' | 'player' | 'details' | 'success';

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
  const { canSubmitScores, isOffSeason, isRegularSeason, currentEvent, loading: seasonLoading } = useSeason();
  const { showToast } = useToast();
  const { mutate } = useSWRConfig();
  const supabase = createClient();

  const [step, setStep] = useState<Step>('course');
  const [courses, setCourses] = useState<Course[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [courseSearch, setCourseSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [dataLoaded, setDataLoaded] = useState(false);

  // Selected values
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<User | null>(null);
  const [playingForSelf, setPlayingForSelf] = useState(true);

  // Score details
  const [roundDate, setRoundDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [teeTimeOfDay, setTeeTimeOfDay] = useState('');
  const [grossScore, setGrossScore] = useState('');
  const [grossToPar, setGrossToPar] = useState('');
  const [scoreEntryMode, setScoreEntryMode] = useState<'gross' | 'toPar'>('gross');
  const [holesPlayed, setHolesPlayed] = useState('');
  const [isPartialRound, setIsPartialRound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Post-submit copy state
  const [copiedMemberIds, setCopiedMemberIds] = useState<string[]>([]);
  const [copyDisabledIds, setCopyDisabledIds] = useState<string[]>([]);
  const [copyLoading, setCopyLoading] = useState(false);

  // Track whether the preselected course was already resolved to prevent re-running
  const [preselectionResolved, setPreselectionResolved] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const coursesData = await fetchAllCourses(supabase);
      setCourses(coursesData);

      const { data: membersData } = await supabase
        .from('users')
        .select('*')
        .in('role', ['admin', 'member', 'playing_guest'])
        .order('full_name');
      setMembers(membersData || []);
      setDataLoaded(true);
    };

    fetchData();
  // Only fetch on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve preselected course once both course data and season data are ready.
  // Wait for season to finish loading so we know the actual event hole count
  // before allowing the user to advance past step 1.
  useEffect(() => {
    if (!preselectedCourseId || preselectionResolved || courses.length === 0 || seasonLoading) return;

    const course = courses.find((c) => c.id === preselectedCourseId);
    if (!course) {
      setPreselectionResolved(true);
      return;
    }

    if (courseMatchesEventHoles(course.type, currentEvent?.holes)) {
      setSelectedCourse(course);
      if (step === 'course') setStep('player');
      setPreselectionResolved(true);
    } else {
      setStep('course');
      setPreselectionResolved(true);
    }
  }, [preselectedCourseId, courses, currentEvent?.holes, preselectionResolved, step, seasonLoading]);

  // If the active event changes and the selected course no longer matches, reset
  useEffect(() => {
    if (selectedCourse && currentEvent?.holes && !courseMatchesEventHoles(selectedCourse.type, currentEvent.holes)) {
      setSelectedCourse(null);
      setStep('course');
    }
  }, [currentEvent?.holes, selectedCourse]);

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
    courseMatchesEventHoles(c.type, currentEvent?.holes) &&
    (c.course_name.toLowerCase().includes(courseSearch.toLowerCase()) ||
    c.tee_name.toLowerCase().includes(courseSearch.toLowerCase()))
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
  const missingHolesPlayed = hasScoreEntry && isPartialRound && !holesPlayed;
  const missingScore = !hasScoreEntry && isPartialRound && !!holesPlayed;
  const incompleteScoreEntry = missingHolesPlayed || missingScore;
  const combinedTeeTime = roundDate ? `${roundDate}T${teeTimeOfDay || '00:00'}` : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !selectedPlayer) {
      setError(!selectedCourse ? 'Please select a course first.' : 'Please select a player first.');
      if (!selectedCourse) setStep('course');
      else if (!selectedPlayer) setStep('player');
      return;
    }
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
    const maxHoles = getMaxHoles(selectedCourse.type);
    const holesPlayedNum = hasScoreEntry
      ? (isPartialRound && holesPlayed ? parseInt(holesPlayed) : maxHoles)
      : null;

    // Calculate net score if we have gross score and holes and handicap
    let courseHandicap = null;
    let netScore = null;
    let netStrokesOverPar = null;
    const isComplete = grossScoreNum != null && holesPlayedNum != null && hasScoreEntry && holesPlayedNum >= maxHoles;

    if (grossScoreNum != null && holesPlayedNum != null && selectedPlayer.handicap_index != null) {
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
      tee_time: combinedTeeTime,
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
      tee_time: combinedTeeTime,
      event_name: currentEvent?.name || (currentEvent ? `Event ${currentEvent.event_number}` : null),
      is_complete: isComplete,
    });

    mutate('leaderboard');
    mutate((key: unknown) => Array.isArray(key) && key[0] === 'scores', undefined, { revalidate: true });

    showToast(isComplete ? 'Score submitted!' : 'Tee time saved!');
    setCopiedMemberIds([selectedPlayer.id]);

    // Find members who already have a tee time for this course+event
    if (currentEvent?.id) {
      const { data: existingScores } = await supabase
        .from('scores')
        .select('user_id')
        .eq('course_id', selectedCourse.id)
        .eq('event_id', currentEvent.id);
      const existingUserIds = (existingScores || []).map((s: { user_id: string }) => s.user_id);
      setCopyDisabledIds(existingUserIds.filter((uid: string) => uid !== selectedPlayer.id));
    }

    setStep('success');
  };

  const handleCopyToMembers = async (memberIds: string[]) => {
    if (!selectedCourse || memberIds.length === 0) return;
    setCopyLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    const rows = memberIds.map((uid) => ({
      user_id: uid,
      course_id: selectedCourse.id,
      event_id: currentEvent?.id || null,
      tee_time: combinedTeeTime,
      gross_score: null,
      holes_played: null,
      is_complete: false,
      course_handicap: null,
      net_score: null,
      net_strokes_over_par: null,
      submitted_by: user?.id,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('scores')
      .insert(rows)
      .select();

    if (insertError) {
      showToast('Failed to copy tee time.', 'error');
      setCopyLoading(false);
      return;
    }

    if (inserted) {
      for (const row of inserted) {
        const member = members.find((m) => m.id === row.user_id);
        await logAuditEvent('score_submission', 'score', row.id, {
          player: member?.full_name || member?.email,
          course: selectedCourse.course_name,
          tee: selectedCourse.tee_name,
          copied_from_tee_time: true,
        });

        notifySlack({
          event_type: 'tee_time',
          player_name: member?.full_name || member?.email || 'Unknown',
          handicap_index: member?.handicap_index,
          course_name: selectedCourse.course_name,
          tee_name: selectedCourse.tee_name,
          course_type: selectedCourse.type,
          par: selectedCourse.par,
          tee_time: combinedTeeTime,
          event_name: currentEvent?.name || (currentEvent ? `Event ${currentEvent.event_number}` : null),
          is_complete: false,
        });
      }
    }

    mutate((key: unknown) => Array.isArray(key) && key[0] === 'scores', undefined, { revalidate: true });
    setCopiedMemberIds((prev) => [...prev, ...memberIds]);
    showToast(`Tee time copied to ${memberIds.length} member${memberIds.length !== 1 ? 's' : ''}!`);
    setCopyLoading(false);
  };

  return (
    <div className="p-4">
      {/* Header */}
      {step !== 'success' && (
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
      )}

      {/* Loading state while resolving preselected course */}
      {preselectedCourseId && !preselectionResolved && (
        <div className="space-y-3">
          <div className="h-12 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
          <div className="h-20 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
        </div>
      )}

      {/* Step 1: Select Course */}
      {step === 'course' && (!preselectedCourseId || preselectionResolved) && (
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

          {currentEvent?.holes && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-xs text-blue-700">
              Showing {currentEvent.holes === 9 ? '9-hole' : '18-hole'} courses for the current {currentEvent.holes}-hole event.
            </div>
          )}

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
                      {course.tee_name} &middot; {formatCourseType(course.type)} &middot;
                      Par {course.par} &middot; {course.rating}/{course.slope}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </button>
              );
            })}
          </div>

          {filteredCourses.length === 0 && courseSearch && (
            <div className="text-center py-6">
              <p className="text-sm text-[var(--text-muted)]">No matching courses found.</p>
              {currentEvent?.holes && (
                <p className="text-xs text-[var(--text-faint)] mt-1">
                  Only {currentEvent.holes === 9 ? '9-hole' : '18-hole'} courses are shown for this event.
                  Your course may exist with a different hole configuration.
                </p>
              )}
            </div>
          )}

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

          {/* Round Date & Tee Time */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Date</label>
              <div className="relative rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3">
                <input
                  type="date"
                  value={roundDate}
                  onChange={(e) => setRoundDate(e.target.value || roundDate)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                />
                <span className="text-sm">
                  {roundDate
                    ? new Date(roundDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
                    : <span className="text-[var(--text-muted)]">Select date</span>}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Time <span className="font-normal text-[var(--text-faint)]">(opt.)</span>
              </label>
              <div className="relative rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3">
                <input
                  type="time"
                  value={teeTimeOfDay}
                  onChange={(e) => setTeeTimeOfDay(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                />
                <span className="text-sm">
                  {teeTimeOfDay
                    ? new Date(`2000-01-01T${teeTimeOfDay}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    : <span className="text-[var(--text-muted)]">&mdash;</span>}
                </span>
                {teeTimeOfDay && (
                  <button
                    type="button"
                    onClick={() => setTeeTimeOfDay('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-[var(--bg-subtle)] z-20"
                  >
                    <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  </button>
                )}
              </div>
            </div>
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
                      placeholder="e.g. 5 for over, -2 for under"
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

              {/* Partial Round Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--text-secondary)]">
                  Partial round?
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isPartialRound}
                  onClick={() => {
                    const next = !isPartialRound;
                    setIsPartialRound(next);
                    if (!next) setHolesPlayed('');
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isPartialRound ? 'bg-minerva-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                      isPartialRound ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {isPartialRound && (
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Holes Played {hasScoreEntry && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={getMaxHoles(selectedCourse?.type || '18_holes') - 1}
                    value={holesPlayed}
                    onChange={(e) => setHolesPlayed(e.target.value)}
                    placeholder={`1-${getMaxHoles(selectedCourse?.type || '18_holes') - 1}`}
                    className={`w-full rounded-xl border bg-[var(--input-bg)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500 ${
                      missingHolesPlayed ? 'border-red-400 focus:ring-red-400' : 'border-[var(--input-border)]'
                    }`}
                  />
                  {missingHolesPlayed && (
                    <p className="text-xs text-red-500 mt-1">
                      Required when submitting a score.
                    </p>
                  )}
                </div>
              )}

              {/* Net Score Preview */}
              {hasScoreEntry && (!isPartialRound || holesPlayed) && selectedPlayer?.handicap_index != null && selectedCourse && (
                <div className="bg-minerva-50 rounded-xl p-3">
                  {(() => {
                    const maxH = getMaxHoles(selectedCourse.type);
                    const effectiveHoles = isPartialRound && holesPlayed ? parseInt(holesPlayed) : maxH;
                    let previewGross: number;
                    if (scoreEntryMode === 'toPar') {
                      const par = selectedCourse.par;
                      const partialPar = effectiveHoles < maxH ? Math.round(par * (effectiveHoles / maxH)) : par;
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
                      effectiveHoles,
                      maxH
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

      {/* Step 4: Success — Copy to Members */}
      {step === 'success' && (
        <div className="space-y-5">
          <div className="text-center py-4">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {teeTimeOnly || !hasScoreEntry ? 'Tee Time Saved' : 'Score Submitted'}
            </h2>
          </div>

          <div className="bg-minerva-50 rounded-xl p-3 space-y-1">
            <p className="text-sm font-medium text-minerva-800">
              {selectedCourse?.course_name} &middot; {selectedCourse?.tee_name}
            </p>
            {roundDate && (
              <p className="text-xs text-minerva-600">
                {new Date(roundDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                {teeTimeOfDay && ` at ${new Date(`2000-01-01T${teeTimeOfDay}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
              </p>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              Copy tee time to other members?
            </h3>
            <MemberPicker
              members={members}
              excludeIds={copiedMemberIds}
              disabledIds={copyDisabledIds}
              disabledReason="Already has tee time"
              onConfirm={handleCopyToMembers}
              onCancel={() => router.push('/scores')}
              loading={copyLoading}
            />
          </div>

          <button
            onClick={() => router.push('/scores')}
            className="w-full text-[var(--text-muted)] text-sm py-2"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
