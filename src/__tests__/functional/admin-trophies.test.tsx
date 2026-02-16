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

import AdminTrophiesPage from '@/app/(protected)/admin/trophies/page';

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

const mockUsers = [
  { id: 'u1', full_name: 'John Smith', email: 'john@test.com', role: 'member' },
  { id: 'u2', full_name: 'Jane Doe', email: 'jane@test.com', role: 'member' },
];

const mockTrophies = [
  {
    id: 't1',
    user_id: 'u1',
    year: 2025,
    award_type: 'hole_in_one',
    award_name: 'Hole in One Club',
    emoji: '1️⃣',
    description: 'Hole 7 at Pinehurst',
    created_at: '2025-01-01',
    user: { id: 'u1', full_name: 'John Smith', email: 'john@test.com' },
  },
  {
    id: 't2',
    user_id: 'u2',
    year: 2024,
    award_type: 'minerva_tour_champion',
    award_name: 'Minerva Tour Champion',
    emoji: '🏆',
    description: null,
    created_at: '2024-12-01',
    user: { id: 'u2', full_name: 'Jane Doe', email: 'jane@test.com' },
  },
];

describe('Admin Trophies Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin.mockReturnValue(true);

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'users') return createChainProxy(mockUsers);
      if (table === 'trophies') return createChainProxy(mockTrophies);
      return createChainProxy([]);
    });
  });

  it('renders the page header', async () => {
    render(<AdminTrophiesPage />);
    expect(await screen.findByText('Trophies & Awards')).toBeInTheDocument();
    expect(screen.getByText('Award trophies to members')).toBeInTheDocument();
  });

  it('renders the award form with member dropdown', async () => {
    render(<AdminTrophiesPage />);
    expect(await screen.findByText('Award a Trophy')).toBeInTheDocument();
    expect(screen.getByText('Select a member...')).toBeInTheDocument();
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('renders preset awards in dropdown', async () => {
    render(<AdminTrophiesPage />);
    await screen.findByText('Award a Trophy');
    expect(screen.getByText('Select an award...')).toBeInTheDocument();
  });

  it('toggles between preset and custom mode', async () => {
    render(<AdminTrophiesPage />);
    await screen.findByText('Award a Trophy');

    // Default: preset mode
    expect(screen.getByText('Select an award...')).toBeInTheDocument();

    // Switch to custom
    fireEvent.click(screen.getByText('Custom Award'));
    expect(screen.getByPlaceholderText('e.g. Best Dressed')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. 👔')).toBeInTheDocument();

    // Switch back to preset
    fireEvent.click(screen.getByText('Preset Award'));
    expect(screen.getByText('Select an award...')).toBeInTheDocument();
  });

  it('renders existing trophies list', async () => {
    render(<AdminTrophiesPage />);
    expect(await screen.findByText('All Trophies (2)')).toBeInTheDocument();
    expect(screen.getByText('Hole in One Club')).toBeInTheDocument();
    expect(screen.getByText('Minerva Tour Champion')).toBeInTheDocument();
  });

  it('shows trophy details including member name and year', async () => {
    render(<AdminTrophiesPage />);
    await screen.findByText('Hole in One Club');
    // Member name + year appears in the trophy list entries
    const entries = screen.getAllByText(/John Smith/);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    // Find the one in the trophy list (contains year)
    const trophyEntry = entries.find((el) => el.textContent?.includes('2025'));
    expect(trophyEntry).toBeTruthy();
  });

  it('shows delete confirmation on trash click', async () => {
    render(<AdminTrophiesPage />);
    await screen.findByText('Hole in One Club');

    // Find delete buttons (trash icons)
    const deleteButtons = screen.getAllByRole('button').filter(
      (btn) => btn.querySelector('svg')?.classList.contains('lucide-trash-2') ||
               btn.innerHTML.includes('Trash2')
    );
    // Click first delete button using a broader selector
    const trashBtns = document.querySelectorAll('button');
    let trashBtn: HTMLButtonElement | null = null;
    trashBtns.forEach((btn) => {
      if (btn.querySelector('.lucide-trash-2') || btn.querySelector('[class*="trash"]')) {
        if (!trashBtn) trashBtn = btn as HTMLButtonElement;
      }
    });

    // Alternative: find by the Trash2 SVG presence
    if (!trashBtn) {
      // Just click a button that isn't a named button
      const allButtons = screen.getAllByRole('button');
      const trash = allButtons.find((b) => !b.textContent?.trim() || b.textContent?.trim() === '');
      if (trash) fireEvent.click(trash);
    } else {
      fireEvent.click(trashBtn);
    }

    // Should show confirm/cancel
    await waitFor(() => {
      expect(screen.getByText('Confirm')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  it('hides delete confirmation on cancel', async () => {
    render(<AdminTrophiesPage />);
    await screen.findByText('Hole in One Club');

    // Trigger delete confirmation
    const allButtons = screen.getAllByRole('button');
    const trash = allButtons.find((b) => !b.textContent?.trim());
    if (trash) fireEvent.click(trash);

    await waitFor(() => expect(screen.getByText('Confirm')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
    });
  });

  it('redirects non-admin users', () => {
    mockIsAdmin.mockReturnValue(false);
    render(<AdminTrophiesPage />);
    // Should not render content
    expect(screen.queryByText('Trophies & Awards')).not.toBeInTheDocument();
  });

  it('renders year input defaulting to current year', async () => {
    render(<AdminTrophiesPage />);
    await screen.findByText('Award a Trophy');
    const yearInput = screen.getByDisplayValue(String(new Date().getFullYear()));
    expect(yearInput).toBeInTheDocument();
  });

  it('renders description field', async () => {
    render(<AdminTrophiesPage />);
    await screen.findByText('Award a Trophy');
    expect(screen.getByPlaceholderText('e.g. Hole 7 at Pinehurst No. 2')).toBeInTheDocument();
  });
});
