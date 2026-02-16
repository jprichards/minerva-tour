import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { mockSupabaseClient } from '../setup';

const mockIsAdmin = vi.fn().mockReturnValue(true);
vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    isAdmin: mockIsAdmin(),
    loading: false,
    profile: { id: 'admin-1', role: 'admin' },
  }),
}));

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockRouter = { push: vi.fn() };
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual('next/navigation');
  return {
    ...actual,
    useRouter: () => mockRouter,
  };
});

import AdminFeedbackPage from '@/app/(protected)/admin/feedback/page';

function createChainProxy(resolvedData: unknown = [], resolvedError: unknown = null) {
  const proxy: Record<string, unknown> = {};
  const handler = () => proxy;
  ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'is', 'not',
    'gte', 'lte', 'order', 'limit', 'single'].forEach((m) => {
    proxy[m] = vi.fn(handler);
  });
  proxy.then = vi.fn((resolve: (val: unknown) => void) => {
    resolve({ data: resolvedData, error: resolvedError });
    return Promise.resolve({ data: resolvedData, error: resolvedError });
  });
  return proxy;
}

const mockFeedback = [
  {
    id: 'fb-1',
    user_id: 'u1',
    type: 'bug',
    title: 'App crashes on load',
    description: 'The app crashes when I open the home page.',
    attachments: ['https://storage.example.com/feedback-attachments/u1/fb-1/screenshot.png'],
    status: 'open',
    admin_response: null,
    responded_by: null,
    responded_at: null,
    created_at: '2026-02-10T00:00:00Z',
    updated_at: '2026-02-10T00:00:00Z',
    user: { id: 'u1', full_name: 'John Smith', email: 'john@test.com' },
  },
  {
    id: 'fb-2',
    user_id: 'u2',
    type: 'feature_request',
    title: 'Dark mode for leaderboard',
    description: 'Please add dark mode support to the leaderboard.',
    attachments: [],
    status: 'in_progress',
    admin_response: 'Working on it!',
    responded_by: 'admin-1',
    responded_at: '2026-02-12T00:00:00Z',
    created_at: '2026-02-05T00:00:00Z',
    updated_at: '2026-02-12T00:00:00Z',
    user: { id: 'u2', full_name: 'Jane Doe', email: 'jane@test.com' },
  },
  {
    id: 'fb-3',
    user_id: 'u1',
    type: 'other',
    title: 'General suggestion',
    description: 'Love the app!',
    attachments: [],
    status: 'closed',
    admin_response: 'Thanks!',
    responded_by: 'admin-1',
    responded_at: '2026-02-08T00:00:00Z',
    created_at: '2026-01-20T00:00:00Z',
    updated_at: '2026-02-08T00:00:00Z',
    user: { id: 'u1', full_name: 'John Smith', email: 'john@test.com' },
  },
];

describe('Admin Feedback Inbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin.mockReturnValue(true);

    mockSupabaseClient.from.mockImplementation(() => createChainProxy(mockFeedback));

    // Ensure storage mock has remove
    mockSupabaseClient.storage.from = vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'test.jpg' }, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/test.jpg' } }),
      remove: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
  });

  it('renders the page header with counts', async () => {
    render(<AdminFeedbackPage />);
    await waitFor(() => {
      expect(screen.getByText('Feedback Inbox')).toBeInTheDocument();
    });
    expect(screen.getByText(/1 open item/)).toBeInTheDocument();
    expect(screen.getByText(/3 total/)).toBeInTheDocument();
  });

  it('renders all feedback entries', async () => {
    render(<AdminFeedbackPage />);
    await waitFor(() => {
      expect(screen.getByText('App crashes on load')).toBeInTheDocument();
      expect(screen.getByText('Dark mode for leaderboard')).toBeInTheDocument();
      expect(screen.getByText('General suggestion')).toBeInTheDocument();
    });
  });

  it('shows submitter names and dates', async () => {
    render(<AdminFeedbackPage />);
    await waitFor(() => {
      expect(screen.getByText('App crashes on load')).toBeInTheDocument();
    });
    // John Smith should appear (for fb-1 and fb-3)
    const smithEntries = screen.getAllByText(/John Smith/);
    expect(smithEntries.length).toBeGreaterThanOrEqual(1);
    // Jane Doe for fb-2
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
  });

  it('filters by status', async () => {
    render(<AdminFeedbackPage />);
    await waitFor(() => {
      expect(screen.getByText('App crashes on load')).toBeInTheDocument();
    });

    const statusSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(statusSelect, { target: { value: 'open' } });

    await waitFor(() => {
      expect(screen.getByText('App crashes on load')).toBeInTheDocument();
      expect(screen.queryByText('Dark mode for leaderboard')).not.toBeInTheDocument();
      expect(screen.queryByText('General suggestion')).not.toBeInTheDocument();
    });
  });

  it('filters by type', async () => {
    render(<AdminFeedbackPage />);
    await waitFor(() => {
      expect(screen.getByText('App crashes on load')).toBeInTheDocument();
    });

    const typeSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(typeSelect, { target: { value: 'feature_request' } });

    await waitFor(() => {
      expect(screen.queryByText('App crashes on load')).not.toBeInTheDocument();
      expect(screen.getByText('Dark mode for leaderboard')).toBeInTheDocument();
      expect(screen.queryByText('General suggestion')).not.toBeInTheDocument();
    });
  });

  it('expands entry to show description and attachments', async () => {
    render(<AdminFeedbackPage />);
    await waitFor(() => {
      expect(screen.getByText('App crashes on load')).toBeInTheDocument();
    });

    const entry = screen.getByText('App crashes on load').closest('button')!;
    fireEvent.click(entry);

    await waitFor(() => {
      expect(screen.getByText('The app crashes when I open the home page.')).toBeInTheDocument();
      expect(screen.getByText('File 1')).toBeInTheDocument();
    });
  });

  it('shows status buttons in expanded view', async () => {
    render(<AdminFeedbackPage />);
    await waitFor(() => {
      expect(screen.getByText('App crashes on load')).toBeInTheDocument();
    });

    const entry = screen.getByText('App crashes on load').closest('button')!;
    fireEvent.click(entry);

    await waitFor(() => {
      // All status options visible
      const openBtns = screen.getAllByText('Open');
      expect(openBtns.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('In Progress', { selector: 'button' })).toBeInTheDocument();
      expect(screen.getByText('Resolved', { selector: 'button' })).toBeInTheDocument();
      expect(screen.getByText('Closed', { selector: 'button' })).toBeInTheDocument();
    });
  });

  it('shows admin response textarea in expanded view', async () => {
    render(<AdminFeedbackPage />);
    await waitFor(() => {
      expect(screen.getByText('App crashes on load')).toBeInTheDocument();
    });

    const entry = screen.getByText('App crashes on load').closest('button')!;
    fireEvent.click(entry);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Write a response...')).toBeInTheDocument();
    });
  });

  it('redirects non-admin users', () => {
    mockIsAdmin.mockReturnValue(false);
    render(<AdminFeedbackPage />);
    expect(mockRouter.push).toHaveBeenCalledWith('/home');
  });
});
