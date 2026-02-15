'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { ArrowLeft, Edit, Trash2, Plus, Target, Clock } from 'lucide-react';
import type { Course, User } from '@/types/database';

export default function CourseDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { isAdmin } = useUser();
  const { showToast } = useToast();
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
        <div className="h-6 bg-gray-200 rounded animate-pulse w-32" />
        <div className="h-40 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="p-4 text-center">
        <p className="text-gray-500">Course not found.</p>
        <Link href="/courses" className="text-emerald-600 text-sm font-medium mt-2 inline-block">
          Back to courses
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{course.course_name}</h1>
          <p className="text-sm text-gray-500">{course.tee_name} Tees</p>
        </div>
      </div>

      {/* Course Info Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Type</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">
              {course.type.replace(/_/g, ' ')}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Par</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">{course.par}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Rating</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">{course.rating}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Slope</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">{course.slope}</p>
          </div>
        </div>

        {/* Audit info */}
        <div className="border-t border-gray-100 pt-3 space-y-1">
          {createdByUser && (
            <p className="text-xs text-gray-400">
              Added by {createdByUser.full_name || createdByUser.email} on{' '}
              {new Date(course.created_at).toLocaleDateString()}
            </p>
          )}
          {updatedByUser && course.updated_at !== course.created_at && (
            <p className="text-xs text-gray-400">
              Last edited by {updatedByUser.full_name || updatedByUser.email} on{' '}
              {new Date(course.updated_at).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <Link
          href={`/courses/${course.id}/edit`}
          className="flex items-center justify-center gap-2 w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Edit className="w-4 h-4" />
          Edit Course
        </Link>

        <Link
          href={`/courses/add?course_name=${encodeURIComponent(course.course_name)}&lock_name=true`}
          className="flex items-center justify-center gap-2 w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Another Tee
        </Link>

        <Link
          href={`/scores/add?course_id=${course.id}`}
          className="flex items-center justify-center gap-2 w-full bg-emerald-600 text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-emerald-700 transition-colors"
        >
          <Target className="w-4 h-4" />
          Start a Round
        </Link>

        <Link
          href={`/scores/add?course_id=${course.id}&tee_time_only=true`}
          className="flex items-center justify-center gap-2 w-full bg-white border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm font-medium hover:bg-emerald-50 transition-colors"
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
