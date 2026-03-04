import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { mockSupabaseClient } from '../setup';

vi.mock('@/lib/session-persistence', () => ({
  getSessionBackup: vi.fn().mockReturnValue(null),
  clearSessionBackup: vi.fn(),
}));

import LoginPage from '@/app/(auth)/login/page';

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  async function renderAndWaitForForm() {
    render(<LoginPage />);
    await waitFor(() => {
      expect(screen.getByText('Welcome back')).toBeInTheDocument();
    });
  }

  it('renders the app name and owl logo', async () => {
    await renderAndWaitForForm();
    expect(screen.getByText('Minerva Tour')).toBeInTheDocument();
    expect(screen.getByAltText('Minerva Tour')).toBeInTheDocument();
  });

  it('renders welcome message', async () => {
    await renderAndWaitForForm();
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
  });

  it('renders Google sign-in button', async () => {
    await renderAndWaitForForm();
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
  });

  it('renders magic link form', async () => {
    await renderAndWaitForForm();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByText('Send magic link')).toBeInTheDocument();
  });

  it('renders guest link', async () => {
    await renderAndWaitForForm();
    expect(screen.getByText('guest')).toBeInTheDocument();
    const guestLink = screen.getByText('guest');
    expect(guestLink).toHaveAttribute('href', '/view');
  });

  it('calls Google OAuth on button click', async () => {
    mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({ error: null });
    await renderAndWaitForForm();

    fireEvent.click(screen.getByText('Sign in with Google'));
    expect(mockSupabaseClient.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: expect.stringContaining('/auth/callback'),
      },
    });
  });

  it('shows error on Google OAuth failure', async () => {
    mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
      error: { message: 'OAuth error' },
    });

    await renderAndWaitForForm();
    fireEvent.click(screen.getByText('Sign in with Google'));

    const errorMsg = await screen.findByText('OAuth error');
    expect(errorMsg).toBeInTheDocument();
  });

  it('sends magic link on form submission', async () => {
    mockSupabaseClient.auth.signInWithOtp.mockResolvedValue({ error: null });

    await renderAndWaitForForm();

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });

    fireEvent.click(screen.getByText('Send magic link'));

    const successMsg = await screen.findByText('Check your email for a sign-in link!');
    expect(successMsg).toBeInTheDocument();
  });

  it('shows error on magic link failure', async () => {
    mockSupabaseClient.auth.signInWithOtp.mockResolvedValue({
      error: { message: 'Rate limit exceeded' },
    });

    await renderAndWaitForForm();

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });

    fireEvent.click(screen.getByText('Send magic link'));

    const errorMsg = await screen.findByText('Rate limit exceeded');
    expect(errorMsg).toBeInTheDocument();
  });

  it('disables buttons while loading', async () => {
    await renderAndWaitForForm();
    const googleBtn = screen.getByText('Sign in with Google');
    const magicBtn = screen.getByText('Send magic link');

    expect(googleBtn).not.toBeDisabled();
    expect(magicBtn).not.toBeDisabled();
  });
});
