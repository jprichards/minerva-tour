import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminSettingsPage from '@/app/(protected)/admin/settings/page';
import { mockSupabaseClient } from '../setup';

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'admin-1', full_name: 'Admin User', email: 'admin@test.com', role: 'admin' },
    isAdmin: true,
    loading: false,
    isPlayingGuest: false,
  }),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

describe('AdminSettingsPage - Chirps Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ channels: [], ok: true }),
    });

    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it('AI Recap Configuration section is collapsed by default', async () => {
    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('AI Recap Configuration')).toBeInTheDocument();
    });

    expect(screen.queryByPlaceholderText('https://api.x.ai/v1/chat/completions')).not.toBeInTheDocument();
  });

  it('AI Recap Configuration section is expandable', async () => {
    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('AI Recap Configuration')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('AI Recap Configuration'));

    await waitFor(() => {
      const endpoints = screen.getAllByPlaceholderText('https://api.x.ai/v1/chat/completions');
      expect(endpoints.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('Chirps AI Configuration section is collapsed by default', async () => {
    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Chirps AI Configuration')).toBeInTheDocument();
    });

    expect(screen.queryByPlaceholderText('grok-3-mini')).not.toBeInTheDocument();
  });

  it('Chirps AI Configuration section is expandable', async () => {
    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Chirps AI Configuration')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Chirps AI Configuration'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('grok-3-mini')).toBeInTheDocument();
    });
  });

  it('shows "Configured" badge when AI endpoint and key are set', async () => {
    let callCount = 0;
    const singleImpl = () => {
      callCount++;
      if (callCount === 4) {
        return Promise.resolve({
          data: {
            value: {
              api_endpoint: 'https://api.x.ai/v1/chat/completions',
              api_key: 'xai-test-key',
              model: 'grok-3',
              system_prompt: '',
              max_tokens: 700,
            },
          },
          error: null,
        });
      }
      if (callCount === 5) {
        return Promise.resolve({
          data: {
            value: {
              api_endpoint: 'https://api.x.ai/v1/chat/completions',
              api_key: 'xai-chirp-key',
              model: 'grok-3-mini',
              system_prompt: '',
              max_tokens: 1000,
            },
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    };

    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockImplementation(singleImpl),
      maybeSingle: vi.fn().mockImplementation(singleImpl),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });

    render(<AdminSettingsPage />);

    await waitFor(() => {
      const configuredBadges = screen.getAllByText('Configured');
      expect(configuredBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('Chirps Fire On radio buttons exist', async () => {
    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Chirps Fire On')).toBeInTheDocument();
    });

    expect(screen.getByText('Round complete only')).toBeInTheDocument();
    expect(screen.getByText('Every score update')).toBeInTheDocument();
  });

  it('default trigger is "round_complete"', async () => {
    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Chirps Fire On')).toBeInTheDocument();
    });

    const radios = screen.getAllByRole('radio');
    const roundCompleteRadio = radios.find((r) =>
      r.closest('label')?.textContent?.includes('Round complete only')
    );
    const allUpdatesRadio = radios.find((r) =>
      r.closest('label')?.textContent?.includes('Every score update')
    );

    expect(roundCompleteRadio).toBeChecked();
    expect(allUpdatesRadio).not.toBeChecked();
  });

  it('can switch chirp trigger to "all_score_updates"', async () => {
    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Chirps Fire On')).toBeInTheDocument();
    });

    const radios = screen.getAllByRole('radio');
    const allUpdatesRadio = radios.find((r) =>
      r.closest('label')?.textContent?.includes('Every score update')
    );

    if (allUpdatesRadio) {
      fireEvent.click(allUpdatesRadio);
      expect(allUpdatesRadio).toBeChecked();
    }
  });
});
