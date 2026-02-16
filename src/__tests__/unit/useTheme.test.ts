import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme, type ThemePreference } from '@/lib/hooks/useTheme';

describe('useTheme', () => {
  let mockMatchMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');

    mockMatchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to system preference', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe('system');
  });

  it('reads stored preference from localStorage', () => {
    localStorage.setItem('mt-theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe('dark');
  });

  it('ignores invalid localStorage values', () => {
    localStorage.setItem('mt-theme', 'banana');
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe('system');
  });

  it('setTheme persists to localStorage', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('dark'));
    expect(localStorage.getItem('mt-theme')).toBe('dark');
    expect(result.current.preference).toBe('dark');
  });

  it('applies dark class when preference is dark', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('dark'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes dark class when preference is light', () => {
    document.documentElement.classList.add('dark');
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('light'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('applies dark class in system mode when system prefers dark', () => {
    mockMatchMedia.mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('system'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(result.current.isDark).toBe(true);
  });

  it('does not apply dark class in system mode when system prefers light', () => {
    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('system'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(result.current.isDark).toBe(false);
  });

  it('isDark reflects current dark state for explicit dark', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('dark'));
    expect(result.current.isDark).toBe(true);
  });

  it('isDark reflects current light state for explicit light', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('light'));
    expect(result.current.isDark).toBe(false);
  });

  it('listens for system color-scheme changes in system mode', () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: addListener,
      removeEventListener: removeListener,
    });

    const { result, unmount } = renderHook(() => useTheme());
    act(() => result.current.setTheme('system'));

    expect(addListener).toHaveBeenCalledWith('change', expect.any(Function));
    unmount();
    expect(removeListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('cleans up system listener when switching away from system mode', () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: addListener,
      removeEventListener: removeListener,
    });

    const { result } = renderHook(() => useTheme());

    // Start in system mode - should add listener
    expect(addListener).toHaveBeenCalledWith('change', expect.any(Function));
    const handler = addListener.mock.calls[0][1];

    // Switch to explicit dark - should remove the system listener
    act(() => result.current.setTheme('dark'));
    expect(removeListener).toHaveBeenCalledWith('change', handler);
  });
});
