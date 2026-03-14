import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock useUser before importing component
const mockUseUser = vi.fn();
vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => mockUseUser(),
}));

import BottomNav from '@/components/navigation/BottomNav';

describe('BottomNav', () => {
  it('renders nothing when not authenticated', () => {
    mockUseUser.mockReturnValue({
      isAdmin: false,
      isAuthenticated: false,
    });
    const { container } = render(<BottomNav />);
    expect(container.innerHTML).toBe('');
  });

  it('renders main nav items when authenticated', () => {
    mockUseUser.mockReturnValue({
      isAdmin: false,
      isAuthenticated: true,
    });
    render(<BottomNav />);

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Scores')).toBeInTheDocument();
    expect(screen.getByText('Leaders')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();
  });

  it('renders correct links', () => {
    mockUseUser.mockReturnValue({
      isAdmin: false,
      isAuthenticated: true,
    });
    render(<BottomNav />);

    const homeLink = screen.getByText('Home').closest('a');
    expect(homeLink).toHaveAttribute('href', '/home');

    const scoresLink = screen.getByText('Scores').closest('a');
    expect(scoresLink).toHaveAttribute('href', '/scores');
  });

  it('opens More menu when clicked', () => {
    mockUseUser.mockReturnValue({
      isAdmin: false,
      isAuthenticated: true,
    });
    render(<BottomNav />);

    // More menu items should not be visible initially
    expect(screen.queryByText('Courses')).not.toBeInTheDocument();

    // Click More
    fireEvent.click(screen.getByText('More'));

    // Menu should now show
    expect(screen.getByText('Courses')).toBeInTheDocument();
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText('Event History')).toBeInTheDocument();
    expect(screen.getByText('Tour Stats')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Playoffs')).toBeInTheDocument();
  });

  it('shows Admin in More menu for admin users', () => {
    mockUseUser.mockReturnValue({
      isAdmin: true,
      isAuthenticated: true,
    });
    render(<BottomNav />);

    fireEvent.click(screen.getByText('More'));
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('does NOT show Admin in More menu for non-admin users', () => {
    mockUseUser.mockReturnValue({
      isAdmin: false,
      isAuthenticated: true,
    });
    render(<BottomNav />);

    fireEvent.click(screen.getByText('More'));
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('closes More menu when X is clicked', () => {
    mockUseUser.mockReturnValue({
      isAdmin: false,
      isAuthenticated: true,
    });
    render(<BottomNav />);

    fireEvent.click(screen.getByText('More'));
    expect(screen.getByText('Courses')).toBeInTheDocument();

    // Click the X button (close)
    const closeButton = screen.getByRole('button', { name: '' }); // X icon button
    // Actually the heading "More" is shown with an X button next to it
    const moreHeading = screen.getByText('More', { selector: 'h3' });
    const closeBtn = moreHeading.parentElement?.querySelector('button');
    if (closeBtn) fireEvent.click(closeBtn);

    // After closing, menu items should disappear
    expect(screen.queryByText('Courses')).not.toBeInTheDocument();
  });
});
