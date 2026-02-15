import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock idb-keyval
const store = new Map();
vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(store.get(key))),
  set: vi.fn((key: string, val: unknown) => { store.set(key, val); return Promise.resolve(); }),
  del: vi.fn((key: string) => { store.delete(key); return Promise.resolve(); }),
  keys: vi.fn(() => Promise.resolve(Array.from(store.keys()))),
  clear: vi.fn(() => { store.clear(); return Promise.resolve(); }),
}));

import { cacheSet, cacheGet, cacheRemove, cacheClear } from '@/lib/offline/cache';

describe('Offline Cache (IndexedDB)', () => {
  beforeEach(() => {
    store.clear();
  });

  it('stores and retrieves data', async () => {
    await cacheSet('test-key', { name: 'Test Data' });
    const result = await cacheGet<{ name: string }>('test-key');
    expect(result).toEqual({ name: 'Test Data' });
  });

  it('returns undefined for non-existent key', async () => {
    const result = await cacheGet('non-existent');
    expect(result).toBeUndefined();
  });

  it('returns undefined for expired data', async () => {
    // Set with a TTL that's already expired (negative)
    await cacheSet('expired-key', { data: 'old' }, -1000);
    
    // Manually set the TTL to past
    store.set('mt-ttl:expired-key', Date.now() - 1000);
    
    const result = await cacheGet('expired-key');
    expect(result).toBeUndefined();
  });

  it('removes cached data', async () => {
    await cacheSet('remove-key', 'some data');
    await cacheRemove('remove-key');
    const result = await cacheGet('remove-key');
    expect(result).toBeUndefined();
  });

  it('clears all cached data', async () => {
    await cacheSet('key1', 'data1');
    await cacheSet('key2', 'data2');
    await cacheClear();
    
    const result1 = await cacheGet('key1');
    const result2 = await cacheGet('key2');
    expect(result1).toBeUndefined();
    expect(result2).toBeUndefined();
  });

  it('stores with correct key prefixes', async () => {
    await cacheSet('user-profile', { id: '1' });
    
    expect(store.has('mt-cache:user-profile')).toBe(true);
    expect(store.has('mt-ttl:user-profile')).toBe(true);
  });

  it('handles array data', async () => {
    const courses = [
      { id: '1', name: 'Course A' },
      { id: '2', name: 'Course B' },
    ];
    await cacheSet('courses', courses);
    const result = await cacheGet<typeof courses>('courses');
    expect(result).toEqual(courses);
  });
});
