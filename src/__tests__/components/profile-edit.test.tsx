import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockPush = vi.fn();
const mockBack = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: {
      id: 'user-1',
      full_name: 'Test User',
      email: 'test@example.com',
      handicap_index: 12.4,
      ghin_number: '1234567',
      role: 'member',
    },
    loading: false,
  }),
}));

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));

const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: mockUpdate,
    }),
  }),
}));

import EditProfilePage from '@/app/(protected)/profile/edit/page';

describe('Profile Edit Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays handicap as non-editable text (not an input)', async () => {
    render(<EditProfilePage />);
    await waitFor(() => {
      expect(screen.getByText('12.4')).toBeInTheDocument();
    });

    const handicapInputs = document.querySelectorAll('input[type="number"]');
    const handicapTextInputs = Array.from(document.querySelectorAll('input')).filter(
      (input) => input.value === '12.4'
    );
    expect(handicapInputs.length).toBe(0);
    expect(handicapTextInputs.length).toBe(0);
  });

  it('shows "Handicap is managed by administrators" message', async () => {
    render(<EditProfilePage />);
    await waitFor(() => {
      expect(screen.getByText('Handicap is managed by administrators.')).toBeInTheDocument();
    });
  });

  it('does not include handicap_index in the update payload on save', async () => {
    render(<EditProfilePage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test User')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: /save profile/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    const updatePayload = mockUpdate.mock.calls[0][0];
    expect(updatePayload).not.toHaveProperty('handicap_index');
    expect(updatePayload).toHaveProperty('full_name');
    expect(updatePayload).toHaveProperty('ghin_number');
  });

  it('displays email as non-editable text (not an input)', async () => {
    render(<EditProfilePage />);
    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    const emailInputs = Array.from(document.querySelectorAll('input')).filter(
      (input) => input.value === 'test@example.com'
    );
    expect(emailInputs.length).toBe(0);
  });
});
