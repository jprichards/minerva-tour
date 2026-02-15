import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockRouter = { push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/courses/add',
  useParams: () => ({}),
}));

const mockUseUser = vi.fn();
vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => mockUseUser(),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

import AddCoursePage from '@/app/(protected)/courses/add/page';

describe('Add Course Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUser.mockReturnValue({
      profile: { id: 'user-1', full_name: 'Test User', role: 'member' },
      isPlayingGuest: false,
      isAdmin: false,
    });
  });

  it('renders Add Course heading', () => {
    render(<AddCoursePage />);
    expect(screen.getByText('Add Course')).toBeInTheDocument();
  });

  it('renders USGA link', () => {
    render(<AddCoursePage />);
    expect(screen.getByText('Look up course data on USGA NCRDB')).toBeInTheDocument();
  });

  it('renders all form fields', () => {
    render(<AddCoursePage />);
    expect(screen.getByText('Course Name')).toBeInTheDocument();
    expect(screen.getByText('Tee Name')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Course Rating')).toBeInTheDocument();
    expect(screen.getByText('Slope Rating')).toBeInTheDocument();
    expect(screen.getByText('Par')).toBeInTheDocument();
  });

  it('renders course type buttons', () => {
    render(<AddCoursePage />);
    expect(screen.getByText('18 Holes')).toBeInTheDocument();
    expect(screen.getByText('9 Holes')).toBeInTheDocument();
    expect(screen.getByText('Front 9')).toBeInTheDocument();
    expect(screen.getByText('Back 9')).toBeInTheDocument();
  });

  it('has a Save Course button', () => {
    render(<AddCoursePage />);
    expect(screen.getByText('Save Course')).toBeInTheDocument();
  });

  it('blocks playing guests from adding courses', () => {
    mockUseUser.mockReturnValue({
      profile: { id: 'user-1', role: 'playing_guest' },
      isPlayingGuest: true,
      isAdmin: false,
    });

    render(<AddCoursePage />);
    expect(screen.getByText('Restricted')).toBeInTheDocument();
    expect(screen.getByText('Playing guests cannot add courses.')).toBeInTheDocument();
  });

  it('has Go back button for playing guests', () => {
    mockUseUser.mockReturnValue({
      profile: { id: 'user-1', role: 'playing_guest' },
      isPlayingGuest: true,
      isAdmin: false,
    });

    render(<AddCoursePage />);
    fireEvent.click(screen.getByText('Go back'));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('shows duplicate warning note', () => {
    render(<AddCoursePage />);
    expect(screen.getByText(/Courses with identical name/)).toBeInTheDocument();
  });
});
