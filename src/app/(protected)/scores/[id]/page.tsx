'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { calculateNetScore, getMaxHoles, formatNetScore, formatGrossScore, courseMatchesEventHoles } from '@/lib/scoring';
import { notifySlack } from '@/lib/slack-notify';
import { useSeason } from '@/lib/hooks/useSeason';
import { ArrowLeft, Edit, Trash2, Save, Search, ChevronRight, X } from 'lucide-react';
import type { Score, Event, Course } from '@/types/database';

export default function ScoreDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile, isAdmin } = useUser();
  const { currentEvent: seasonCurrentEvent } = useSeason();
  const { showToast } = useToast();
  const supabase = createClient();

  const [score, setScore] = useState<Score | null>(null);
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit fields
  const [grossScore, setGrossScore] = useState('');
  const [holesPlayed, setHolesPlayed] = useState('');
  const [isPartialRound, setIsPartialRound] = useState(false);
  const [teeTime, setTeeTime] = useState('');

  // Course change fields
  const [changingCourse, setChangingCourse] = useState(false);
  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseSearch, setCourseSearch] = useState('');

  useEffect(() => {
    const fetchScore = async () => {
      const { data, error } = await supabase
        .from('scores')
        .select('*, course:courses(*), user:users!user_id(full_name, email, handicap_index), event:events(*)')
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

  const editHasScore = grossScore !== '';
  const editMissingHoles = editHasScore && isPartialRound && !holesPlayed;
  const editMissingScore = !editHasScore && isPartialRound && !!holesPlayed;
  const editIncomplete = editMissingHoles || editMissingScore;

  const handleSave = async () => {
    if (!score || !editCourse) return;
    if (editIncomplete) return;
    setSaving(true);

    const activeCourse = editCourse;
    const grossScoreNum = grossScore ? parseInt(grossScore) : null;
    const maxHoles = getMaxHoles(activeCourse.type);
    const holesPlayedNum = grossScoreNum != null
      ? (isPartialRound && holesPlayed ? parseInt(holesPlayed) : maxHoles)
      : null;
    const isComplete = grossScoreNum != null && holesPlayedNum != null;

    let courseHandicap = null;
    let netScoreVal = null;
    let netStrokesOverPar = null;

    const handicapIndex = (score.user as unknown as { handicap_index: number | null })?.handicap_index;

    if (isComplete && grossScoreNum && holesPlayedNum && handicapIndex != null) {
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

    showToast('Score updated!');
    setSaving(false);
    setEditing(false);
    setChangingCourse(false);
    setCourseSearch('');
    // Refresh
    router.refresh();
    const { data: updated } = await supabase
      .from('scores')
      .select('*, course:courses(*), user:users!user_id(full_name, email, handicap_index), event:events(*)')
      .eq('id', id)
      .single();
    if (updated) setScore(updated as unknown as Score);
  };

  const handleDelete = async () => {
    if (!score) return;
    if (!confirm('Delete this score? This cannot be undone.')) return;

    const { error } = await supabase.from('scores').delete().eq('id', score.id);
    if (error) {
      showToast('Failed to delete score.', 'error');
      return;
    }

    await logAuditEvent('score_delete', 'score', score.id, {
      player: score.user?.full_name,
      gross_score: score.gross_score,
    });

    showToast('Score deleted.');
    router.push('/scores');
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
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]">
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

      {/* Score Card */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-5 space-y-4">
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

        {/* Player */}
        <div className="border-t border-[var(--border-light)] pt-3">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Player</p>
          <p className="text-sm font-medium text-[var(--text-primary)] mt-0.5">
            {score.user?.full_name || score.user?.email}
          </p>
        </div>

        {/* Date */}
        {(score.tee_time || score.event?.start_date) && !editing && (
          <div className="border-t border-[var(--border-light)] pt-3">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Date</p>
            <p className="text-sm font-medium text-[var(--text-primary)] mt-0.5">
              {new Date(score.tee_time || (score.event!.start_date + 'T00:00:00')).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
            </p>
          </div>
        )}

        {/* Tee Time */}
        {editing ? (
          <div>
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Tee Time</label>
            <input
              type="datetime-local"
              value={teeTime}
              onChange={(e) => setTeeTime(e.target.value)}
              className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-2.5 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-minerva-500"
            />
          </div>
        ) : score.tee_time ? (
          <div className="border-t border-[var(--border-light)] pt-3">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Tee Time</p>
            <p className="text-sm font-medium text-[var(--text-primary)] mt-0.5">
              {new Date(score.tee_time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}{' '}
              {new Date(score.tee_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
            </p>
          </div>
        ) : null}

        {/* Score Details */}
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                Gross Score {editMissingScore && <span className="text-red-500">*</span>}
              </label>
              <input
                type="number"
                value={grossScore}
                onChange={(e) => setGrossScore(e.target.value)}
                className={`w-full rounded-xl border bg-[var(--input-bg)] px-4 py-2.5 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-minerva-500 ${
                  editMissingScore ? 'border-red-400 focus:ring-red-400' : 'border-[var(--input-border)]'
                }`}
              />
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
          </div>
        ) : (
          <>
            {score.gross_score && (
              <div className="border-t border-[var(--border-light)] pt-3 grid grid-cols-2 gap-4">
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
            )}

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
          </>
        )}

        {/* Event Info */}
        {score.event && (
          <div className="border-t border-[var(--border-light)] pt-3">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Event</p>
            <p className="text-sm font-medium text-[var(--text-primary)] mt-0.5">
              {score.event.name || `Event ${score.event.event_number}`}
              {score.event.is_major && ' (Major)'}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      {editing && (
        <div className="space-y-2">
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
              if (score?.course) setEditCourse(score.course as unknown as Course);
            }}
            className="w-full text-[var(--text-muted)] text-sm py-2"
          >
            Cancel
          </button>
        </div>
      )}

      {!editing && canDelete && (
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
    </div>
  );
}
