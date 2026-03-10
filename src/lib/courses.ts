import type { SupabaseClient } from '@supabase/supabase-js';
import type { Course, CourseType } from '@/types/database';

/** Format a course type enum for display: "front_9" → "Front 9", "18_holes" → "18 Holes" */
export function formatCourseType(type: CourseType | string): string {
  return type.replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

const PAGE_SIZE = 1000;

/**
 * Fetch all courses from Supabase with pagination.
 * Supabase/PostgREST returns at most 1000 rows per request by default.
 * Without pagination, courses late in the alphabet (e.g. "Tree Farm")
 * can be silently truncated.
 */
export async function fetchAllCourses(supabase: SupabaseClient): Promise<Course[]> {
  const allCourses: Course[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .order('course_name')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('Error fetching courses:', error);
      break;
    }
    if (!data || data.length === 0) break;
    allCourses.push(...(data as Course[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allCourses;
}
