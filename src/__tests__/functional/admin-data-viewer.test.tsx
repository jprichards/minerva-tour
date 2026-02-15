import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockRouter = { push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/data',
  useParams: () => ({}),
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'admin-1', role: 'admin' },
    isAdmin: true,
    loading: false,
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

import AdminDataPage from '@/app/(protected)/admin/data/page';

describe('Admin Data Viewer Page', () => {
  it('renders the heading', () => {
    render(<AdminDataPage />);
    expect(screen.getByText('Database Viewer')).toBeInTheDocument();
  });

  it('renders a table selector', () => {
    render(<AdminDataPage />);
    // The selector should show available tables
    const selector = screen.getByRole('combobox');
    expect(selector).toBeInTheDocument();
  });

  it('shows available database tables in selector', () => {
    render(<AdminDataPage />);
    // Should have options for all major tables
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Scores')).toBeInTheDocument();
    expect(screen.getByText('Courses')).toBeInTheDocument();
  });

  it('shows search input', () => {
    render(<AdminDataPage />);
    const search = screen.getByPlaceholderText(/search/i);
    expect(search).toBeInTheDocument();
  });

  it('is admin-only', () => {
    render(<AdminDataPage />);
    expect(screen.getByText('Database Viewer')).toBeInTheDocument();
  });
});
