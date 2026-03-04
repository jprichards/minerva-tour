import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { SessionPersistence } from '@/components/SessionPersistence';
import { mockSupabaseClient } from '../setup';

vi.mock('@/lib/session-persistence', () => ({
  backupSession: vi.fn(),
  clearSessionBackup: vi.fn(),
}));

import { backupSession, clearSessionBackup } from '@/lib/session-persistence';

describe('SessionPersistence', () => {
  let authChangeCallback: (event: string, session: unknown) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.auth.onAuthStateChange.mockReturnValue({
      data: {
        subscription: { unsubscribe: vi.fn() },
      },
    });
  });

  function captureAuthChangeCallback() {
    render(<SessionPersistence />);
    authChangeCallback = mockSupabaseClient.auth.onAuthStateChange.mock.calls[0][0];
  }

  it('subscribes to auth state changes on mount', () => {
    render(<SessionPersistence />);
    expect(mockSupabaseClient.auth.onAuthStateChange).toHaveBeenCalledOnce();
  });

  it('backs up session when tokens are present', () => {
    captureAuthChangeCallback();

    authChangeCallback('SIGNED_IN', {
      access_token: 'at-123',
      refresh_token: 'rt-456',
      user: { id: 'u1' },
    });

    expect(backupSession).toHaveBeenCalledWith('at-123', 'rt-456');
  });

  it('backs up session on TOKEN_REFRESHED', () => {
    captureAuthChangeCallback();

    authChangeCallback('TOKEN_REFRESHED', {
      access_token: 'at-new',
      refresh_token: 'rt-new',
      user: { id: 'u1' },
    });

    expect(backupSession).toHaveBeenCalledWith('at-new', 'rt-new');
  });

  it('clears backup on SIGNED_OUT', () => {
    captureAuthChangeCallback();

    authChangeCallback('SIGNED_OUT', null);

    expect(clearSessionBackup).toHaveBeenCalledOnce();
  });

  it('does not backup when session has no tokens', () => {
    captureAuthChangeCallback();

    authChangeCallback('SIGNED_IN', { user: { id: 'u1' } });

    expect(backupSession).not.toHaveBeenCalled();
  });

  it('unsubscribes on unmount', () => {
    const unsubscribe = vi.fn();
    mockSupabaseClient.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe } },
    });

    const { unmount } = render(<SessionPersistence />);
    unmount();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
