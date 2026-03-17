import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminSettingsPage from '@/app/(protected)/admin/settings/page';
import { mockSupabaseClient } from '../setup';
import * as auditModule from '@/lib/audit';

// Mock useUser to return admin
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

describe('AdminSettingsPage - Slack Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fetch for Slack API calls
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ channels: [], ok: true }),
    });

    // Default: return empty for all settings queries
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it('renders the Slack Integration section', async () => {
    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Slack Integration')).toBeInTheDocument();
    });
  });

  it('shows "Not configured" status when no Slack config exists', async () => {
    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Not configured')).toBeInTheDocument();
    });
  });

  it('renders bot token input with password masking', async () => {
    render(<AdminSettingsPage />);

    await waitFor(() => {
      const tokenInput = screen.getByPlaceholderText('xoxb-...');
      expect(tokenInput).toBeInTheDocument();
      expect(tokenInput).toHaveAttribute('type', 'password');
    });
  });

  it('toggles token visibility', async () => {
    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('xoxb-...')).toBeInTheDocument();
    });

    const tokenInput = screen.getByPlaceholderText('xoxb-...');
    expect(tokenInput).toHaveAttribute('type', 'password');

    // Click the show/hide button (eye icon)
    const toggleButtons = screen.getAllByRole('button');
    const eyeButton = toggleButtons.find((btn) =>
      btn.closest('.relative')?.querySelector('input[placeholder="xoxb-..."]')
    );
    if (eyeButton) {
      fireEvent.click(eyeButton);
      expect(tokenInput).toHaveAttribute('type', 'text');
    }
  });

  it('renders all 6 event toggle switches (5 score + 1 feedback)', async () => {
    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('New Tee Times')).toBeInTheDocument();
    });

    expect(screen.getByText('In-Progress Scores')).toBeInTheDocument();
    expect(screen.getByText('Completed Rounds')).toBeInTheDocument();
    expect(screen.getByText('Score Edits')).toBeInTheDocument();
    expect(screen.getByText('Retroactive Scores')).toBeInTheDocument();
    expect(screen.getByText('Feedback Submissions')).toBeInTheDocument();
  });

  it('renders event toggles as switches with correct initial state (all on)', async () => {
    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('New Tee Times')).toBeInTheDocument();
    });

    const switches = screen.getAllByRole('switch');
    // 5 score event toggles + 1 feedback toggle + 1 recap images toggle = 7
    expect(switches.length).toBe(7);
    // First 6 are notification event toggles (default on), last is recap images (default off)
    switches.slice(0, 6).forEach((sw) => {
      expect(sw.getAttribute('aria-checked')).toBe('true');
    });
    expect(switches[6].getAttribute('aria-checked')).toBe('false');
  });

  it('toggles an event switch off and on', async () => {
    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('New Tee Times')).toBeInTheDocument();
    });

    const switches = screen.getAllByRole('switch');
    const teeTimeSwitch = switches[0];

    expect(teeTimeSwitch.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(teeTimeSwitch);
    expect(teeTimeSwitch.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(teeTimeSwitch);
    expect(teeTimeSwitch.getAttribute('aria-checked')).toBe('true');
  });

  it('renders feedback notifications section with its own toggle', async () => {
    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Feedback Notifications')).toBeInTheDocument();
    });

    expect(screen.getByText('Feedback Submissions')).toBeInTheDocument();
  });

  it('renders Load Channels button', async () => {
    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Load Channels')).toBeInTheDocument();
    });
  });

  it('shows Send Test Message button when token and channel are set', async () => {
    // Mock config with existing token and channel
    const fromMock = vi.fn();
    let callCount = 0;
    const singleImpl = () => {
      callCount++;
      if (callCount === 3) {
        return Promise.resolve({
          data: {
            value: {
              bot_token: 'xoxb-test-token',
              channel_id: 'C123',
              channel_name: '#test-channel',
              events: {
                tee_time: true,
                score_in_progress: true,
                round_complete: true,
                score_edit: false,
                retroactive: true,
              },
            },
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    };
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(singleImpl),
      maybeSingle: vi.fn().mockImplementation(singleImpl),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
    mockSupabaseClient.from.mockImplementation(fromMock);

    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Send Test Message')).toBeInTheDocument();
    });
  });

  it('shows Connected status when Slack config has token and channel', async () => {
    const fromMock = vi.fn();
    let callCount = 0;
    const singleImpl = () => {
      callCount++;
      if (callCount === 3) {
        return Promise.resolve({
          data: {
            value: {
              bot_token: 'xoxb-test',
              channel_id: 'C001',
              channel_name: '#general',
              events: {
                tee_time: true,
                score_in_progress: true,
                round_complete: true,
                score_edit: true,
                retroactive: true,
              },
            },
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    };
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(singleImpl),
      maybeSingle: vi.fn().mockImplementation(singleImpl),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
    mockSupabaseClient.from.mockImplementation(fromMock);

    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });

  it('has a link to the Slack API apps page', async () => {
    render(<AdminSettingsPage />);

    await waitFor(() => {
      const link = screen.getByText('api.slack.com/apps');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://api.slack.com/apps');
      expect(link).toHaveAttribute('target', '_blank');
    });
  });

  it('audit log includes all 3 Slack channel configs and AI recap settings on save', async () => {
    const logAuditEvent = vi.mocked(auditModule.logAuditEvent);

    render(<AdminSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Slack Integration')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: /save settings/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(logAuditEvent).toHaveBeenCalledWith(
        'update_settings',
        'app_settings',
        undefined,
        expect.objectContaining({
          slack_channel_name: expect.toSatisfy((v: unknown) => v !== undefined),
          slack_channel_id: expect.toSatisfy((v: unknown) => v !== undefined),
          slack_events: expect.toSatisfy((v: unknown) => v !== undefined),
          feedback_channel_name: expect.toSatisfy((v: unknown) => v !== undefined),
          feedback_channel_id: expect.toSatisfy((v: unknown) => v !== undefined),
          recap_channel_name: expect.toSatisfy((v: unknown) => v !== undefined),
          recap_channel_id: expect.toSatisfy((v: unknown) => v !== undefined),
          recap_images_in_thread: expect.toSatisfy((v: unknown) => v !== undefined),
          ai_model: expect.toSatisfy((v: unknown) => v !== undefined),
          ai_endpoint: expect.toSatisfy((v: unknown) => v !== undefined),
          ai_max_tokens: expect.toSatisfy((v: unknown) => v !== undefined),
          ai_system_prompt: expect.toSatisfy((v: unknown) => v !== undefined),
        })
      );
    });
  });
});
