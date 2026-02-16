import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock router
const mockRouter = { push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin',
  useParams: () => ({}),
}));

const mockUseUser = vi.fn();
vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => mockUseUser(),
}));

import AdminPage from '@/app/(protected)/admin/page';

describe('Admin Page Access Control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders admin links when user is admin', () => {
    mockUseUser.mockReturnValue({
      isAdmin: true,
      loading: false,
    });

    render(<AdminPage />);
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('User Provisioning')).toBeInTheDocument();
    expect(screen.getByText('Season & Events')).toBeInTheDocument();
    expect(screen.getByText('Playoff Brackets')).toBeInTheDocument();
    expect(screen.getByText('Tournaments')).toBeInTheDocument();
    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
    expect(screen.getByText('App Settings')).toBeInTheDocument();
  });

  it('shows all 7 admin sections', () => {
    mockUseUser.mockReturnValue({
      isAdmin: true,
      loading: false,
    });

    render(<AdminPage />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(10);
  });

  it('has correct links for admin sections', () => {
    mockUseUser.mockReturnValue({
      isAdmin: true,
      loading: false,
    });

    render(<AdminPage />);
    expect(screen.getByText('User Management').closest('a')).toHaveAttribute('href', '/admin/users');
    expect(screen.getByText('User Provisioning').closest('a')).toHaveAttribute('href', '/admin/provisions');
    expect(screen.getByText('Season & Events').closest('a')).toHaveAttribute('href', '/admin/seasons');
    expect(screen.getByText('Playoff Brackets').closest('a')).toHaveAttribute('href', '/admin/playoffs');
    expect(screen.getByText('Tournaments').closest('a')).toHaveAttribute('href', '/admin/tournaments');
    expect(screen.getByText('Audit Logs').closest('a')).toHaveAttribute('href', '/admin/audit');
    expect(screen.getByText('App Settings').closest('a')).toHaveAttribute('href', '/admin/settings');
  });

  it('redirects non-admin users to /home', () => {
    mockUseUser.mockReturnValue({
      isAdmin: false,
      loading: false,
    });

    render(<AdminPage />);
    expect(mockRouter.push).toHaveBeenCalledWith('/home');
  });

  it('shows loading state', () => {
    mockUseUser.mockReturnValue({
      isAdmin: false,
      loading: true,
    });

    const { container } = render(<AdminPage />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders null for non-admin after loading', () => {
    mockUseUser.mockReturnValue({
      isAdmin: false,
      loading: false,
    });

    const { container } = render(<AdminPage />);
    // Should render nothing (no admin content)
    expect(container.querySelector('h1')).toBeNull();
  });
});
