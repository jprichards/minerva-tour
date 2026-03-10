import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'user-1', full_name: 'Test User', email: 'test@test.com', role: 'member' },
    isMember: true,
    isAdmin: false,
    loading: false,
  }),
}));

vi.mock('@/lib/courses', async () => {
  const actual = await vi.importActual<typeof import('@/lib/courses')>('@/lib/courses');
  return {
    ...actual,
    fetchAllCourses: vi.fn().mockResolvedValue([
    { id: '1', course_name: 'Augusta Municipal Golf Course', tee_name: 'White', type: 'front_9', par: 37, rating: 34.7, slope: 123 },
    { id: '2', course_name: 'Augusta Municipal Golf Course', tee_name: 'Blue (Back 9)', type: 'back_9', par: 34, rating: 32.6, slope: 113 },
    { id: '3', course_name: 'Augusta Municipal Golf Course ', tee_name: 'Blue (Front 9)', type: 'front_9', par: 37, rating: 35.1, slope: 125 },
    { id: '4', course_name: 'Augusta Municipal Golf Course ', tee_name: 'White', type: 'back_9', par: 34, rating: 32.3, slope: 111 },
    { id: '5', course_name: 'Augusta Municipal Golf Course ', tee_name: 'Blue', type: 'front_9', par: 37, rating: 35.1, slope: 125 },
    { id: '6', course_name: 'Augusta Municipal Golf Course ', tee_name: 'Blue', type: 'back_9', par: 34, rating: 32.6, slope: 113 },
  ]),
  };
});

import '../setup';
import CoursesPage from '@/app/(protected)/courses/page';

describe('CoursesPage - course grouping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups courses with trailing-space name differences under one heading', async () => {
    render(<CoursesPage />);

    await waitFor(() => {
      expect(screen.getByText('6 tees')).toBeInTheDocument();
    });

    const headings = screen.getAllByText('Augusta Municipal Golf Course');
    expect(headings).toHaveLength(1);
  });
});
