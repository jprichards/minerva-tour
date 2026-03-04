import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  backupSession,
  getSessionBackup,
  clearSessionBackup,
  isRunningStandalone,
} from '@/lib/session-persistence';

describe('session-persistence', () => {
  const mockStorage = new Map<string, string>();

  beforeEach(() => {
    mockStorage.clear();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => mockStorage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => mockStorage.set(key, value)),
      removeItem: vi.fn((key: string) => mockStorage.delete(key)),
    });
  });

  describe('backupSession', () => {
    it('stores access and refresh tokens in localStorage', () => {
      backupSession('access-123', 'refresh-456');

      const raw = mockStorage.get('minerva-session-backup');
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw!);
      expect(parsed.access_token).toBe('access-123');
      expect(parsed.refresh_token).toBe('refresh-456');
      expect(parsed.backed_up_at).toBeTypeOf('number');
    });

    it('overwrites previous backup', () => {
      backupSession('old-access', 'old-refresh');
      backupSession('new-access', 'new-refresh');

      const parsed = JSON.parse(mockStorage.get('minerva-session-backup')!);
      expect(parsed.access_token).toBe('new-access');
      expect(parsed.refresh_token).toBe('new-refresh');
    });

    it('does not throw if localStorage is unavailable', () => {
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(),
        setItem: vi.fn(() => { throw new Error('quota exceeded'); }),
        removeItem: vi.fn(),
      });

      expect(() => backupSession('a', 'b')).not.toThrow();
    });
  });

  describe('getSessionBackup', () => {
    it('returns null when no backup exists', () => {
      expect(getSessionBackup()).toBeNull();
    });

    it('returns tokens from a valid backup', () => {
      backupSession('access-abc', 'refresh-def');

      const result = getSessionBackup();
      expect(result).toEqual({
        access_token: 'access-abc',
        refresh_token: 'refresh-def',
      });
    });

    it('returns null for corrupted JSON', () => {
      mockStorage.set('minerva-session-backup', 'not-json');
      expect(getSessionBackup()).toBeNull();
    });

    it('returns null if tokens are missing from backup', () => {
      mockStorage.set('minerva-session-backup', JSON.stringify({ backed_up_at: Date.now() }));
      expect(getSessionBackup()).toBeNull();
    });
  });

  describe('clearSessionBackup', () => {
    it('removes the backup from localStorage', () => {
      backupSession('a', 'b');
      expect(mockStorage.has('minerva-session-backup')).toBe(true);

      clearSessionBackup();
      expect(mockStorage.has('minerva-session-backup')).toBe(false);
    });

    it('does not throw if localStorage is unavailable', () => {
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(() => { throw new Error('unavailable'); }),
      });

      expect(() => clearSessionBackup()).not.toThrow();
    });
  });

  describe('isRunningStandalone', () => {
    it('returns false when window is undefined', () => {
      const origWindow = globalThis.window;
      // @ts-expect-error - testing server environment
      delete globalThis.window;
      expect(isRunningStandalone()).toBe(false);
      globalThis.window = origWindow;
    });

    it('returns true when navigator.standalone is true (iOS)', () => {
      Object.defineProperty(window.navigator, 'standalone', {
        value: true,
        configurable: true,
      });
      expect(isRunningStandalone()).toBe(true);
      Object.defineProperty(window.navigator, 'standalone', {
        value: undefined,
        configurable: true,
      });
    });

    it('returns true when display-mode is standalone', () => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn().mockReturnValue({ matches: true });
      expect(isRunningStandalone()).toBe(true);
      window.matchMedia = originalMatchMedia;
    });

    it('returns false in normal browser mode', () => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn().mockReturnValue({ matches: false });
      expect(isRunningStandalone()).toBe(false);
      window.matchMedia = originalMatchMedia;
    });
  });
});
