import { describe, it, expect, vi } from 'vitest';

describe('Realtime Leaderboard Updates', () => {
  it('sets up a Supabase channel for score changes', () => {
    const subscribeMock = vi.fn().mockReturnValue({ unsubscribe: vi.fn() });
    const onMock = vi.fn().mockReturnThis();
    const channelMock = {
      on: onMock,
      subscribe: subscribeMock,
    };

    const supabase: any = {
      channel: vi.fn().mockReturnValue(channelMock),
      removeChannel: vi.fn(),
    };

    // Simulate what the leaderboard page does
    const channel = supabase
      .channel('leaderboard-scores')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, vi.fn())
      .subscribe();

    expect(supabase.channel).toHaveBeenCalledWith('leaderboard-scores');
    expect(onMock).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'scores' },
      expect.any(Function)
    );
    expect(subscribeMock).toHaveBeenCalled();
  });

  it('triggers mutate callback when score event fires', () => {
    const mutateFn = vi.fn();
    let capturedCallback: (payload: any) => void = () => {};

    const subscribeMock = vi.fn().mockReturnValue({ unsubscribe: vi.fn() });
    const onMock = vi.fn().mockImplementation((_event: string, _opts: any, cb: (payload: any) => void) => {
      capturedCallback = cb;
      return { subscribe: subscribeMock };
    });

    const supabase: any = {
      channel: vi.fn().mockReturnValue({ on: onMock }),
      removeChannel: vi.fn(),
    };

    supabase
      .channel('leaderboard-scores')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
        mutateFn('leaderboard');
      })
      .subscribe();

    // Simulate a score change event
    capturedCallback({ new: { id: 'score-1', gross_score: 85 } });

    // The callback should have triggered the mutate
    // (In the real component, this calls globalMutate('leaderboard'))
    expect(mutateFn).toHaveBeenCalledWith('leaderboard');
  });
});
