import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShareButton from '@/components/navigation/ShareButton';

describe('ShareButton', () => {
  const originalNavigator = { ...navigator };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://minerva-tour.app' },
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'share', {
      value: originalNavigator.share,
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: originalNavigator.clipboard,
      configurable: true,
    });
  });

  it('renders the share button with aria-label', () => {
    render(<ShareButton />);
    const button = screen.getByRole('button', { name: 'Share app' });
    expect(button).toBeInTheDocument();
  });

  it('calls navigator.share when available', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      value: shareMock,
      configurable: true,
    });

    render(<ShareButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Share app' }));

    await waitFor(() => {
      expect(shareMock).toHaveBeenCalledWith({
        title: 'Minerva Tour',
        text: 'Check out the Minerva Tour golf app!',
        url: 'https://minerva-tour.app',
      });
    });
  });

  it('falls back to clipboard when navigator.share is not available', async () => {
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      configurable: true,
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    render(<ShareButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Share app' }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('https://minerva-tour.app');
    });
  });

  it('shows "Copied!" feedback after clipboard copy', async () => {
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      configurable: true,
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    render(<ShareButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Share app' }));

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });

    vi.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(screen.queryByText('Copied!')).not.toBeInTheDocument();
    });
  });

  it('falls back to clipboard when navigator.share rejects (non-abort)', async () => {
    const shareMock = vi.fn().mockRejectedValue(new Error('Share failed'));
    Object.defineProperty(navigator, 'share', {
      value: shareMock,
      configurable: true,
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    render(<ShareButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Share app' }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('https://minerva-tour.app');
    });
  });

  it('does not fall back to clipboard when user cancels share (AbortError)', async () => {
    const abortError = new DOMException('Share canceled', 'AbortError');
    const shareMock = vi.fn().mockRejectedValue(abortError);
    Object.defineProperty(navigator, 'share', {
      value: shareMock,
      configurable: true,
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    render(<ShareButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Share app' }));

    await waitFor(() => {
      expect(shareMock).toHaveBeenCalled();
    });
    expect(writeTextMock).not.toHaveBeenCalled();
  });
});
