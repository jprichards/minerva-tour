import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock useUser with admin capabilities
vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    isAdmin: true,
    isAuthenticated: true,
    loading: false,
    profile: { id: 'user-1', role: 'admin', full_name: 'Test User' },
    authUser: { id: 'user-1' },
  }),
}));

// Mock ThemeProvider
vi.mock('@/components/ThemeProvider', () => ({
  useThemeContext: () => ({
    preference: 'system',
    setTheme: vi.fn(),
    isDark: false,
  }),
}));

// Mock Toast
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import BottomNav from '@/components/navigation/BottomNav';

describe('Feedback Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Feedback link in the More menu', () => {
    render(<BottomNav />);

    // Open the More menu
    const moreBtn = screen.getByText('More');
    fireEvent.click(moreBtn);

    expect(screen.getByText('Feedback')).toBeInTheDocument();
    expect(screen.getByText('Feedback').closest('a')).toHaveAttribute('href', '/feedback');
  });

  it('shows Feedback link alongside other menu items', () => {
    render(<BottomNav />);

    // Open the More menu
    const moreBtn = screen.getByText('More');
    fireEvent.click(moreBtn);

    // Other menu items should also be present
    expect(screen.getByText('Courses')).toBeInTheDocument();
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText('Feedback')).toBeInTheDocument();
  });
});
