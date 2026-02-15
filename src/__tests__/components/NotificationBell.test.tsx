import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockUseUser = vi.fn();
const mockUseNotifications = vi.fn();

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => mockUseUser(),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => mockUseNotifications(),
}));

import NotificationBell from '@/components/navigation/NotificationBell';

describe('NotificationBell', () => {
  it('renders nothing when not authenticated', () => {
    mockUseUser.mockReturnValue({
      profile: null,
      isAuthenticated: false,
    });
    mockUseNotifications.mockReturnValue({ unreadCount: 0 });

    const { container } = render(<NotificationBell />);
    expect(container.innerHTML).toBe('');
  });

  it('renders bell icon when authenticated', () => {
    mockUseUser.mockReturnValue({
      profile: { id: 'user-1' },
      isAuthenticated: true,
    });
    mockUseNotifications.mockReturnValue({ unreadCount: 0 });

    render(<NotificationBell />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/notifications');
  });

  it('shows unread badge when count > 0', () => {
    mockUseUser.mockReturnValue({
      profile: { id: 'user-1' },
      isAuthenticated: true,
    });
    mockUseNotifications.mockReturnValue({ unreadCount: 5 });

    render(<NotificationBell />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows 99+ for large counts', () => {
    mockUseUser.mockReturnValue({
      profile: { id: 'user-1' },
      isAuthenticated: true,
    });
    mockUseNotifications.mockReturnValue({ unreadCount: 150 });

    render(<NotificationBell />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('does not show badge when unread count is 0', () => {
    mockUseUser.mockReturnValue({
      profile: { id: 'user-1' },
      isAuthenticated: true,
    });
    mockUseNotifications.mockReturnValue({ unreadCount: 0 });

    render(<NotificationBell />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
