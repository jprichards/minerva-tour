/**
 * iOS standalone (home screen) PWA session persistence.
 *
 * iOS WKWebView can evict document.cookie storage when the standalone app
 * process is killed, even though cookies have a long maxAge. localStorage
 * is preserved more reliably. This module backs up auth tokens to
 * localStorage so the session can be restored on next launch.
 */

const STORAGE_KEY = 'minerva-session-backup';

interface SessionBackup {
  access_token: string;
  refresh_token: string;
  backed_up_at: number;
}

export function backupSession(accessToken: string, refreshToken: string): void {
  try {
    const data: SessionBackup = {
      access_token: accessToken,
      refresh_token: refreshToken,
      backed_up_at: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable (private browsing, quota exceeded, etc.)
  }
}

export function getSessionBackup(): { access_token: string; refresh_token: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data: SessionBackup = JSON.parse(raw);
    if (!data.access_token || !data.refresh_token) return null;

    return { access_token: data.access_token, refresh_token: data.refresh_token };
  } catch {
    return null;
  }
}

export function clearSessionBackup(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable
  }
}

export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    ('standalone' in window.navigator && (window.navigator as Navigator & { standalone?: boolean }).standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}
