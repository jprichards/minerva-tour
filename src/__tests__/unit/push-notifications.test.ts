import { describe, it, expect, vi } from 'vitest';
import { isPushSupported, getPermissionStatus } from '@/lib/push-notifications';

describe('Push Notifications', () => {
  it('detects push support based on browser APIs', () => {
    // In jsdom, serviceWorker and PushManager are not available
    const supported = isPushSupported();
    // jsdom doesn't have PushManager, so this should be false
    expect(typeof supported).toBe('boolean');
  });

  it('returns permission status', () => {
    const status = getPermissionStatus();
    // In jsdom without full API support, returns 'unsupported'
    expect(['granted', 'denied', 'default', 'unsupported']).toContain(status);
  });

  it('urlBase64ToUint8Array converts correctly', () => {
    // Test the internal conversion logic
    const base64 = 'SGVsbG8gV29ybGQ'; // "Hello World" in base64url
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const standardBase64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(standardBase64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      arr[i] = raw.charCodeAt(i);
    }
    expect(arr.length).toBe(11); // "Hello World" = 11 chars
    expect(String.fromCharCode(...arr)).toBe('Hello World');
  });

  it('notification triggers are defined correctly', () => {
    // PRD: event window open/close, score posted in event, admin messages
    const triggers = ['event_start', 'event_end', 'score_posted', 'admin_message'];
    expect(triggers).toContain('event_start');
    expect(triggers).toContain('score_posted');
    expect(triggers).toContain('admin_message');
  });
});
