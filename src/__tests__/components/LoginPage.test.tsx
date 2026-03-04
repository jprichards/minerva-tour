import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import LoginPage from '@/app/(auth)/login/page';
import { mockSupabaseClient } from '../setup';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/session-persistence', () => ({
  getSessionBackup: vi.fn(),
  clearSessionBackup: vi.fn(),
}));

import { getSessionBackup, clearSessionBackup } from '@/lib/session-persistence';

describe('LoginPage session recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    (getSessionBackup as ReturnType<typeof vi.fn>).mockReturnValue(null);
    mockSupabaseClient.auth.setSession = vi.fn().mockResolvedValue({ error: null });
  });

  it('shows login form when no backup exists and no active session', async () => {
    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText('Welcome back')).toBeInTheDocument();
    });
  });

  it('redirects to /home when user already has a valid session', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'test@example.com' } },
      error: null,
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
  });

  it('recovers session from localStorage backup and redirects', async () => {
    (getSessionBackup as ReturnType<typeof vi.fn>).mockReturnValue({
      access_token: 'at-backup',
      refresh_token: 'rt-backup',
    });
    mockSupabaseClient.auth.setSession.mockResolvedValue({
      data: { session: { access_token: 'at-new' } },
      error: null,
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockSupabaseClient.auth.setSession).toHaveBeenCalledWith({
        access_token: 'at-backup',
        refresh_token: 'rt-backup',
      });
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
  });

  it('clears backup and shows login form when recovery fails', async () => {
    (getSessionBackup as ReturnType<typeof vi.fn>).mockReturnValue({
      access_token: 'at-expired',
      refresh_token: 'rt-expired',
    });
    mockSupabaseClient.auth.setSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Token expired' },
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(clearSessionBackup).toHaveBeenCalled();
      expect(screen.getByText('Welcome back')).toBeInTheDocument();
    });
  });

  it('shows recovery loading state before login form', () => {
    (getSessionBackup as ReturnType<typeof vi.fn>).mockReturnValue({
      access_token: 'at',
      refresh_token: 'rt',
    });
    // Never resolves - simulates slow network
    mockSupabaseClient.auth.getUser.mockReturnValue(new Promise(() => {}));

    render(<LoginPage />);

    expect(screen.queryByText('Welcome back')).not.toBeInTheDocument();
    expect(screen.getByAltText('Minerva Tour')).toBeInTheDocument();
  });
});
