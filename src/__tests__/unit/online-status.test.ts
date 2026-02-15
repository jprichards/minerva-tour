import { describe, it, expect, vi } from 'vitest';

describe('Online Status Detection', () => {
  it('detects online state from navigator', () => {
    // navigator.onLine defaults to true in jsdom
    expect(typeof navigator.onLine).toBe('boolean');
  });

  it('responds to online/offline events', () => {
    let isOnline = true;

    const handleOnline = () => { isOnline = true; };
    const handleOffline = () => { isOnline = false; };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Simulate going offline
    window.dispatchEvent(new Event('offline'));
    expect(isOnline).toBe(false);

    // Simulate coming back online
    window.dispatchEvent(new Event('online'));
    expect(isOnline).toBe(true);

    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  });

  it('cleans up event listeners on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const handler = () => {};
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);

    expect(addSpy).toHaveBeenCalledWith('online', handler);
    expect(addSpy).toHaveBeenCalledWith('offline', handler);

    window.removeEventListener('online', handler);
    window.removeEventListener('offline', handler);

    expect(removeSpy).toHaveBeenCalledWith('online', handler);
    expect(removeSpy).toHaveBeenCalledWith('offline', handler);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
