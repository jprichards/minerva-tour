'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { Plus, Search, MapPin, ChevronRight } from 'lucide-react';
import { fetchAllCourses } from '@/lib/courses';
import type { Course } from '@/types/database';

export default function CoursesPage() {
  const [search, setSearch] = useState('');
  const { isMember } = useUser();
  const supabase = createClient();

  const { data: courses = [], isLoading: loading } = useSWR(
    'courses',
    () => fetchAllCourses(supabase),
    { revalidateOnFocus: true, dedupingInterval: 5000 }
  );

  // Group courses by name and filter by search
  const groupedCourses = useMemo(() => {
    const filtered = courses.filter(
      (c) =>
        c.course_name.toLowerCase().includes(search.toLowerCase()) ||
        c.tee_name.toLowerCase().includes(search.toLowerCase())
    );

    const groups: Record<string, Course[]> = {};
    for (const course of filtered) {
      if (!groups[course.course_name]) {
        groups[course.course_name] = [];
      }
      groups[course.course_name].push(course);
    }
    return groups;
  }, [courses, search]);

  const courseNames = Object.keys(groupedCourses).sort();

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Courses</h1>
        {isMember && (
          <Link
            href="/courses/add"
            className="flex items-center gap-1.5 bg-minerva-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-minerva-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Course
          </Link>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
        <input
          type="text"
          placeholder="Search courses or tees..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500 focus:border-transparent"
        />
      </div>

      {/* USGA Link */}
      <a
        href="https://ncrdb.usga.org"
        target="_blank"
        rel="noopener noreferrer"
        className="block text-xs text-minerva-600 hover:underline"
      >
        Look up course data on USGA NCRDB &rarr;
      </a>

      {/* Course List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : courseNames.length === 0 ? (
        <div className="text-center py-12">
          <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-[var(--text-muted)] text-sm">No courses found.</p>
          {isMember && (
            <Link href="/courses/add" className="text-minerva-600 text-sm font-medium mt-2 inline-block">
              Add the first course
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {courseNames.map((name) => {
            const tees = groupedCourses[name];
            return (
              <div key={name} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden">
                <div className="p-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-minerva-600 flex-shrink-0" />
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] flex-1">{name}</h3>
                    <span className="text-xs text-[var(--text-faint)]">{tees.length} tee{tees.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="border-t border-[var(--border-light)]">
                  {tees.map((course) => (
                    <Link
                      key={course.id}
                      href={`/courses/${course.id}`}
                      className="flex items-center justify-between px-3 py-2.5 hover:bg-[var(--bg-page)] transition-colors border-b border-[var(--border-light)] last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[var(--bg-subtle)] rounded-lg flex items-center justify-center">
                          <span className="text-xs font-bold text-[var(--text-muted)]">
                            {course.type === '18_holes' ? '18' : '9'}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">{course.tee_name}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {course.type.replace(/_/g, ' ')} &middot; Par {course.par} &middot;
                            Rating {course.rating} / Slope {course.slope}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--text-faint)]" />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
