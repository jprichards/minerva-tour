'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { calculateNetScore, getMaxHoles } from '@/lib/scoring';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import type { User, Event, Course } from '@/types/database';

export default function AdminRetroactiveScoresPage() {
  const { isAdmin, loading: userLoading } = useUser();
  const router = useRouter();
  const { showToast } = useToast();
  const supabase = createClient();

  const [members, setMembers] = useState<User[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form
  const [memberId, setMemberId] = useState('');
  const [eventId, setEventId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [grossScore, setGrossScore] = useState('');
  const [holesPlayed, setHolesPlayed] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userLoading && !isAdmin) router.push('/home');
  }, [isAdmin, userLoading, router]);

  useEffect(() => {
    const fetchData = async () => {
      const { data: membersData } = await supabase
        .from('users')
        .select('*')
        .in('role', ['admin', 'member', 'playing_guest'])
        .order('full_name');
      setMembers(membersData || []);

      // Fetch all events for retroactive entry
      const { data: eventsData } = await supabase
        .from('events')
        .select('*')
        .order('event_number', { ascending: true });
      setEvents(eventsData || []);

      const { data: coursesData } = await supabase
        .from('courses')
        .select('*')
        .order('course_name');
      setCourses(coursesData || []);

      setLoading(false);
    };
    fetchData();
  }, [supabase]);

  const selectedCourse = courses.find((c) => c.id === courseId);
  const selectedMember = members.find((m) => m.id === memberId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId || !eventId || !courseId || !grossScore || !holesPlayed) {
      setError('Please fill in all fields.');
      return;
    }

    setSubmitting(true);
    setError('');

    const grossNum = parseInt(grossScore);
    const holesNum = parseInt(holesPlayed);
    const course = courses.find((c) => c.id === courseId);
    const member = members.find((m) => m.id === memberId);

    if (!course || !member) {
      setError('Invalid selection.');
      setSubmitting(false);
      return;
    }

    const maxHoles = getMaxHoles(course.type);
    let courseHandicap = null;
    let netScore = null;
    let netStrokesOverPar = null;

    if (member.handicap_index != null) {
      const result = calculateNetScore(
        grossNum,
        member.handicap_index,
        course.slope,
        course.rating,
        course.par,
        holesNum,
        maxHoles
      );
      courseHandicap = result.courseHandicap;
      netScore = result.netScore;
      netStrokesOverPar = result.netStrokesOverPar;
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error: insertError } = await supabase
      .from('scores')
      .insert({
        user_id: memberId,
        event_id: eventId,
        course_id: courseId,
        gross_score: grossNum,
        holes_played: holesNum,
        is_complete: true,
        course_handicap: courseHandicap,
        net_score: netScore,
        net_strokes_over_par: netStrokesOverPar,
        is_retroactive: true,
        submitted_by: user?.id,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    logAuditEvent('score_submission', 'score', data.id, {
      retroactive: true,
      player: member.full_name || member.email,
      course: course.course_name,
      gross_score: grossNum,
    });

    showToast('Retroactive score submitted!', 'success');
    setGrossScore('');
    setHolesPlayed('');
    setSubmitting(false);
  };

  if (!isAdmin) return null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Retroactive Score Entry</h1>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700">
            Enter retroactive scores for events 1-2 for members in unplayable climates. Scores must be made up by end of event 4 per PRD rules. Scores entered here will be flagged as retroactive.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Member */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Member</label>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            >
              <option value="">Select a member</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name || m.email} {m.handicap_index != null ? `(${m.handicap_index})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Event */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Event</label>
            <select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            >
              <option value="">Select an event</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  Event {ev.event_number}{ev.name ? ` — ${ev.name}` : ''} ({new Date(ev.start_date).toLocaleDateString()} – {new Date(ev.end_date).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>

          {/* Course */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Course</label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            >
              <option value="">Select a course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.course_name} — {c.tee_name} (Par {c.par}, {c.rating}/{c.slope})
                </option>
              ))}
            </select>
          </div>

          {/* Gross Score */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Gross Score</label>
            <input
              type="number"
              value={grossScore}
              onChange={(e) => setGrossScore(e.target.value)}
              placeholder="e.g. 85"
              className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            />
          </div>

          {/* Holes Played */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Holes Played</label>
            <input
              type="number"
              min="1"
              max={selectedCourse ? getMaxHoles(selectedCourse.type) : 18}
              value={holesPlayed}
              onChange={(e) => setHolesPlayed(e.target.value)}
              placeholder="e.g. 18"
              className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-xl">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-minerva-600 text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-minerva-700 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Retroactive Score'}
          </button>
        </form>
      )}
    </div>
  );
}
