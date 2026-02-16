import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { mockSupabaseClient } from '../setup';

// Mock useUser
const mockIsAdmin = vi.fn().mockReturnValue(true);
vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    isAdmin: mockIsAdmin(),
    loading: false,
    profile: { id: 'admin-1', role: 'admin' },
  }),
}));

// Mock Toast
const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// Mock audit
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

import AdminPlayoffsPage from '@/app/(protected)/admin/playoffs/page';

function createChainProxy(resolvedData: unknown = []) {
  const proxy: Record<string, unknown> = {};
  const handler = () => proxy;
  ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'is', 'not',
    'gte', 'lte', 'order', 'limit', 'single'].forEach((m) => {
    proxy[m] = vi.fn(handler);
  });
  proxy.then = vi.fn((resolve: (val: unknown) => void) => {
    resolve({ data: resolvedData, error: null });
    return Promise.resolve({ data: resolvedData, error: null });
  });
  return proxy;
}

const mockSeasons = [
  { id: 's1', year: 2025, name: '2025 Season', start_date: '2025-03-01', end_date: '2025-10-31' },
  { id: 's2', year: 2026, name: '2026 Season', start_date: '2026-03-01', end_date: '2026-10-31' },
];

const mockMembers = [
  { id: 'u1', full_name: 'Tiger Woods', email: 'tiger@test.com', role: 'member' },
  { id: 'u2', full_name: 'Jack Nicklaus', email: 'jack@test.com', role: 'member' },
  { id: 'u3', full_name: 'Arnold Palmer', email: 'arnold@test.com', role: 'member' },
  { id: 'u4', full_name: 'Ben Hogan', email: 'ben@test.com', role: 'admin' },
];

const mockBrackets = [
  {
    id: 'b1',
    season_id: 's2',
    flight: 'championship',
    round: 1,
    matchup_number: 1,
    player1_id: 'u1',
    player2_id: 'u2',
    winner_id: 'u1',
    event_id: null,
    player1: { id: 'u1', full_name: 'Tiger Woods' },
    player2: { id: 'u2', full_name: 'Jack Nicklaus' },
    winner: { id: 'u1', full_name: 'Tiger Woods' },
  },
  {
    id: 'b2',
    season_id: 's2',
    flight: 'championship',
    round: 1,
    matchup_number: 2,
    player1_id: null,
    player2_id: null,
    winner_id: null,
    event_id: null,
    player1: null,
    player2: null,
    winner: null,
  },
];

describe('Admin Playoffs Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin.mockReturnValue(true);

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'seasons') return createChainProxy(mockSeasons);
      if (table === 'users') return createChainProxy(mockMembers);
      if (table === 'playoff_brackets') return createChainProxy(mockBrackets);
      return createChainProxy([]);
    });
  });

  it('renders the page header and season selector', async () => {
    render(<AdminPlayoffsPage />);
    expect(await screen.findByText('Playoff Brackets')).toBeInTheDocument();
    expect(screen.getByText('2025')).toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();
  });

  it('renders flight tabs', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Playoff Brackets');
    expect(screen.getByText('Championship')).toBeInTheDocument();
    expect(screen.getByText('Consolation')).toBeInTheDocument();
    expect(screen.getByText('Unicorn')).toBeInTheDocument();
  });

  it('renders bracket matchups with player names', async () => {
    render(<AdminPlayoffsPage />);
    expect(await screen.findByText('Tiger Woods')).toBeInTheDocument();
    expect(screen.getByText('Jack Nicklaus')).toBeInTheDocument();
  });

  it('shows TBD for matchups without players', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Tiger Woods');
    const tbdElements = screen.getAllByText('TBD');
    expect(tbdElements.length).toBeGreaterThanOrEqual(2);
  });

  it('renders pencil edit icon on each matchup', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Tiger Woods');
    const editButtons = screen.getAllByTitle('Edit matchup');
    expect(editButtons.length).toBe(2);
  });

  it('opens inline edit form when pencil icon is clicked', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Tiger Woods');

    const editButtons = screen.getAllByTitle('Edit matchup');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Editing Matchup #1/)).toBeInTheDocument();
      expect(screen.getByText('Player 1')).toBeInTheDocument();
      expect(screen.getByText('Player 2')).toBeInTheDocument();
      expect(screen.getByText('Winner')).toBeInTheDocument();
      expect(screen.getByText('Save')).toBeInTheDocument();
    });
  });

  it('pre-populates edit form with existing player selections', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Tiger Woods');

    const editButtons = screen.getAllByTitle('Edit matchup');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Editing Matchup #1/)).toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    const player1Select = selects.find((s) => s.closest('div')?.textContent?.includes('Player 1'));
    const player2Select = selects.find((s) => s.closest('div')?.textContent?.includes('Player 2'));

    expect(player1Select).toHaveValue('u1');
    expect(player2Select).toHaveValue('u2');
  });

  it('cancels edit and returns to display mode', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Tiger Woods');

    const editButtons = screen.getAllByTitle('Edit matchup');
    fireEvent.click(editButtons[0]);

    await waitFor(() => expect(screen.getByText(/Editing Matchup/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText(/Editing Matchup/)).not.toBeInTheDocument();
    });
  });

  it('shows Add Matchup button', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Tiger Woods');
    expect(screen.getByText('Add Matchup')).toBeInTheDocument();
  });

  it('opens new matchup form when Add Matchup is clicked', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Tiger Woods');

    fireEvent.click(screen.getByText('Add Matchup'));

    await waitFor(() => {
      expect(screen.getByText('New Matchup')).toBeInTheDocument();
      expect(screen.getByText('Round')).toBeInTheDocument();
      expect(screen.getByText('Matchup #')).toBeInTheDocument();
    });
  });

  it('redirects non-admin users', () => {
    mockIsAdmin.mockReturnValue(false);
    render(<AdminPlayoffsPage />);
    expect(screen.getByText('Admin access required.')).toBeInTheDocument();
    expect(screen.queryByText('Playoff Brackets')).not.toBeInTheDocument();
  });
});
