import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { mockSupabaseClient } from '../setup';

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    isAdmin: false,
    loading: false,
    profile: { id: 'user-1', role: 'member', full_name: 'Test User' },
    isAuthenticated: true,
  }),
}));

const mockNotifySlack = vi.fn();
vi.mock('@/lib/slack-notify', () => ({
  notifySlack: (...args: unknown[]) => mockNotifySlack(...args),
}));

const mockLogAuditEvent = vi.fn();
vi.mock('@/lib/audit', () => ({
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
}));

import FeedbackPage from '@/app/(protected)/feedback/page';

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

const mockFeedbackList = [
  {
    id: 'fb-1',
    user_id: 'user-1',
    type: 'bug',
    title: 'Scores not loading',
    description: 'When I open the scores page, nothing appears.',
    attachments: [],
    status: 'open',
    admin_response: null,
    responded_by: null,
    responded_at: null,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
  },
  {
    id: 'fb-2',
    user_id: 'user-1',
    type: 'feature_request',
    title: 'Add chat feature',
    description: 'Would be great to have in-app messaging.',
    attachments: ['https://example.com/screenshot.png'],
    status: 'resolved',
    admin_response: 'Great idea! We will add this in the next release.',
    responded_by: 'admin-1',
    responded_at: '2026-02-10T00:00:00Z',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-02-10T00:00:00Z',
  },
];

describe('Feedback Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'feedback') return createChainProxy(mockFeedbackList);
      return createChainProxy([]);
    });
  });

  it('renders the page header', async () => {
    render(<FeedbackPage />);
    expect(screen.getByText('Feedback')).toBeInTheDocument();
    expect(screen.getByText('Report bugs, request features, or share ideas')).toBeInTheDocument();
  });

  it('renders the submission form with all fields', async () => {
    render(<FeedbackPage />);
    const submitBtns = screen.getAllByText('Submit Feedback');
    expect(submitBtns.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Bug Report')).toBeInTheDocument();
    expect(screen.getByText('Feature Request')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Scores not loading/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/What happened/)).toBeInTheDocument();
    expect(screen.getByText('Add screenshot or video')).toBeInTheDocument();
  });

  it('switches feedback type when clicking type buttons', async () => {
    render(<FeedbackPage />);
    const featureBtn = screen.getByText('Feature Request');
    fireEvent.click(featureBtn);
    // Placeholder should change to feature request style
    expect(screen.getByPlaceholderText(/Add dark mode/)).toBeInTheDocument();
  });

  it('validates required fields before submission', async () => {
    render(<FeedbackPage />);
    const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);
    // HTML5 validation should prevent submission (required fields empty)
    // The form won't call handleSubmit, so no toast is shown
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('shows error for too many files', async () => {
    render(<FeedbackPage />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [
      new File(['a'], 'img1.png', { type: 'image/png' }),
      new File(['b'], 'img2.png', { type: 'image/png' }),
      new File(['c'], 'img3.png', { type: 'image/png' }),
      new File(['d'], 'img4.png', { type: 'image/png' }),
    ];
    Object.defineProperty(fileInput, 'files', { value: files });
    fireEvent.change(fileInput);
    expect(screen.getByText('Maximum 3 files allowed')).toBeInTheDocument();
  });

  it('shows error for oversized files', async () => {
    render(<FeedbackPage />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const bigFile = new File(['x'.repeat(100)], 'big.png', { type: 'image/png' });
    Object.defineProperty(bigFile, 'size', { value: 11 * 1024 * 1024 });
    Object.defineProperty(fileInput, 'files', { value: [bigFile] });
    fireEvent.change(fileInput);
    expect(screen.getByText(/exceeds 10MB limit/)).toBeInTheDocument();
  });

  it('adds and removes file attachments', async () => {
    render(<FeedbackPage />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['test'], 'screenshot.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fireEvent.change(fileInput);
    expect(screen.getByText('screenshot.png')).toBeInTheDocument();

    // Remove the file
    const removeBtn = screen.getByText('screenshot.png').closest('div')!.querySelector('button')!;
    fireEvent.click(removeBtn);
    expect(screen.queryByText('screenshot.png')).not.toBeInTheDocument();
  });

  it('accepts only image and video file types', async () => {
    render(<FeedbackPage />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.accept).toBe('image/*,video/*');
  });

  it('calls notifySlack with feedback details after successful submission', async () => {
    const insertChain = createChainProxy({ id: 'fb-new', type: 'bug', title: 'Test', description: 'Desc', attachments: [] });
    const selectChain = createChainProxy(mockFeedbackList);

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'feedback') {
        return {
          ...insertChain,
          select: vi.fn().mockReturnValue(selectChain),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'fb-new' }, error: null }),
              then: vi.fn((resolve: (val: unknown) => void) => {
                resolve({ data: { id: 'fb-new' }, error: null });
                return Promise.resolve({ data: { id: 'fb-new' }, error: null });
              }),
            }),
          }),
        };
      }
      return createChainProxy([]);
    });

    render(<FeedbackPage />);

    const titleInput = screen.getByPlaceholderText(/Scores not loading/) as HTMLInputElement;
    const descInput = screen.getByPlaceholderText(/What happened/) as HTMLTextAreaElement;

    fireEvent.change(titleInput, { target: { value: 'My bug report' } });
    fireEvent.change(descInput, { target: { value: 'Something is wrong' } });

    const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.submit(submitBtn.closest('form')!);

    await waitFor(() => {
      expect(mockNotifySlack).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'feedback_submitted',
          user_name: 'Test User',
          feedback_type: 'bug',
          title: 'My bug report',
          description: 'Something is wrong',
        })
      );
    });
  });

  it('displays My Submissions list', async () => {
    render(<FeedbackPage />);
    await waitFor(() => {
      expect(screen.getByText('My Submissions (2)')).toBeInTheDocument();
    });
    expect(screen.getByText('Scores not loading')).toBeInTheDocument();
    expect(screen.getByText('Add chat feature')).toBeInTheDocument();
  });

  it('shows status badges on submissions', async () => {
    render(<FeedbackPage />);
    await waitFor(() => {
      expect(screen.getByText('Open')).toBeInTheDocument();
      expect(screen.getByText('Resolved')).toBeInTheDocument();
    });
  });

  it('does not truncate feedback titles in submissions list', async () => {
    render(<FeedbackPage />);
    await waitFor(() => {
      const titleEl = screen.getByText('Scores not loading');
      expect(titleEl).toBeInTheDocument();
      expect(titleEl.className).not.toMatch(/truncate/);
    });
  });

  it('expands a submission to show description and admin response', async () => {
    render(<FeedbackPage />);
    await waitFor(() => {
      expect(screen.getByText('Add chat feature')).toBeInTheDocument();
    });

    // Click to expand
    const entry = screen.getByText('Add chat feature').closest('button')!;
    fireEvent.click(entry);

    await waitFor(() => {
      expect(screen.getByText('Would be great to have in-app messaging.')).toBeInTheDocument();
      expect(screen.getByText('Admin Response')).toBeInTheDocument();
      expect(screen.getByText('Great idea! We will add this in the next release.')).toBeInTheDocument();
    });
  });

  it('shows delete button in expanded submission', async () => {
    render(<FeedbackPage />);
    await waitFor(() => {
      expect(screen.getByText('Scores not loading')).toBeInTheDocument();
    });

    const entry = screen.getByText('Scores not loading').closest('button')!;
    fireEvent.click(entry);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
  });

  it('calls delete with confirmation and logs audit event', async () => {
    window.confirm = vi.fn().mockReturnValue(true);

    const deleteMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockSupabaseClient.from.mockImplementation((table: string) => {
      const chain = createChainProxy(mockFeedbackList);
      (chain as Record<string, unknown>).delete = deleteMock;
      return chain;
    });

    mockSupabaseClient.storage.from = vi.fn().mockReturnValue({
      remove: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    render(<FeedbackPage />);
    await waitFor(() => {
      expect(screen.getByText('Scores not loading')).toBeInTheDocument();
    });

    const entry = screen.getByText('Scores not loading').closest('button')!;
    fireEvent.click(entry);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));

    expect(window.confirm).toHaveBeenCalledWith('Delete "Scores not loading"? This cannot be undone.');

    await waitFor(() => {
      expect(deleteMock).toHaveBeenCalled();
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        'feedback_delete',
        'feedback',
        'fb-1',
        expect.objectContaining({
          title: 'Scores not loading',
          type: 'bug',
          deleted_by_role: 'user',
        })
      );
      expect(mockShowToast).toHaveBeenCalledWith('Feedback deleted', 'success');
    });
  });

  it('does not delete when confirmation is cancelled', async () => {
    window.confirm = vi.fn().mockReturnValue(false);

    const deleteMock = vi.fn();
    mockSupabaseClient.from.mockImplementation(() => {
      const chain = createChainProxy(mockFeedbackList);
      (chain as Record<string, unknown>).delete = deleteMock;
      return chain;
    });

    render(<FeedbackPage />);
    await waitFor(() => {
      expect(screen.getByText('Scores not loading')).toBeInTheDocument();
    });

    const entry = screen.getByText('Scores not loading').closest('button')!;
    fireEvent.click(entry);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));

    expect(window.confirm).toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
