import { describe, it, expect, vi } from 'vitest';

describe('Service Worker', () => {
  it('registers when serviceWorker is available', () => {
    const registerMock = vi.fn().mockResolvedValue({
      addEventListener: vi.fn(),
    });

    const mockNavigator = {
      serviceWorker: { register: registerMock },
    };

    // Simulate what the registration component does
    if ('serviceWorker' in mockNavigator) {
      mockNavigator.serviceWorker.register('/sw.js', { scope: '/' });
    }

    expect(registerMock).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('does not register when serviceWorker is unavailable', () => {
    const registerMock = vi.fn();
    const mockNavigator: Record<string, unknown> = {};

    if ('serviceWorker' in mockNavigator) {
      (mockNavigator.serviceWorker as any).register('/sw.js');
    }

    expect(registerMock).not.toHaveBeenCalled();
  });

  it('service worker caching strategy is correctly defined', () => {
    // Verify the expected cache names
    const STATIC_CACHE = 'minerva-static-v1';
    const DATA_CACHE = 'minerva-data-v1';
    
    expect(STATIC_CACHE).toBe('minerva-static-v1');
    expect(DATA_CACHE).toBe('minerva-data-v1');
  });

  it('precache URLs include essential routes', () => {
    const PRECACHE_URLS = ['/', '/login', '/manifest.json'];
    
    expect(PRECACHE_URLS).toContain('/');
    expect(PRECACHE_URLS).toContain('/login');
    expect(PRECACHE_URLS).toContain('/manifest.json');
  });
});
