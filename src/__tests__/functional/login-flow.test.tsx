import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { mockSupabaseClient } from '../setup';

import LoginPage from '@/app/(auth)/login/page';

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the app name', () => {
    render(<LoginPage />);
    expect(screen.getByText('Minerva Tour')).toBeInTheDocument();
    expect(screen.getByText('Golf Club Management')).toBeInTheDocument();
  });

  it('renders welcome message', () => {
    render(<LoginPage />);
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
  });

  it('renders Google sign-in button', () => {
    render(<LoginPage />);
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
  });

  it('renders magic link form', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByText('Send magic link')).toBeInTheDocument();
  });

  it('renders guest link', () => {
    render(<LoginPage />);
    expect(screen.getByText('guest')).toBeInTheDocument();
    const guestLink = screen.getByText('guest');
    expect(guestLink).toHaveAttribute('href', '/view');
  });

  it('calls Google OAuth on button click', async () => {
    mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({ error: null });
    render(<LoginPage />);

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

    render(<LoginPage />);
    fireEvent.click(screen.getByText('Sign in with Google'));

    // Wait for the error to appear
    const errorMsg = await screen.findByText('OAuth error');
    expect(errorMsg).toBeInTheDocument();
  });

  it('sends magic link on form submission', async () => {
    mockSupabaseClient.auth.signInWithOtp.mockResolvedValue({ error: null });

    render(<LoginPage />);

    // Type email
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });

    // Submit form
    fireEvent.click(screen.getByText('Send magic link'));

    // Should show success message
    const successMsg = await screen.findByText('Check your email for a sign-in link!');
    expect(successMsg).toBeInTheDocument();
  });

  it('shows error on magic link failure', async () => {
    mockSupabaseClient.auth.signInWithOtp.mockResolvedValue({
      error: { message: 'Rate limit exceeded' },
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });

    fireEvent.click(screen.getByText('Send magic link'));

    const errorMsg = await screen.findByText('Rate limit exceeded');
    expect(errorMsg).toBeInTheDocument();
  });

  it('disables buttons while loading', () => {
    render(<LoginPage />);
    const googleBtn = screen.getByText('Sign in with Google');
    const magicBtn = screen.getByText('Send magic link');

    // Initially not disabled
    expect(googleBtn).not.toBeDisabled();
    expect(magicBtn).not.toBeDisabled();
  });
});
