import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn() }),
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    isAdmin: true,
    loading: false,
    profile: { id: 'admin-1', role: 'admin' },
  }),
}));

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { mockLogAuditEvent } = vi.hoisted(() => ({ mockLogAuditEvent: vi.fn() }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: mockLogAuditEvent }));

const mockUsers = [
  { id: 'u1', full_name: 'Ashby Foltz', email: 'ashby@test.com', role: 'admin', handicap_index: 13.8, profile_picture_url: 'https://example.com/ashby.jpg' },
  { id: 'u2', full_name: 'Robby Dewling', email: 'robby@test.com', role: 'member', handicap_index: 8.5, profile_picture_url: null },
  { id: 'u3', full_name: 'Alan Carpenter', email: 'alan@test.com', role: 'inactive', handicap_index: 20.0, profile_picture_url: null },
];

const mockUpload = vi.fn().mockResolvedValue({ error: null });
const mockGetPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/new-photo.jpg' } });

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: mockUsers }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
      delete: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
      insert: () => Promise.resolve({ error: null }),
    }),
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  }),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img {...(props as React.ImgHTMLAttributes<HTMLImageElement>)} />,
}));

import AdminUsersPage from '@/app/(protected)/admin/users/page';

describe('Admin Users Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders user list with profile pictures', async () => {
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByText('Ashby Foltz')).toBeInTheDocument();
    });
    expect(screen.getByText('Robby Dewling')).toBeInTheDocument();
    expect(screen.getByText('Alan Carpenter')).toBeInTheDocument();

    // Ashby has a profile pic
    const ashbyImg = screen.getByAltText('Ashby Foltz');
    expect(ashbyImg).toBeInTheDocument();
    expect(ashbyImg.getAttribute('src')).toBe('https://example.com/ashby.jpg');
  });

  it('shows initials when no profile picture', async () => {
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByText('Robby Dewling')).toBeInTheDocument();
    });
    // Robby has no profile pic - should show initial "R"
    const initials = screen.getAllByText('R');
    expect(initials.length).toBeGreaterThanOrEqual(1);
  });

  it('shows inactive badge with gray styling', async () => {
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByText('Alan Carpenter')).toBeInTheDocument();
    });
    const inactiveBadge = screen.getByText('inactive');
    expect(inactiveBadge.className).toContain('bg-gray-100');
    expect(inactiveBadge.className).toContain('text-gray-500');
  });

  it('shows camera icon for photo upload on each user', async () => {
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByText('Ashby Foltz')).toBeInTheDocument();
    });
    const fileInputs = document.querySelectorAll('input[type="file"][accept="image/*"]');
    expect(fileInputs.length).toBe(mockUsers.length);
  });

  it('includes inactive in the role dropdown options', async () => {
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByText('Ashby Foltz')).toBeInTheDocument();
    });
    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    const inactiveOption = screen.getByRole('option', { name: 'Inactive' });
    expect(inactiveOption).toBeInTheDocument();
  });

  it('logs user_delete audit event when user is deleted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByText('Robby Dewling')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[1]);

    await waitFor(() => {
      expect(mockLogAuditEvent).toHaveBeenCalledWith('user_delete', 'user', 'u2', {
        full_name: 'Robby Dewling',
        email: 'robby@test.com',
        role: 'member',
      });
    });
  });

  it('logs profile_picture_upload audit event when admin uploads photo', async () => {
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByText('Ashby Foltz')).toBeInTheDocument();
    });

    const fileInputs = document.querySelectorAll('input[type="file"][accept="image/*"]');
    const file = new File(['photo'], 'avatar.png', { type: 'image/png' });
    fireEvent.change(fileInputs[0], { target: { files: [file] } });

    await waitFor(() => {
      expect(mockLogAuditEvent).toHaveBeenCalledWith('profile_picture_upload', 'user', 'u1', {
        target_user: 'Ashby Foltz',
        uploaded_by: 'admin',
      });
    });
  });
});
