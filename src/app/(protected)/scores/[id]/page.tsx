'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { calculateNetScore, calculateScratchScore, getMaxHoles, formatNetScore, formatGrossScore, courseMatchesEventHoles, calculateUnroundedCourseHandicap, calculateUnroundedPlayingHandicap, calculateScoringDifferential, calculatePartialPar } from '@/lib/scoring';
import { notifySlack } from '@/lib/slack-notify';
import { useSeason } from '@/lib/hooks/useSeason';
import { fetchAllCourses, formatCourseType } from '@/lib/courses';
import { ArrowLeft, Edit, Trash2, Save, Search, ChevronRight, X, Copy } from 'lucide-react';
import MemberPicker from '@/components/MemberPicker';
import { parseLocalDate } from '@/lib/date-utils';
import QuickScore from '@/components/QuickScore';
import type { Score, Event, Course, User } from '@/types/database';

export default function ScoreDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile, isAdmin } = useUser();
  const { season, currentEvent: seasonCurrentEvent } = useSeason();
  const { showToast } = useToast();
  const { mutate } = useSWRConfig();
  const supabase = createClient();

  const [score, setScore] = useState<Score | null>(null);
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit fields
  const [grossScore, setGrossScore] = useState('');
  const [grossToPar, setGrossToPar] = useState('');
  const [scoreEntryMode, setScoreEntryMode] = useState<'gross' | 'toPar'>('gross');
  const [holesPlayed, setHolesPlayed] = useState('');
  const [isPartialRound, setIsPartialRound] = useState(false);
  const [roundDate, setRoundDate] = useState('');
  const [teeTimeOfDay, setTeeTimeOfDay] = useState('');
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [editHandicapIndex, setEditHandicapIndex] = useState('');

  // Event change fields (historical only)
  const [editEventId, setEditEventId] = useState('');
  const [seasonEvents, setSeasonEvents] = useState<Event[]>([]);

  // Course change fields
  const [changingCourse, setChangingCourse] = useState(false);
  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseSearch, setCourseSearch] = useState('');

  // Copy to members fields
  const [copying, setCopying] = useState(false);
  const [copyMembers, setCopyMembers] = useState<User[]>([]);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyDisabledIds, setCopyDisabledIds] = useState<string[]>([]);

  useEffect(() => {
    const fetchScore = async () => {
      const { data, error } = await supabase
        .from('scores')
        .select('*, course:courses(*), user:users!user_id(full_name, email, handicap_index), submitter:users!submitted_by(full_name, email), event:events(*)')
        .eq('id', id)
        .single();

      if (error) console.error('Error:', error);
      if (data) {
        setScore(data as unknown as Score);
        setGrossScore(data.gross_score?.toString() || '');
        setHolesPlayed(data.holes_played?.toString() || '');
        const courseType = data.course?.type || '18_holes';
        const maxH = getMaxHoles(courseType);
        setIsPartialRound(data.holes_played != null && data.holes_played < maxH);
        if (data.tee_time) {
          const dt = new Date(data.tee_time);
          setRoundDate(dt.toISOString().split('T')[0]);
          const h = dt.getUTCHours(), m = dt.getUTCMinutes();
          setTeeTimeOfDay((h || m) ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : '');
        } else {
          const d = new Date();
          setRoundDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
          setTeeTimeOfDay('');
        }
        if (data.course) setEditCourse(data.course as unknown as Course);
      }

      // Get current event
      const today = new Date().toISOString().split('T')[0];
      const { data: seasons } = await supabase.from('seasons').select('*').order('year', { ascending: false }).limit(1);
      if (seasons && seasons.length > 0) {
        const { data: events } = await supabase
          .from('events')
          .select('*')
          .eq('season_id', seasons[0].id)
          .lte('start_date', today)
          .gte('end_date', today)
          .limit(1);
        if (events && events.length > 0) setCurrentEvent(events[0]);
      }

      setLoading(false);
    };

    fetchScore();
  }, [id, supabase]);

  const canEdit = isAdmin || (
    score &&
    profile &&
    (score.user_id === profile.id || score.submitted_by === profile.id) &&
    score.event_id === currentEvent?.id
  );

  const canDelete = canEdit;

  const currentSeasonYear = season?.year ?? new Date().getFullYear();
  const isHistorical = score?.event != null && parseLocalDate(score.event.end_date).getFullYear() < currentSeasonYear;

  const editHasScore = scoreEntryMode === 'toPar' ? grossToPar !== '' : grossScore !== '';
  const editMissingHoles = editHasScore && isPartialRound && !holesPlayed;
  const editMissingScore = !editHasScore && isPartialRound && !!holesPlayed;
  const editIncomplete = editMissingHoles || editMissingScore;
  const combinedTeeTime = roundDate ? `${roundDate}T${teeTimeOfDay || '00:00'}` : null;

  const handleSave = async () => {
    if (!score || !editCourse) return;
    if (editIncomplete) return;
    setSaving(true);

    const activeCourse = editCourse;
    const maxHoles = getMaxHoles(activeCourse.type);
    let grossScoreNum: number | null = null;
    if (scoreEntryMode === 'toPar' && grossToPar !== '') {
      const hp = isPartialRound && holesPlayed ? parseInt(holesPlayed) : maxHoles;
      const partialPar = hp < maxHoles ? Math.round(activeCourse.par * (hp / maxHoles)) : activeCourse.par;
      grossScoreNum = partialPar + parseInt(grossToPar);
    } else {
      grossScoreNum = grossScore ? parseInt(grossScore) : null;
    }
    const holesPlayedNum = grossScoreNum != null
      ? (isPartialRound && holesPlayed ? parseInt(holesPlayed) : maxHoles)
      : null;
    const isComplete = grossScoreNum != null && holesPlayedNum != null && holesPlayedNum >= maxHoles;

    let courseHandicap = null;
    let netScoreVal = null;
    let netStrokesOverPar = null;
    let scratchStrokesOverRating: number | null = null;

    const handicapIndex = isHistorical && editHandicapIndex !== ''
      ? parseFloat(editHandicapIndex)
      : (score.user as unknown as { handicap_index: number | null })?.handicap_index;

    if (grossScoreNum != null && holesPlayedNum != null && handicapIndex != null) {
      const allowance = season?.handicap_allowance ?? 95;
      const result = calculateNetScore(
        grossScoreNum,
        handicapIndex,
        activeCourse.slope,
        activeCourse.rating,
        activeCourse.par,
        holesPlayedNum,
        maxHoles,
        allowance
      );
      courseHandicap = result.courseHandicap;
      netScoreVal = result.netScore;
      netStrokesOverPar = result.netStrokesOverPar;
    }

    if (grossScoreNum != null && holesPlayedNum != null) {
      const scratch = calculateScratchScore(
        grossScoreNum,
        activeCourse.rating,
        activeCourse.par,
        holesPlayedNum,
        maxHoles,
      );
      scratchStrokesOverRating = scratch.scratchStrokesOverRating;
    }

    const courseChanged = activeCourse.id !== score.course_id;

    const updatePayload: Record<string, unknown> = {
      course_id: activeCourse.id,
      gross_score: grossScoreNum,
      holes_played: holesPlayedNum,
      tee_time: combinedTeeTime,
      is_complete: isComplete,
      course_handicap: courseHandicap,
      net_score: netScoreVal,
      net_strokes_over_par: netStrokesOverPar,
      scratch_strokes_over_rating: scratchStrokesOverRating,
    };

    if (isHistorical && editHandicapIndex !== '') {
      updatePayload.handicap_index_used = parseFloat(editHandicapIndex);
    }

    if (isHistorical && editEventId && editEventId !== score.event_id) {
      updatePayload.event_id = editEventId;
    }

    const { error } = await supabase
      .from('scores')
      .update(updatePayload)
      .eq('id', score.id);

    if (error) {
      showToast('Failed to update score.', 'error');
      setSaving(false);
      return;
    }

    await logAuditEvent('score_edit', 'score', score.id, {
      player: (score.user as unknown as { full_name: string | null })?.full_name,
      before: {
        event: score.event?.name || `Event ${score.event?.event_number}`,
        course: score.course?.course_name,
        tee: score.course?.tee_name,
        gross_score: score.gross_score,
        holes_played: score.holes_played,
        net_strokes_over_par: score.net_strokes_over_par,
        scratch_strokes_over_rating: score.scratch_strokes_over_rating,
        course_handicap: score.course_handicap,
        net_score: score.net_score,
        handicap_index_used: score.handicap_index_used,
        tee_time: score.tee_time,
        is_complete: score.is_complete,
      },
      after: {
        event: (() => { const e = seasonEvents.find(ev => ev.id === editEventId); return e ? (e.name || `Event ${e.event_number}`) : score.event?.name || `Event ${score.event?.event_number}`; })(),
        course: activeCourse.course_name,
        tee: activeCourse.tee_name,
        gross_score: grossScoreNum,
        holes_played: holesPlayedNum,
        net_strokes_over_par: netStrokesOverPar,
        scratch_strokes_over_rating: scratchStrokesOverRating,
        course_handicap: courseHandicap,
        net_score: netScoreVal,
        handicap_index_used: isHistorical && editHandicapIndex !== '' ? parseFloat(editHandicapIndex) : score.handicap_index_used,
        tee_time: combinedTeeTime,
        is_complete: isComplete,
      },
    });

    if (!isHistorical) {
      const wasAlreadyComplete = score.is_complete === true;
      const isFullRound = holesPlayedNum != null && holesPlayedNum >= maxHoles;
      const playerUser = score.user as unknown as { full_name: string | null; email: string | null; handicap_index: number | null };

      let slackEventType: 'score_in_progress' | 'round_complete' | 'score_edit';
      if (!isFullRound) {
        slackEventType = 'score_in_progress';
      } else if (!wasAlreadyComplete) {
        slackEventType = 'round_complete';
      } else {
        slackEventType = 'score_edit';
      }

      notifySlack({
        event_type: slackEventType,
        player_name: playerUser?.full_name || playerUser?.email || 'Unknown',
        handicap_index: playerUser?.handicap_index,
        course_name: activeCourse.course_name,
        tee_name: activeCourse.tee_name,
        course_type: activeCourse.type,
        par: activeCourse.par,
        rating: activeCourse.rating,
        gross_score: grossScoreNum,
        net_score: netScoreVal,
        net_strokes_over_par: netStrokesOverPar,
        holes_played: holesPlayedNum,
        max_holes: maxHoles,
        tee_time: combinedTeeTime,
        event_name: score.event?.name || (score.event ? `Event ${score.event.event_number}` : null),
        old_gross_score: score.gross_score,
        old_net_score: score.net_strokes_over_par,
      });
    }

    mutate('leaderboard');
    mutate((key: unknown) => Array.isArray(key) && key[0] === 'scores', undefined, { revalidate: true });

    const { data: updated } = await supabase
      .from('scores')
      .select('*, course:courses(*), user:users!user_id(full_name, email, handicap_index), submitter:users!submitted_by(full_name, email), event:events(*)')
      .eq('id', id)
      .single();
    if (updated) setScore(updated as unknown as Score);

    showToast('Score updated!');
    setSaving(false);
    setEditing(false);
    setChangingCourse(false);
    setCourseSearch('');
    setScoreEntryMode('gross');
    setGrossToPar('');
    router.refresh();
  };

  const handleStartCopy = async () => {
    if (!score) return;
    setCopying(true);

    const { data: membersData } = await supabase
      .from('users')
      .select('*')
      .in('role', ['admin', 'member', 'playing_guest'])
      .order('full_name');
    setCopyMembers(membersData || []);

    const { data: existingScores } = await supabase
      .from('scores')
      .select('user_id')
      .eq('course_id', score.course_id)
      .eq('event_id', score.event_id);

    const existingUserIds = (existingScores || []).map((s: { user_id: string }) => s.user_id);
    setCopyDisabledIds(existingUserIds.filter((uid: string) => uid !== score.user_id));
  };

  const handleCopyToMembers = async (memberIds: string[]) => {
    if (!score) return;
    setCopyLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    const rows = memberIds.map((uid) => ({
      user_id: uid,
      course_id: score.course_id,
      event_id: score.event_id,
      tee_time: score.tee_time,
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
      const courseName = score.course?.course_name || '';
      const teeName = score.course?.tee_name || '';
      for (const row of inserted) {
        const member = copyMembers.find((m) => m.id === row.user_id);
        await logAuditEvent('score_submission', 'score', row.id, {
          player: member?.full_name || member?.email,
          course: courseName,
          tee: teeName,
          copied_from_score_id: score.id,
        });

        notifySlack({
          event_type: 'tee_time',
          player_name: member?.full_name || member?.email || 'Unknown',
          handicap_index: member?.handicap_index,
          course_name: courseName,
          tee_name: teeName,
          course_type: score.course?.type,
          par: score.course?.par || 72,
          rating: score.course?.rating,
          tee_time: score.tee_time || null,
          event_name: score.event?.name || (score.event ? `Event ${score.event.event_number}` : null),
          is_complete: false,
        });
      }
    }

    mutate((key: unknown) => Array.isArray(key) && key[0] === 'scores', undefined, { revalidate: true });
    showToast(`Tee time copied to ${memberIds.length} member${memberIds.length !== 1 ? 's' : ''}!`);
    setCopyLoading(false);
    setCopying(false);
  };

  const handleDelete = async () => {
    if (!score) return;
    if (!confirm('Delete this score? This cannot be undone.')) return;

    const { data, error } = await supabase.from('scores').delete().eq('id', score.id).select();
    if (error || !data || data.length === 0) {
      showToast('Failed to delete score.', 'error');
      return;
    }

    await logAuditEvent('score_delete', 'score', score.id, {
      player: score.user?.full_name,
      course: score.course?.course_name,
      tee: score.course?.tee_name,
      gross_score: score.gross_score,
      holes_played: score.holes_played,
      net_strokes_over_par: score.net_strokes_over_par,
      course_handicap: score.course_handicap,
      net_score: score.net_score,
      tee_time: score.tee_time,
      is_complete: score.is_complete,
      event_name: score.event?.name || null,
    });

    mutate('leaderboard');
    mutate((key: unknown) => Array.isArray(key) && key[0] === 'scores', undefined, { revalidate: true });

    showToast('Score deleted.');
    router.push(score.is_complete ? '/scores?tab=completed' : '/scores?tab=teetimes');
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-6 bg-[var(--bg-skeleton)] rounded animate-pulse w-32" />
        <div className="h-48 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!score) {
    return (
      <div className="p-4 text-center">
        <p className="text-[var(--text-muted)]">Score not found.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => {
          if (editing) {
            setEditing(false);
            setChangingCourse(false);
            setCourseSearch('');
            setScoreEntryMode('gross');
            setGrossToPar('');
            setGrossScore(score?.gross_score?.toString() || '');
            if (score?.course) setEditCourse(score.course as unknown as Course);
          } else {
            router.back();
          }
        }} className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            {score.is_complete ? 'Round Detail' : 'Tee Time Detail'}
          </h1>
        </div>
        {canEdit && !editing && (!isHistorical || isAdmin) && (
          <button onClick={async () => {
            setEditing(true);
            if (score?.course) setEditCourse(score.course as unknown as Course);
            setGrossScore(score?.gross_score?.toString() || '');
            setHolesPlayed(score?.holes_played?.toString() || '');
            setEditHandicapIndex(score?.handicap_index_used?.toString() ?? '');
            setEditEventId(score?.event_id || '');
            if (isHistorical && score?.event?.season_id) {
              const { data: evts } = await supabase
                .from('events')
                .select('*')
                .eq('season_id', score.event.season_id)
                .order('event_number', { ascending: true });
              if (evts) setSeasonEvents(evts as Event[]);
            }
            const maxH = getMaxHoles(score?.course?.type || '18_holes');
            setIsPartialRound(score?.holes_played != null && score.holes_played < maxH);
            setScoreEntryMode('gross');
            if (score?.gross_score != null && score?.course) {
              const hp = score.holes_played ?? maxH;
              const partialPar = hp < maxH
                ? Math.round(score.course.par * (hp / maxH))
                : score.course.par;
              setGrossToPar((score.gross_score - partialPar).toString());
            } else {
              setGrossToPar('');
            }
            if (score?.tee_time) {
              const dt = new Date(score.tee_time);
              setRoundDate(dt.toISOString().split('T')[0]);
              const h = dt.getUTCHours(), m = dt.getUTCMinutes();
              setTeeTimeOfDay((h || m) ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : '');
            } else {
              const d = new Date();
              setRoundDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
              setTeeTimeOfDay('');
            }
          }} className="p-2 rounded-lg hover:bg-[var(--bg-subtle)]">
            <Edit className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        )}
      </div>

      {/* Course Picker (shown when changing course in edit mode) */}
      {changingCourse && (
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Select Course / Tee</h2>
            <button
              onClick={() => { setChangingCourse(false); setCourseSearch(''); }}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)]"
            >
              <X className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
            <input
              type="text"
              placeholder="Search courses..."
              value={courseSearch}
              onChange={(e) => setCourseSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
              autoFocus
            />
          </div>

          {!isHistorical && seasonCurrentEvent?.holes && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2 text-xs text-blue-700">
              Showing {seasonCurrentEvent.holes === 9 ? '9-hole' : '18-hole'} courses for the current event.
            </div>
          )}

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {courses
              .filter((c) =>
                (isHistorical || courseMatchesEventHoles(c.type, seasonCurrentEvent?.holes)) &&
                (c.course_name.toLowerCase().includes(courseSearch.toLowerCase()) ||
                c.tee_name.toLowerCase().includes(courseSearch.toLowerCase()))
              )
              .map((course) => (
                <button
                  key={course.id}
                  onClick={() => {
                    setEditCourse(course);
                    setChangingCourse(false);
                    setCourseSearch('');
                  }}
                  className={`w-full flex items-center justify-between rounded-xl p-2.5 border transition-colors text-left ${
                    course.id === editCourse?.id
                      ? 'border-minerva-300 bg-minerva-50'
                      : 'border-[var(--border-light)] hover:border-minerva-200 bg-[var(--bg-page)]'
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{course.course_name}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {course.tee_name} &middot; {formatCourseType(course.type)} &middot;
                      Par {course.par} &middot; {course.rating}/{course.slope}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Subheader Card: Course info + condensed player/event/tee time */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-5 space-y-3">
        {/* Course Info */}
        <div>
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-[var(--text-primary)]">{(editing ? editCourse : score.course)?.course_name}</p>
              <p className="text-sm text-[var(--text-muted)]">
                {(editing ? editCourse : score.course)?.tee_name} &middot; {formatCourseType((editing ? editCourse : score.course)?.type || '')} &middot;
                Par {(editing ? editCourse : score.course)?.par}
              </p>
            </div>
            {editing && !changingCourse && (
              <button
                onClick={async () => {
                  if (courses.length === 0) {
                    const allCourses = await fetchAllCourses(supabase);
                    setCourses(allCourses);
                  }
                  setChangingCourse(true);
                }}
                className="text-xs font-medium text-minerva-600 bg-minerva-50 px-3 py-1.5 rounded-lg hover:bg-minerva-100 transition-colors shrink-0"
              >
                Change
              </button>
            )}
          </div>
          {editing && editCourse && editCourse.id !== score.course_id && (
            <p className="text-xs text-minerva-600 mt-1">
              Changed from: {score.course?.course_name} ({score.course?.tee_name})
            </p>
          )}
        </div>

        {/* Condensed: Player | Event | Tee Time */}
        <p className="text-sm text-[var(--text-muted)] border-t border-[var(--border-light)] pt-3">
          {score.user?.full_name || score.user?.email}
          {score.event && (
            <> &middot; {score.event.name || `Event ${score.event.event_number}`}{score.event.is_major ? ' (Major)' : ''}</>
          )}
          {score.tee_time && (
            <> &middot; {new Date(score.tee_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
            {(() => { const d = new Date(score.tee_time!); return (d.getUTCHours() || d.getUTCMinutes()) ? ` at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })}` : ''; })()}</>
          )}
        </p>
      </div>

      {/* Quick Score - tap-to-increment panel for active tee times */}
      {!editing && canEdit && !isHistorical && !copying && score && (
        <QuickScore
          score={score}
          allowance={season?.handicap_allowance ?? 95}
          onSaved={async () => {
            mutate('leaderboard');
            mutate((key: unknown) => Array.isArray(key) && key[0] === 'scores', undefined, { revalidate: true });
            const { data: updated } = await supabase
              .from('scores')
              .select('*, course:courses(*), user:users!user_id(full_name, email, handicap_index), submitter:users!submitted_by(full_name, email), event:events(*)')
              .eq('id', id)
              .single();
            if (updated) setScore(updated as unknown as Score);
          }}
        />
      )}

      {/* Edit Form */}
      {editing && (
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-5 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Date</label>
              <div
                className="relative rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-2.5 mt-1 cursor-pointer"
                onClick={() => { try { dateInputRef.current?.showPicker(); } catch {} }}
              >
                <input
                  ref={dateInputRef}
                  type="date"
                  value={roundDate}
                  onChange={(e) => setRoundDate(e.target.value || roundDate)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                />
                <span className="text-sm pointer-events-none">
                  {roundDate
                    ? new Date(roundDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
                    : <span className="text-[var(--text-muted)]">Select date</span>}
                </span>
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                Time <span className="normal-case tracking-normal font-normal text-[var(--text-faint)]">(opt.)</span>
              </label>
              <div className="relative rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-2.5 mt-1">
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
          {editing && isHistorical && (
            <>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Handicap Index Used</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editHandicapIndex}
                    onChange={(e) => setEditHandicapIndex(e.target.value)}
                    placeholder="e.g. 12.3"
                    className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-2.5 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
                  />
                </div>
                {seasonEvents.length > 0 && (
                  <div className="flex-1">
                    <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Event</label>
                    <select
                      value={editEventId}
                      onChange={(e) => setEditEventId(e.target.value)}
                      className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-2.5 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
                    >
                      {seasonEvents.map((evt) => (
                        <option key={evt.id} value={evt.id}>
                          Event {evt.event_number}{evt.is_major ? ' (Major)' : ''} — {evt.holes}h
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </>
          )}
          <div>
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
              Score {editMissingScore && <span className="text-red-500">*</span>}
            </label>
            <div className="flex bg-[var(--bg-subtle)] rounded-lg p-0.5 mt-1 mb-2">
              <button
                type="button"
                onClick={() => {
                  if (scoreEntryMode === 'toPar' && grossToPar !== '' && editCourse) {
                    const maxH = getMaxHoles(editCourse.type);
                    const hp = isPartialRound && holesPlayed ? parseInt(holesPlayed) : maxH;
                    const partialPar = hp < maxH ? Math.round(editCourse.par * (hp / maxH)) : editCourse.par;
                    setGrossScore((partialPar + parseInt(grossToPar)).toString());
                  }
                  setScoreEntryMode('gross');
                  setGrossToPar('');
                }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  scoreEntryMode === 'gross' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-muted)]'
                }`}
              >
                Gross Score
              </button>
              <button
                type="button"
                onClick={() => {
                  if (scoreEntryMode === 'gross' && grossScore !== '' && editCourse) {
                    const maxH = getMaxHoles(editCourse.type);
                    const hp = isPartialRound && holesPlayed ? parseInt(holesPlayed) : maxH;
                    const partialPar = hp < maxH ? Math.round(editCourse.par * (hp / maxH)) : editCourse.par;
                    setGrossToPar((parseInt(grossScore) - partialPar).toString());
                  }
                  setScoreEntryMode('toPar');
                  setGrossScore('');
                }}
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
                placeholder={`e.g. ${(editCourse?.par || 72) + 10}`}
                className={`w-full rounded-xl border bg-[var(--input-bg)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500 ${
                  editMissingScore ? 'border-red-400 focus:ring-red-400' : 'border-[var(--input-border)]'
                }`}
              />
            ) : (
              <div>
                <input
                  type="number"
                  value={grossToPar}
                  onChange={(e) => setGrossToPar(e.target.value)}
                  placeholder="e.g. 5 for over, -2 for under"
                  className={`w-full rounded-xl border bg-[var(--input-bg)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500 ${
                    editMissingScore ? 'border-red-400 focus:ring-red-400' : 'border-[var(--input-border)]'
                  }`}
                />
                {grossToPar !== '' && editCourse && (
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    = Gross {(() => {
                      const par = editCourse.par;
                      const maxH = getMaxHoles(editCourse.type);
                      const hp = isPartialRound && holesPlayed ? parseInt(holesPlayed) : maxH;
                      const partialPar = hp < maxH ? Math.round(par * (hp / maxH)) : par;
                      return partialPar + parseInt(grossToPar || '0');
                    })()}
                  </p>
                )}
              </div>
            )}
            {editMissingScore && (
              <p className="text-xs text-red-500 mt-1">Required when holes played is entered.</p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
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
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                Holes Played {editMissingHoles && <span className="text-red-500">*</span>}
              </label>
              <input
                type="number"
                min="1"
                max={getMaxHoles(editCourse?.type || score.course?.type || '18_holes') - 1}
                value={holesPlayed}
                onChange={(e) => setHolesPlayed(e.target.value)}
                className={`w-full rounded-xl border bg-[var(--input-bg)] px-4 py-2.5 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-minerva-500 ${
                  editMissingHoles ? 'border-red-400 focus:ring-red-400' : 'border-[var(--input-border)]'
                }`}
              />
              {editMissingHoles && (
                <p className="text-xs text-red-500 mt-1">Required when submitting a score.</p>
              )}
            </div>
          )}

          <div className="pt-2 space-y-2">
            <button
              onClick={handleSave}
              disabled={saving || editIncomplete}
              className="flex items-center justify-center gap-2 w-full bg-minerva-600 text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-minerva-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setChangingCourse(false);
                setCourseSearch('');
                setScoreEntryMode('gross');
                setGrossToPar('');
                setGrossScore(score?.gross_score?.toString() || '');
                if (score?.course) setEditCourse(score.course as unknown as Course);
              }}
              className="w-full text-[var(--text-muted)] text-sm py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Handicap Breakdown — hidden for historical scores (uses current HI, wrong for past) */}
      {!editing && !copying && !isHistorical && (() => {
        const handicapIndex = (score.user as unknown as { handicap_index: number | null })?.handicap_index;
        const course = score.course;
        if (handicapIndex == null || !course) return null;

        const allowance = season?.handicap_allowance ?? 95;

        const courseHcpUnrounded = calculateUnroundedCourseHandicap(handicapIndex, course.slope, course.rating, course.par);
        const playingHcpUnrounded = calculateUnroundedPlayingHandicap(handicapIndex, course.slope, course.rating, course.par, allowance);
        const playingHcpRounded = Math.round(playingHcpUnrounded);
        const scoreForNetE = course.par + playingHcpRounded;

        return (
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-5 space-y-4">
            {/* Hero: Score Needed to shoot Net E */}
            <div className="text-center pb-3 border-b border-[var(--border-light)]">
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Score Needed to shoot Net E</p>
              <p className="text-3xl font-bold text-minerva-600 mt-1">{formatGrossScore(scoreForNetE, course.par)}</p>
            </div>

            {/* Handicap rows */}
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-[var(--text-muted)]">Handicap Index</p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{handicapIndex}</p>
              </div>

              <div className="flex items-baseline justify-between">
                <p className="text-sm text-[var(--text-muted)]">Course Handicap (unrounded)</p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{courseHcpUnrounded.toFixed(4)}</p>
              </div>

              <div className="flex items-start justify-between">
                <div className="min-w-0 mr-3">
                  <p className="text-sm text-[var(--text-muted)]">Playing Handicap (unrounded)</p>
                  <p className="text-xs text-[var(--text-faint)]">{allowance}% of unrounded Course Handicap</p>
                </div>
                <p className="text-sm font-semibold text-[var(--text-primary)] shrink-0">{playingHcpUnrounded.toFixed(4)}</p>
              </div>

              <div className="flex items-baseline justify-between">
                <p className="text-sm text-[var(--text-muted)]">Playing Handicap</p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{playingHcpRounded}</p>
              </div>
            </div>

            {/* Course details for reference */}
            <div className="border-t border-[var(--border-light)] pt-3 flex gap-4 text-xs text-[var(--text-faint)]">
              <span>Rating {course.rating}</span>
              <span>Slope {course.slope}</span>
              <span>Par {course.par}</span>
            </div>
          </div>
        );
      })()}

      {/* Historical score banner */}
      {!editing && isHistorical && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm font-medium text-amber-800">Historical Score</p>
          <p className="text-xs text-amber-600 mt-0.5">
            Imported from Glide ({parseLocalDate(score.event!.end_date).getFullYear()} season).{isAdmin ? '' : ' This score is read-only.'}
            {score.handicap_index_used != null && (
              <> Handicap at time of play: {score.handicap_index_used}</>
            )}
          </p>
        </div>
      )}

      {/* Score Results (view mode only, when score data exists) */}
      {!editing && !copying && score.gross_score != null && (() => {
        const viewMaxHoles = getMaxHoles(score.course?.type || '18_holes');
        const viewHolesPlayed = score.holes_played ?? viewMaxHoles;
        const effectivePar = viewHolesPlayed < viewMaxHoles
          ? calculatePartialPar(score.course?.par || 72, viewHolesPlayed, viewMaxHoles)
          : (score.course?.par || 72);
        return (
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Gross (Scratch) Score</p>
              <p className="text-xl font-bold text-[var(--text-primary)] mt-0.5">
                {formatGrossScore(score.gross_score, effectivePar)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Holes</p>
              <p className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{score.holes_played ?? getMaxHoles(score.course?.type || '18_holes')}</p>
            </div>
          </div>

          {score.net_strokes_over_par != null && (
            <div className="border-t border-[var(--border-light)] pt-3 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Net</p>
                <p className={`text-xl font-bold mt-0.5 ${
                  score.net_strokes_over_par < 0 ? 'text-red-600' :
                  score.net_strokes_over_par === 0 ? 'text-green-600' :
                  'text-[var(--text-primary)]'
                }`}>
                  {score.net_score != null
                    ? `${score.net_score} (${formatNetScore(score.net_strokes_over_par)})`
                    : formatNetScore(score.net_strokes_over_par)
                  }
                </p>
              </div>
              {isHistorical && score.scratch_strokes_over_rating != null ? (
                <div>
                  <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Scratch</p>
                  <p className={`text-xl font-bold mt-0.5 ${
                    score.scratch_strokes_over_rating < 0 ? 'text-red-600' :
                    score.scratch_strokes_over_rating === 0 ? 'text-green-600' :
                    'text-[var(--text-primary)]'
                  }`}>
                    {formatNetScore(score.scratch_strokes_over_rating)}
                  </p>
                </div>
              ) : !isHistorical && score.course && score.is_complete ? (
                <div>
                  <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Scoring Differential</p>
                  <p className="text-sm font-medium text-[var(--text-primary)] mt-0.5">
                    {calculateScoringDifferential(score.gross_score!, score.course.rating, score.course.slope).toFixed(1)}
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {(score.points_awarded != null || score.scratch_points_awarded != null) && (
            <div className="border-t border-[var(--border-light)] pt-3 grid grid-cols-2 gap-4">
              {score.points_awarded != null && (
                <div>
                  <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                    {score.scratch_points_awarded != null ? 'Net Points' : 'Points'}
                  </p>
                  <p className="text-lg font-bold text-yellow-600 mt-0.5">{score.points_awarded}</p>
                </div>
              )}
              {score.scratch_points_awarded != null && (
                <div>
                  <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Scratch Points</p>
                  <p className="text-lg font-bold text-yellow-600 mt-0.5">{score.scratch_points_awarded}</p>
                </div>
              )}
            </div>
          )}
        </div>
        );
      })()}

      {/* Copy to Members */}
      {!editing && canEdit && !isHistorical && copying && (
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Copy Tee Time to Members</h2>
            <button
              onClick={() => setCopying(false)}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)]"
            >
              <X className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>
          <MemberPicker
            members={copyMembers}
            excludeIds={[score.user_id]}
            disabledIds={copyDisabledIds}
            disabledReason="Already has tee time"
            onConfirm={handleCopyToMembers}
            onCancel={() => setCopying(false)}
            loading={copyLoading}
          />
        </div>
      )}

      {!editing && canEdit && !isHistorical && !copying && (
        <button
          onClick={handleStartCopy}
          className="flex items-center justify-center gap-2 w-full bg-minerva-50 text-minerva-700 rounded-xl px-4 py-3 text-sm font-medium hover:bg-minerva-100 transition-colors"
        >
          <Copy className="w-4 h-4" />
          Copy to Members
        </button>
      )}

      {!editing && canDelete && (!isHistorical || isAdmin) && !copying && (
        <button
          onClick={handleDelete}
          className="flex items-center justify-center gap-2 w-full bg-red-50 text-red-600 rounded-xl px-4 py-3 text-sm font-medium hover:bg-red-100 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete Score
        </button>
      )}

      {!canEdit && !isAdmin && (
        <p className="text-xs text-[var(--text-faint)] text-center">
          Scores from past events cannot be edited. Contact an admin for corrections.
        </p>
      )}

      {/* Created on / Created by */}
      {!editing && (
        <div className="text-xs text-[var(--text-faint)] text-center space-y-0.5 pt-2">
          <p>
            Created on{' '}
            {new Date(score.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}{' '}
            {new Date(score.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })}
          </p>
          {score.submitter && (
            <p>Created by {score.submitter.full_name || score.submitter.email}</p>
          )}
        </div>
      )}
    </div>
  );
}
