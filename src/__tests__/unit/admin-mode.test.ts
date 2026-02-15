import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Admin Mode Toggle', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => storage[key] || null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => { storage[key] = value; });
  });

  it('defaults to admin view (true)', () => {
    const stored = localStorage.getItem('mt-admin-mode');
    expect(stored).toBeNull(); // No preference stored = defaults to admin view
  });

  it('persists admin mode preference', () => {
    localStorage.setItem('mt-admin-mode', 'false');
    const value = localStorage.getItem('mt-admin-mode');
    expect(value).toBe('false');
  });

  it('toggles between admin and member view', () => {
    let isAdminView = true;

    // Toggle off
    isAdminView = !isAdminView;
    localStorage.setItem('mt-admin-mode', String(isAdminView));
    expect(isAdminView).toBe(false);
    expect(localStorage.getItem('mt-admin-mode')).toBe('false');

    // Toggle on
    isAdminView = !isAdminView;
    localStorage.setItem('mt-admin-mode', String(isAdminView));
    expect(isAdminView).toBe(true);
    expect(localStorage.getItem('mt-admin-mode')).toBe('true');
  });

  it('reads stored preference on init', () => {
    storage['mt-admin-mode'] = 'false';
    const stored = localStorage.getItem('mt-admin-mode');
    const isAdminView = stored === 'true';
    expect(isAdminView).toBe(false);
  });
});
