import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FeatureFlagsSection from '@/components/admin/FeatureFlagsSection';
import { mockSupabaseClient } from '../setup';

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'admin-1', full_name: 'Admin User', email: 'admin@test.com', role: 'admin' },
    isAdmin: true,
    loading: false,
  }),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

const mockFlags = [
  {
    key: 'stats-v2',
    description: 'New stats page',
    enabled: true,
    target_user_ids: [],
    target_roles: [],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    updated_by: null,
  },
  {
    key: 'dark-mode',
    description: 'Dark mode support',
    enabled: false,
    target_user_ids: ['user-1'],
    target_roles: ['admin'],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    updated_by: null,
  },
];

const mockUsers = [
  { id: 'user-1', full_name: 'John Doe', email: 'john@test.com', role: 'member' },
  { id: 'user-2', full_name: 'Jane Smith', email: 'jane@test.com', role: 'admin' },
];

function setupMocks(flags = mockFlags, users = mockUsers) {
  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'feature_flags') {
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: flags, error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    }
    if (table === 'users') {
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: users, error: null }),
      };
    }
    return {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
  });
  mockSupabaseClient.from = fromMock;
  return fromMock;
}

describe('FeatureFlagsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the section header', async () => {
    setupMocks();
    render(<FeatureFlagsSection />);

    await waitFor(() => {
      expect(screen.getByText('Feature Flags')).toBeInTheDocument();
    });
  });

  it('shows flag count', async () => {
    setupMocks();
    render(<FeatureFlagsSection />);

    await waitFor(() => {
      expect(screen.getByText('2 flags')).toBeInTheDocument();
    });
  });

  it('renders each flag with key and description', async () => {
    setupMocks();
    render(<FeatureFlagsSection />);

    await waitFor(() => {
      expect(screen.getByText('stats-v2')).toBeInTheDocument();
      expect(screen.getByText('New stats page')).toBeInTheDocument();
      expect(screen.getByText('dark-mode')).toBeInTheDocument();
      expect(screen.getByText('Dark mode support')).toBeInTheDocument();
    });
  });

  it('shows empty message when no flags exist', async () => {
    setupMocks([], mockUsers);
    render(<FeatureFlagsSection />);

    await waitFor(() => {
      expect(screen.getByText('No feature flags yet. Flags are created in code during development.')).toBeInTheDocument();
    });
  });

  it('shows targeting summary for untargeted flag', async () => {
    setupMocks();
    render(<FeatureFlagsSection />);

    await waitFor(() => {
      expect(screen.getByText('Target: Everyone')).toBeInTheDocument();
    });
  });

  it('shows targeting summary for targeted flag', async () => {
    setupMocks();
    render(<FeatureFlagsSection />);

    await waitFor(() => {
      expect(screen.getByText('Target: 1 user + admin')).toBeInTheDocument();
    });
  });

  it('does not have a create form (flags are created in code)', async () => {
    setupMocks();
    render(<FeatureFlagsSection />);

    await waitFor(() => {
      expect(screen.getByText('Feature Flags')).toBeInTheDocument();
    });

    expect(screen.queryByText('New Flag')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('my-new-feature')).not.toBeInTheDocument();
  });

  it('renders toggle switches with correct initial state', async () => {
    setupMocks();
    render(<FeatureFlagsSection />);

    await waitFor(() => {
      const toggles = screen.getAllByRole('switch');
      expect(toggles).toHaveLength(2);
      expect(toggles[0]).toHaveAttribute('aria-checked', 'true');
      expect(toggles[1]).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('calls update when toggle is clicked', async () => {
    const fromMock = setupMocks();
    render(<FeatureFlagsSection />);

    await waitFor(() => {
      expect(screen.getAllByRole('switch')).toHaveLength(2);
    });

    const toggles = screen.getAllByRole('switch');
    fireEvent.click(toggles[1]);

    await waitFor(() => {
      expect(fromMock).toHaveBeenCalledWith('feature_flags');
    });
  });

  it('expands targeting section when "Targeting" button is clicked', async () => {
    setupMocks();
    render(<FeatureFlagsSection />);

    await waitFor(() => {
      expect(screen.getAllByText('Targeting')).toHaveLength(2);
    });

    fireEvent.click(screen.getAllByText('Targeting')[0]);

    await waitFor(() => {
      expect(screen.getByText('Roles')).toBeInTheDocument();
      expect(screen.getByText('Specific Users')).toBeInTheDocument();
    });
  });
});
