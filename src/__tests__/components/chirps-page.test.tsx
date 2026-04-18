import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { mockSupabaseClient } from '../setup';

const mockUseFeatureFlag = vi.fn().mockReturnValue({ enabled: false, loading: false });

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    isAuthenticated: true,
    loading: false,
    profile: { id: 'user-1', role: 'member', full_name: 'Test User' },
    isAdmin: false,
  }),
}));

vi.mock('@/lib/hooks/useFeatureFlag', () => ({
  useFeatureFlag: (...args: unknown[]) => mockUseFeatureFlag(...args),
}));

vi.mock('@/lib/hooks/useChirpBucketConfig', () => ({
  useChirpBucketConfig: () => ({
    ranges: [
      { bucket: 'legendary', maxNet: -5 },
      { bucket: 'excellent', maxNet: -1 },
      { bucket: 'neutral', maxNet: 1 },
      { bucket: 'mediocre', maxNet: 4 },
      { bucket: 'rough', maxNet: 8 },
      { bucket: 'bad', maxNet: null },
    ],
    isLoading: false,
    save: vi.fn(),
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));

import ChirpsPage from '@/app/(protected)/chirps/page';

function createMockChain(resolvedData: unknown = [], error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: resolvedData, error }),
    then: vi.fn((resolve: (v: unknown) => void) => resolve({ data: resolvedData, error })),
  };
  return chain;
}

const sampleChirpsLegacy = [
  { id: '1', bucket: 'legendary', template: 'Wow, $first_name is amazing!', created_by: null, created_at: '2025-01-01', queue_position: null, source: 'manual', archived_at: null },
  { id: '2', bucket: 'legendary', template: '$first_name is on fire!', created_by: null, created_at: '2025-01-02', queue_position: null, source: 'manual', archived_at: null },
  { id: '3', bucket: 'bad', template: '$first_name should quit.', created_by: null, created_at: '2025-01-01', queue_position: null, source: 'manual', archived_at: null },
];

const sampleChirpsQueue = [
  { id: 'q1', bucket: 'legendary', template: 'Queue chirp 1 for $first_name', created_by: null, created_at: '2025-01-01', queue_position: 1, source: 'manual', archived_at: null },
  { id: 'q2', bucket: 'legendary', template: 'Queue chirp 2 for $first_name', created_by: null, created_at: '2025-01-02', queue_position: 2, source: 'ai', archived_at: null },
  { id: 'q3', bucket: 'legendary', template: 'Queue chirp 3 for $first_name', created_by: null, created_at: '2025-01-03', queue_position: 3, source: 'ai', archived_at: null },
  { id: 'q4', bucket: 'bad', template: 'Bad queue chirp for $first_name', created_by: null, created_at: '2025-01-01', queue_position: 1, source: 'manual', archived_at: null },
  { id: 'a1', bucket: 'legendary', template: 'Archived chirp for $first_name', created_by: null, created_at: '2025-01-01', queue_position: null, source: 'ai', archived_at: '2025-02-01T00:00:00Z' },
];

describe('ChirpsPage — Flag OFF (legacy mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFeatureFlag.mockReturnValue({ enabled: false, loading: false });
    const chain = createMockChain(sampleChirpsLegacy);
    mockSupabaseClient.from.mockReturnValue(chain);
  });

  it('renders the page header and bucket list', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText('Chirps')).toBeInTheDocument();
    });

    expect(screen.getByText(/Legendary/)).toBeInTheDocument();
    expect(screen.getByText(/Excellent/)).toBeInTheDocument();
    expect(screen.getByText(/Neutral/)).toBeInTheDocument();
    expect(screen.getByText(/Mediocre/)).toBeInTheDocument();
    expect(screen.getByText(/Rough/)).toBeInTheDocument();
    expect(screen.getByText(/Bad/)).toBeInTheDocument();
  });

  it('does NOT show "Queue Mode" badge', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText('Chirps')).toBeInTheDocument();
    });

    expect(screen.queryByText('Queue Mode')).not.toBeInTheDocument();
  });

  it('shows chirp counts per bucket (not X/10 format)', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText('2 chirps')).toBeInTheDocument();
      expect(screen.getByText('1 chirp')).toBeInTheDocument();
    });

    expect(screen.queryByText(/\/10/)).not.toBeInTheDocument();
  });

  it('does NOT show up/down arrows', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Legendary/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Legendary/));

    await waitFor(() => {
      expect(screen.getByText('Wow, $first_name is amazing!')).toBeInTheDocument();
    });

    const arrowUpButtons = document.querySelectorAll('.lucide-arrow-up');
    const arrowDownButtons = document.querySelectorAll('.lucide-arrow-down');
    expect(arrowUpButtons.length).toBe(0);
    expect(arrowDownButtons.length).toBe(0);
  });

  it('does NOT show "Generate More"', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Legendary/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Legendary/));

    await waitFor(() => {
      expect(screen.getByText('Wow, $first_name is amazing!')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Generate.*More/)).not.toBeInTheDocument();
  });

  it('expands a bucket accordion to reveal chirps', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Legendary/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Legendary/));

    await waitFor(() => {
      expect(screen.getByText('Wow, $first_name is amazing!')).toBeInTheDocument();
      expect(screen.getByText('$first_name is on fire!')).toBeInTheDocument();
    });
  });

  it('shows $first_name placeholder hint text', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText(/\$first_name/)).toBeInTheDocument();
    });
  });

  it('shows "Add Chirp" button inside expanded bucket', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Legendary/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Legendary/));

    await waitFor(() => {
      expect(screen.getByText('Add Chirp')).toBeInTheDocument();
    });
  });

  it('shows add form when "Add Chirp" is clicked', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Legendary/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Legendary/));

    await waitFor(() => {
      expect(screen.getByText('Add Chirp')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Chirp'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Enter chirp template/)).toBeInTheDocument();
    });
  });

  it('shows delete confirmation when trash icon is clicked', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Legendary/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Legendary/));

    await waitFor(() => {
      expect(screen.getByText('Wow, $first_name is amazing!')).toBeInTheDocument();
    });

    const chirpRow = screen.getByText('Wow, $first_name is amazing!').closest('[class*="flex items-start"]');
    const buttons = chirpRow?.querySelectorAll('button');
    if (buttons && buttons.length >= 2) {
      fireEvent.click(buttons[buttons.length - 1]);
    }

    await waitFor(() => {
      expect(screen.getByText('Delete this chirp?')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  it('shows empty state for a bucket with no chirps', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Excellent/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Excellent/));

    await waitFor(() => {
      expect(screen.getByText('No chirps in this bucket yet.')).toBeInTheDocument();
    });
  });
});

describe('ChirpsPage — Flag ON (queue mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFeatureFlag.mockReturnValue({ enabled: true, loading: false });
    const chain = createMockChain(sampleChirpsQueue);
    mockSupabaseClient.from.mockReturnValue(chain);
  });

  it('shows "Queue Mode" badge in header', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText('Queue Mode')).toBeInTheDocument();
    });
  });

  it('shows queue count (X/10) in bucket headers', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText('3/10')).toBeInTheDocument();
      expect(screen.getByText('1/10')).toBeInTheDocument();
    });
  });

  it('shows "Next Up" badge on the first chirp in a queue', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Legendary/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Legendary/));

    await waitFor(() => {
      expect(screen.getByText('Next Up')).toBeInTheDocument();
    });
  });

  it('shows "AI" badge on AI-generated chirps', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Legendary/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Legendary/));

    await waitFor(() => {
      const aiBadges = screen.getAllByText('AI');
      expect(aiBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows up/down arrows for reorder', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Legendary/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Legendary/));

    await waitFor(() => {
      expect(screen.getByText('Queue chirp 1 for $first_name')).toBeInTheDocument();
    });

    const arrowUpIcons = document.querySelectorAll('.lucide-arrow-up');
    const arrowDownIcons = document.querySelectorAll('.lucide-arrow-down');
    expect(arrowUpIcons.length).toBeGreaterThanOrEqual(1);
    expect(arrowDownIcons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Generate More" button when bucket is below 10', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Legendary/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Legendary/));

    await waitFor(() => {
      expect(screen.getByText(/Generate 7 More/)).toBeInTheDocument();
    });
  });

  it('shows "Initialize Queue" banner when all queues are empty', async () => {
    vi.mock('@/lib/hooks/useUser', async () => ({
      useUser: () => ({
        isAuthenticated: true,
        loading: false,
        profile: { id: 'user-1', role: 'admin', full_name: 'Admin User' },
        isAdmin: true,
      }),
    }));

    const emptyChain = createMockChain([]);
    mockSupabaseClient.from.mockReturnValue(emptyChain);

    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText('Queue is empty')).toBeInTheDocument();
      expect(screen.getByText('Initialize Queue')).toBeInTheDocument();
    });
  });

  it('shows archive section with archived chirps', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Legendary/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Legendary/));

    await waitFor(() => {
      expect(screen.getByText(/Archive \(1\)/)).toBeInTheDocument();
    });
  });

  it('shows revive button on archived chirps', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Legendary/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Legendary/));

    await waitFor(() => {
      expect(screen.getByText(/Archive \(1\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Archive \(1\)/));

    await waitFor(() => {
      expect(screen.getByText('Archived chirp for $first_name')).toBeInTheDocument();
      const reviveButton = screen.getByTitle('Revive to queue');
      expect(reviveButton).toBeInTheDocument();
    });
  });

  it('shows "Add Chirp to Queue" in queue mode', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Legendary/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Legendary/));

    await waitFor(() => {
      expect(screen.getByText('Add Chirp to Queue')).toBeInTheDocument();
    });
  });

  it('shows "Queue is empty." for a bucket with no queued chirps', async () => {
    render(<ChirpsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Excellent/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Excellent/));

    await waitFor(() => {
      expect(screen.getByText('Queue is empty.')).toBeInTheDocument();
    });
  });
});
