'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logAuditEvent } from '@/lib/audit';
import { useToast } from '@/components/ui/Toast';
import { ArrowLeft } from 'lucide-react';
import type { Course } from '@/types/database';

const courseTypes = [
  { value: '18_holes', label: '18 Holes' },
  { value: '9_holes', label: '9 Holes' },
  { value: 'front_9', label: 'Front 9' },
  { value: 'back_9', label: 'Back 9' },
];

export default function EditCoursePage() {
  const { id } = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const supabase = createClient();

  const [original, setOriginal] = useState<Course | null>(null);
  const [courseName, setCourseName] = useState('');
  const [teeName, setTeeName] = useState('');
  const [type, setType] = useState('18_holes');
  const [rating, setRating] = useState('');
  const [slope, setSlope] = useState('');
  const [par, setPar] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCourse = async () => {
      const { data } = await supabase.from('courses').select('*').eq('id', id).single();
      if (data) {
        setOriginal(data);
        setCourseName(data.course_name);
        setTeeName(data.tee_name);
        setType(data.type);
        setRating(String(data.rating));
        setSlope(String(data.slope));
        setPar(String(data.par));
      }
      setLoading(false);
    };

    fetchCourse();
  }, [id, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const ratingNum = parseFloat(rating);
    const slopeNum = parseInt(slope);
    const parNum = parseInt(par);

    if (!courseName || !teeName || isNaN(ratingNum) || isNaN(slopeNum) || isNaN(parNum)) {
      setError('Please fill in all fields with valid values.');
      setSaving(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { error: updateError } = await supabase
      .from('courses')
      .update({
        course_name: courseName.trim(),
        tee_name: teeName.trim(),
        type,
        rating: ratingNum,
        slope: slopeNum,
        par: parNum,
        updated_by: user?.id,
      })
      .eq('id', id);

    if (updateError) {
      if (updateError.code === '23505') {
        setError('This exact course/tee combination already exists.');
      } else {
        setError(updateError.message);
      }
      setSaving(false);
      return;
    }

    await logAuditEvent('course_edit', 'course', id as string, {
      before: {
        course_name: original?.course_name,
        tee_name: original?.tee_name,
        type: original?.type,
        rating: original?.rating,
        slope: original?.slope,
        par: original?.par,
      },
      after: {
        course_name: courseName,
        tee_name: teeName,
        type,
        rating: ratingNum,
        slope: slopeNum,
        par: parNum,
      },
    });

    showToast('Course updated successfully!');
    router.push(`/courses/${id}`);
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="h-6 bg-[var(--bg-skeleton)] rounded animate-pulse w-32 mb-6" />
        <div className="space-y-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-12 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Edit Course</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Course Name</label>
          <input
            type="text"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Tee Name</label>
          <input
            type="text"
            value={teeName}
            onChange={(e) => setTeeName(e.target.value)}
            className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Type</label>
          <div className="grid grid-cols-2 gap-2">
            {courseTypes.map((ct) => (
              <button
                key={ct.value}
                type="button"
                onClick={() => setType(ct.value)}
                className={`rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                  type === ct.value
                    ? 'bg-minerva-600 text-white border-minerva-600'
                    : 'bg-[var(--bg-card)] text-[var(--text-secondary)] bg-[var(--input-bg)] border-[var(--input-border)] hover:border-minerva-300'
                }`}
              >
                {ct.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Course Rating</label>
          <input
            type="number"
            step="0.1"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Slope Rating</label>
          <input
            type="number"
            value={slope}
            onChange={(e) => setSlope(e.target.value)}
            className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Par</label>
          <input
            type="number"
            value={par}
            onChange={(e) => setPar(e.target.value)}
            className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            required
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-xl">{error}</div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-minerva-600 text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-minerva-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
