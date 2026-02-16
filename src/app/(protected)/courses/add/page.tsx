'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logAuditEvent } from '@/lib/audit';
import { useToast } from '@/components/ui/Toast';
import { useUser } from '@/lib/hooks/useUser';
import { ArrowLeft, ExternalLink, AlertCircle } from 'lucide-react';
import Link from 'next/link';

const courseTypes = [
  { value: '18_holes', label: '18 Holes' },
  { value: '9_holes', label: '9 Holes' },
  { value: 'front_9', label: 'Front 9' },
  { value: 'back_9', label: 'Back 9' },
];

export default function AddCoursePage() {
  return (
    <Suspense fallback={<div className="p-4"><div className="h-6 bg-[var(--bg-skeleton)] rounded animate-pulse w-32" /></div>}>
      <AddCourseContent />
    </Suspense>
  );
}

function AddCourseContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledName = searchParams.get('course_name') || '';
  const lockName = searchParams.get('lock_name') === 'true';
  const { isPlayingGuest } = useUser();

  // Playing guests cannot add courses
  if (isPlayingGuest) {
    return (
      <div className="p-4 text-center py-16">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Restricted</h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">Playing guests cannot add courses.</p>
        <button onClick={() => router.back()} className="mt-4 text-minerva-600 text-sm font-medium">Go back</button>
      </div>
    );
  }

  const [courseName, setCourseName] = useState(prefilledName);
  const [teeName, setTeeName] = useState('');
  const [type, setType] = useState('18_holes');
  const [rating, setRating] = useState('');
  const [slope, setSlope] = useState('');
  const [par, setPar] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { showToast } = useToast();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const ratingNum = parseFloat(rating);
    const slopeNum = parseInt(slope);
    const parNum = parseInt(par);

    if (!courseName || !teeName || isNaN(ratingNum) || isNaN(slopeNum) || isNaN(parNum)) {
      setError('Please fill in all fields with valid values.');
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error: insertError } = await supabase
      .from('courses')
      .insert({
        course_name: courseName.trim(),
        tee_name: teeName.trim(),
        type,
        rating: ratingNum,
        slope: slopeNum,
        par: parNum,
        created_by: user?.id,
        updated_by: user?.id,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        setError('This exact course/tee combination already exists.');
      } else {
        setError(insertError.message);
      }
      setLoading(false);
      return;
    }

    await logAuditEvent('course_add', 'course', data.id, {
      course_name: courseName,
      tee_name: teeName,
      type,
      rating: ratingNum,
      slope: slopeNum,
      par: parNum,
    });

    showToast('Course added successfully!');
    router.push(`/courses/${data.id}`);
  };

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          {lockName ? 'Add Another Tee' : 'Add Course'}
        </h1>
      </div>

      {/* USGA Link */}
      <a
        href="https://ncrdb.usga.org"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 bg-blue-50 text-blue-700 text-sm rounded-xl p-3 mb-5"
      >
        <ExternalLink className="w-4 h-4" />
        Look up course data on USGA NCRDB
      </a>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Course Name */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Course Name</label>
          <input
            type="text"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            readOnly={lockName}
            placeholder="e.g. Pebble Beach Golf Links"
            className={`w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500 ${
              lockName ? 'bg-[var(--bg-subtle)] text-[var(--text-muted)]' : ''
            }`}
            required
          />
        </div>

        {/* Tee Name */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Tee Name</label>
          <input
            type="text"
            value={teeName}
            onChange={(e) => setTeeName(e.target.value)}
            placeholder="e.g. Blue, White, Gold"
            className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            required
          />
        </div>

        {/* Type */}
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

        {/* Rating */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Course Rating</label>
          <input
            type="number"
            step="0.1"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            placeholder="e.g. 72.3"
            className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            required
          />
        </div>

        {/* Slope */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Slope Rating</label>
          <input
            type="number"
            value={slope}
            onChange={(e) => setSlope(e.target.value)}
            placeholder="e.g. 135"
            className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            required
          />
        </div>

        {/* Par */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Par</label>
          <input
            type="number"
            value={par}
            onChange={(e) => setPar(e.target.value)}
            placeholder="e.g. 72"
            className="w-full rounded-xl border bg-[var(--input-bg)] border-[var(--input-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            required
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-xl">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-minerva-600 text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-minerva-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Course'}
        </button>
      </form>

      {/* Note about duplicates */}
      <p className="text-xs text-[var(--text-faint)] mt-4 text-center">
        Courses with identical name, tee, type, rating, slope, and par will be blocked as duplicates.
        Slight variants (e.g. different rating) are allowed.
      </p>
    </div>
  );
}
