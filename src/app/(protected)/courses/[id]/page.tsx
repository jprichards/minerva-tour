'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { ArrowLeft, Edit, Trash2, Plus, Target, Clock, AlertCircle } from 'lucide-react';
import { useSeason } from '@/lib/hooks/useSeason';
import { courseMatchesEventHoles } from '@/lib/scoring';
import { formatCourseType } from '@/lib/courses';
import type { Course, User } from '@/types/database';

export default function CourseDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { isAdmin } = useUser();
  const { showToast } = useToast();
  const { currentEvent } = useSeason();
  const [course, setCourse] = useState<Course | null>(null);
  const [createdByUser, setCreatedByUser] = useState<User | null>(null);
  const [updatedByUser, setUpdatedByUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const fetchCourse = async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        console.error('Error fetching course:', error);
        setLoading(false);
        return;
      }

      setCourse(data);

      // Fetch created_by user
      if (data.created_by) {
        const { data: user } = await supabase
          .from('users')
          .select('full_name, email')
          .eq('id', data.created_by)
          .single();
        setCreatedByUser(user as User | null);
      }

      // Fetch updated_by user
      if (data.updated_by && data.updated_by !== data.created_by) {
        const { data: user } = await supabase
          .from('users')
          .select('full_name, email')
          .eq('id', data.updated_by)
          .single();
        setUpdatedByUser(user as User | null);
      }

      setLoading(false);
    };

    fetchCourse();
  }, [id, supabase]);

  const handleDelete = async () => {
    if (!course) return;
    if (!confirm('Are you sure you want to delete this course? This cannot be undone.')) return;

    setDeleting(true);
    const { error } = await supabase.from('courses').delete().eq('id', course.id);

    if (error) {
      showToast('Failed to delete course.', 'error');
      setDeleting(false);
      return;
    }

    await logAuditEvent('course_delete', 'course', course.id, {
      course_name: course.course_name,
      tee_name: course.tee_name,
    });

    showToast('Course deleted.');
    router.push('/courses');
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-6 bg-[var(--bg-skeleton)] rounded animate-pulse w-32" />
        <div className="h-40 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="p-4 text-center">
        <p className="text-[var(--text-muted)]">Course not found.</p>
        <Link href="/courses" className="text-minerva-600 text-sm font-medium mt-2 inline-block">
          Back to courses
        </Link>
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
          <h1 className="text-xl font-bold text-[var(--text-primary)]">{course.course_name}</h1>
          <p className="text-sm text-[var(--text-muted)]">{course.tee_name} Tees</p>
        </div>
      </div>

      {/* Course Info Card */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Type</p>
            <p className="text-sm font-semibold text-[var(--text-primary)] mt-0.5">
              {formatCourseType(course.type)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Par</p>
            <p className="text-sm font-semibold text-[var(--text-primary)] mt-0.5">{course.par}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Rating</p>
            <p className="text-sm font-semibold text-[var(--text-primary)] mt-0.5">{course.rating}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Slope</p>
            <p className="text-sm font-semibold text-[var(--text-primary)] mt-0.5">{course.slope}</p>
          </div>
        </div>

        {/* Audit info */}
        <div className="border-t border-[var(--border-light)] pt-3 space-y-1">
          {createdByUser && (
            <p className="text-xs text-[var(--text-faint)]">
              Added by {createdByUser.full_name || createdByUser.email} on{' '}
              {new Date(course.created_at).toLocaleDateString()}
            </p>
          )}
          {updatedByUser && course.updated_at !== course.created_at && (
            <p className="text-xs text-[var(--text-faint)]">
              Last edited by {updatedByUser.full_name || updatedByUser.email} on{' '}
              {new Date(course.updated_at).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* Event compatibility warning */}
      {currentEvent?.holes && !courseMatchesEventHoles(course.type, currentEvent.holes) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Not compatible with current event</p>
            <p className="text-xs text-amber-700 mt-0.5">
              The current event is {currentEvent.holes} holes, but this tee is configured as {formatCourseType(course.type)}.
              To use this course, add an {currentEvent.holes === 9 ? '9-hole' : '18-hole'} tee below.
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        <Link
          href={`/courses/${course.id}/edit`}
          className="flex items-center justify-center gap-2 w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl px-4 py-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-page)] transition-colors"
        >
          <Edit className="w-4 h-4" />
          Edit Course
        </Link>

        <Link
          href={`/courses/add?course_name=${encodeURIComponent(course.course_name)}&lock_name=true`}
          className="flex items-center justify-center gap-2 w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl px-4 py-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-page)] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Another Tee
        </Link>

        <Link
          href={`/scores/add?course_id=${course.id}`}
          className={`flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
            currentEvent?.holes && !courseMatchesEventHoles(course.type, currentEvent.holes)
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-minerva-600 text-white hover:bg-minerva-700'
          }`}
          onClick={(e) => {
            if (currentEvent?.holes && !courseMatchesEventHoles(course.type, currentEvent.holes)) {
              e.preventDefault();
            }
          }}
        >
          <Target className="w-4 h-4" />
          Start a Round
        </Link>

        <Link
          href={`/scores/add?course_id=${course.id}&tee_time_only=true`}
          className={`flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
            currentEvent?.holes && !courseMatchesEventHoles(course.type, currentEvent.holes)
              ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
              : 'bg-[var(--bg-card)] border border-minerva-200 text-minerva-700 hover:bg-minerva-50'
          }`}
          onClick={(e) => {
            if (currentEvent?.holes && !courseMatchesEventHoles(course.type, currentEvent.holes)) {
              e.preventDefault();
            }
          }}
        >
          <Clock className="w-4 h-4" />
          Add Tee Time
        </Link>

        {isAdmin && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center justify-center gap-2 w-full bg-red-50 text-red-600 rounded-xl px-4 py-3 text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {deleting ? 'Deleting...' : 'Delete Course'}
          </button>
        )}
      </div>
    </div>
  );
}
