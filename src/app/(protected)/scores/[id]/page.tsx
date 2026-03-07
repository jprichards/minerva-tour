'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { calculateNetScore, getMaxHoles, formatNetScore, formatGrossScore, courseMatchesEventHoles } from '@/lib/scoring';
import { notifySlack } from '@/lib/slack-notify';
import { useSeason } from '@/lib/hooks/useSeason';
import { ArrowLeft, Edit, Trash2, Save, Search, ChevronRight, X, Copy } from 'lucide-react';
import MemberPicker from '@/components/MemberPicker';
import QuickScore from '@/components/QuickScore';
import type { Score, Event, Course, User } from '@/types/database';

export default function ScoreDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile, isAdmin } = useUser();
  const { currentEvent: seasonCurrentEvent } = useSeason();
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
  const [teeTime, setTeeTime] = useState('');

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
        setTeeTime(data.tee_time ? new Date(data.tee_time).toISOString().slice(0, 16) : '');
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

  const editHasScore = scoreEntryMode === 'toPar' ? grossToPar !== '' : grossScore !== '';
  const editMissingHoles = editHasScore && isPartialRound && !holesPlayed;
  const editMissingScore = !editHasScore && isPartialRound && !!holesPlayed;
  const editIncomplete = editMissingHoles || editMissingScore;

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

    const handicapIndex = (score.user as unknown as { handicap_index: number | null })?.handicap_index;

    if (grossScoreNum != null && holesPlayedNum != null && handicapIndex != null) {
      const result = calculateNetScore(
        grossScoreNum,
        handicapIndex,
        activeCourse.slope,
        activeCourse.rating,
        activeCourse.par,
        holesPlayedNum,
        maxHoles
      );
      courseHandicap = result.courseHandicap;
      netScoreVal = result.netScore;
      netStrokesOverPar = result.netStrokesOverPar;
    }

    const courseChanged = activeCourse.id !== score.course_id;

    const { error } = await supabase
      .from('scores')
      .update({
        course_id: activeCourse.id,
        gross_score: grossScoreNum,
        holes_played: holesPlayedNum,
        tee_time: teeTime || null,
        is_complete: isComplete,
        course_handicap: courseHandicap,
        net_score: netScoreVal,
        net_strokes_over_par: netStrokesOverPar,
      })
      .eq('id', score.id);

    if (error) {
      showToast('Failed to update score.', 'error');
      setSaving(false);
      return;
    }

    await logAuditEvent('score_edit', 'score', score.id, {
      before: {
        gross_score: score.gross_score,
        holes_played: score.holes_played,
        ...(courseChanged && { course: score.course?.course_name, tee: score.course?.tee_name }),
      },
      after: {
        gross_score: grossScoreNum,
        holes_played: holesPlayedNum,
        ...(courseChanged && { course: activeCourse.course_name, tee: activeCourse.tee_name }),
      },
    });

    // Determine the right Slack event type based on round state:
    // - Still mid-round (holes < max) → score_in_progress
    // - Just finished all holes for the first time → round_complete
    // - Updating a score on a finished round → score_edit
    const hadScoreBefore = score.gross_score != null;
    const isFullRound = holesPlayedNum != null && holesPlayedNum >= maxHoles;
    const playerUser = score.user as unknown as { full_name: string | null; email: string | null; handicap_index: number | null };

    let slackEventType: 'score_in_progress' | 'round_complete' | 'score_edit';
    if (!isFullRound) {
      // Mid-round: still on the course, updating score as they play
      slackEventType = 'score_in_progress';
    } else if (isFullRound && !hadScoreBefore) {
      // Just finished: had no score before, now all holes are in
      slackEventType = 'round_complete';
    } else if (isFullRound && hadScoreBefore) {
      // Revising a completed round's score
      slackEventType = 'score_edit';
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
      gross_score: grossScoreNum,
      net_score: netScoreVal,
      net_strokes_over_par: netStrokesOverPar,
      holes_played: holesPlayedNum,
      max_holes: maxHoles,
      tee_time: teeTime || null,
      event_name: score.event?.name || (score.event ? `Event ${score.event.event_number}` : null),
      old_gross_score: score.gross_score,
      old_net_score: score.net_strokes_over_par,
    });

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
      gross_score: score.gross_score,
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
        {canEdit && !editing && (
          <button onClick={() => {
            setEditing(true);
            if (score?.course) setEditCourse(score.course as unknown as Course);
            setGrossScore(score?.gross_score?.toString() || '');
            setHolesPlayed(score?.holes_played?.toString() || '');
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
            setTeeTime(score?.tee_time ? new Date(score.tee_time).toISOString().slice(0, 16) : '');
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

          {seasonCurrentEvent?.holes && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2 text-xs text-blue-700">
              Showing {seasonCurrentEvent.holes === 9 ? '9-hole' : '18-hole'} courses for the current event.
            </div>
          )}

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {courses
              .filter((c) =>
                courseMatchesEventHoles(c.type, seasonCurrentEvent?.holes) &&
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
                      {course.tee_name} &middot; {course.type.replace(/_/g, ' ')} &middot;
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
                {(editing ? editCourse : score.course)?.tee_name} &middot; {(editing ? editCourse : score.course)?.type.replace(/_/g, ' ')} &middot;
                Par {(editing ? editCourse : score.course)?.par}
              </p>
            </div>
            {editing && !changingCourse && (
              <button
                onClick={async () => {
                  if (courses.length === 0) {
                    const { data } = await supabase.from('courses').select('*').order('course_name');
                    setCourses(data || []);
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
            <> &middot; {new Date(score.tee_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}{' '}
            {new Date(score.tee_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })}</>
          )}
        </p>
      </div>

      {/* Quick Score - tap-to-increment panel for active tee times */}
      {!editing && canEdit && !copying && score && (
        <QuickScore
          score={score}
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
          <div>
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Tee Time</label>
            <input
              type="datetime-local"
              value={teeTime}
              onChange={(e) => setTeeTime(e.target.value)}
              className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-2.5 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-minerva-500"
            />
          </div>
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

      {/* Score Details Card (view mode only, when score data exists) */}
      {!editing && !copying && score.gross_score != null && (
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Gross</p>
              <p className="text-xl font-bold text-[var(--text-primary)] mt-0.5">
                {formatGrossScore(score.gross_score, score.course?.par || 72)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Holes</p>
              <p className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{score.holes_played ?? getMaxHoles(score.course?.type || '18_holes')}</p>
            </div>
          </div>

          {score.net_strokes_over_par != null && (
            <div className="border-t border-[var(--border-light)] pt-3 grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Net</p>
                <p className={`text-xl font-bold mt-0.5 ${
                  score.net_strokes_over_par < 0 ? 'text-red-600' :
                  score.net_strokes_over_par === 0 ? 'text-green-600' :
                  'text-[var(--text-primary)]'
                }`}>
                  {formatNetScore(score.net_strokes_over_par)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Course Hcp</p>
                <p className="text-sm font-medium text-[var(--text-primary)] mt-0.5">{score.course_handicap}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Net Score</p>
                <p className="text-sm font-medium text-[var(--text-primary)] mt-0.5">{score.net_score}</p>
              </div>
            </div>
          )}

          {score.points_awarded != null && (
            <div className="border-t border-[var(--border-light)] pt-3">
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Points</p>
              <p className="text-lg font-bold text-yellow-600 mt-0.5">{score.points_awarded}</p>
            </div>
          )}
        </div>
      )}

      {/* Copy to Members */}
      {!editing && canEdit && copying && (
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

      {!editing && canEdit && !copying && (
        <button
          onClick={handleStartCopy}
          className="flex items-center justify-center gap-2 w-full bg-minerva-50 text-minerva-700 rounded-xl px-4 py-3 text-sm font-medium hover:bg-minerva-100 transition-colors"
        >
          <Copy className="w-4 h-4" />
          Copy to Members
        </button>
      )}

      {!editing && canDelete && !copying && (
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
