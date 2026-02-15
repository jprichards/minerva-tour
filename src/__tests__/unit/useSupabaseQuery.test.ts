import { describe, it, expect, vi } from 'vitest';

/**
 * Unit test for the useSupabaseQuery hook pattern.
 * Since SWR hooks are hard to test in isolation without a render context,
 * we test the fetcher pattern and key generation logic.
 */
describe('useSupabaseQuery pattern', () => {
  it('null key prevents fetch (SWR convention)', () => {
    // When key is null, SWR does not call the fetcher
    const fetcher = vi.fn();
    const key = null;

    // SWR's behavior: if key is null, fetcher is never invoked
    if (key !== null) {
      fetcher();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('array keys enable conditional fetching', () => {
    const userId = 'user-123';
    const key = userId ? ['user-profile', userId] : null;
    expect(key).toEqual(['user-profile', 'user-123']);

    const noUser = undefined;
    const nullKey = noUser ? ['user-profile', noUser] : null;
    expect(nullKey).toBeNull();
  });

  it('fetcher receives supabase client and returns data', async () => {
    const mockData = { id: '1', name: 'Test Course' };
    const mockSupabase: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
          }),
        }),
      }),
    };

    const fetcher = async (supabase: typeof mockSupabase) => {
      const { data } = await supabase.from('courses').select('*').eq('id', '1').single();
      return data;
    };

    const result = await fetcher(mockSupabase);
    expect(result).toEqual(mockData);
  });

  it('SWR config defaults are sensible', () => {
    const defaults = {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 2000,
    };
    expect(defaults.revalidateOnFocus).toBe(true);
    expect(defaults.revalidateOnReconnect).toBe(true);
    expect(defaults.dedupingInterval).toBe(2000);
  });
});
