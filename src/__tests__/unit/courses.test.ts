import { describe, it, expect, vi } from 'vitest';
import { fetchAllCourses } from '@/lib/courses';

function createMockSupabase(pages: Record<string, unknown>[][]) {
  let callIndex = 0;
  const mockRange = vi.fn().mockImplementation(() => {
    const data = callIndex < pages.length ? pages[callIndex] : [];
    callIndex++;
    return Promise.resolve({ data, error: null });
  });

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          range: mockRange,
        }),
      }),
    }),
    mockRange,
  };
}

describe('fetchAllCourses', () => {
  it('returns all courses from a single page', async () => {
    const courses = [
      { id: '1', course_name: 'Alpha Course', tee_name: 'Blue', type: '18_holes' },
      { id: '2', course_name: 'Beta Course', tee_name: 'White', type: '18_holes' },
    ];
    const { from, mockRange } = createMockSupabase([courses]);
    const supabase = { from } as never;

    const result = await fetchAllCourses(supabase);

    expect(result).toHaveLength(2);
    expect(result[0].course_name).toBe('Alpha Course');
    expect(result[1].course_name).toBe('Beta Course');
    expect(mockRange).toHaveBeenCalledWith(0, 999);
  });

  it('paginates when first page returns exactly PAGE_SIZE rows', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      id: `${i}`,
      course_name: `Course ${String(i).padStart(4, '0')}`,
      tee_name: 'Blue',
      type: '18_holes',
    }));
    const page2 = [
      { id: '1000', course_name: 'Tree Farm', tee_name: 'Middle', type: '18_holes' },
    ];

    const { from, mockRange } = createMockSupabase([page1, page2]);
    const supabase = { from } as never;

    const result = await fetchAllCourses(supabase);

    expect(result).toHaveLength(1001);
    expect(result[1000].course_name).toBe('Tree Farm');
    expect(mockRange).toHaveBeenCalledTimes(2);
    expect(mockRange).toHaveBeenNthCalledWith(1, 0, 999);
    expect(mockRange).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it('returns empty array on error', async () => {
    const mockRange = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            range: mockRange,
          }),
        }),
      }),
    } as never;

    const result = await fetchAllCourses(supabase);

    expect(result).toHaveLength(0);
  });

  it('returns empty array when no courses exist', async () => {
    const { from } = createMockSupabase([[]]);
    const supabase = { from } as never;

    const result = await fetchAllCourses(supabase);

    expect(result).toHaveLength(0);
  });

  it('handles three pages of results', async () => {
    const makePage = (start: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `${start + i}`,
        course_name: `Course ${start + i}`,
        tee_name: 'Blue',
        type: '18_holes',
      }));

    const { from, mockRange } = createMockSupabase([
      makePage(0, 1000),
      makePage(1000, 1000),
      makePage(2000, 500),
    ]);
    const supabase = { from } as never;

    const result = await fetchAllCourses(supabase);

    expect(result).toHaveLength(2500);
    expect(mockRange).toHaveBeenCalledTimes(3);
  });
});
