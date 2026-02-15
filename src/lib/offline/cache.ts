/**
 * IndexedDB-backed offline cache using idb-keyval.
 * Provides persistent data storage for SWR fallback when offline.
 */
import { get, set, del, keys, clear } from 'idb-keyval';

const CACHE_PREFIX = 'mt-cache:';
const TTL_PREFIX = 'mt-ttl:';

// Default TTL: 24 hours
const DEFAULT_TTL = 24 * 60 * 60 * 1000;

/**
 * Store data in IndexedDB with optional TTL
 */
export async function cacheSet<T>(key: string, data: T, ttl: number = DEFAULT_TTL): Promise<void> {
  try {
    await set(`${CACHE_PREFIX}${key}`, data);
    await set(`${TTL_PREFIX}${key}`, Date.now() + ttl);
  } catch (error) {
    console.warn('IndexedDB cache set failed:', error);
  }
}

/**
 * Retrieve data from IndexedDB. Returns undefined if not found or expired.
 */
export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    const expiry = await get<number>(`${TTL_PREFIX}${key}`);
    if (expiry && Date.now() > expiry) {
      // Expired - clean up
      await del(`${CACHE_PREFIX}${key}`);
      await del(`${TTL_PREFIX}${key}`);
      return undefined;
    }
    return await get<T>(`${CACHE_PREFIX}${key}`);
  } catch (error) {
    console.warn('IndexedDB cache get failed:', error);
    return undefined;
  }
}

/**
 * Remove a specific key from the cache
 */
export async function cacheRemove(key: string): Promise<void> {
  try {
    await del(`${CACHE_PREFIX}${key}`);
    await del(`${TTL_PREFIX}${key}`);
  } catch (error) {
    console.warn('IndexedDB cache remove failed:', error);
  }
}

/**
 * Clear all cached data
 */
export async function cacheClear(): Promise<void> {
  try {
    const allKeys = await keys();
    const cacheKeys = allKeys.filter(
      (k) => typeof k === 'string' && (k.startsWith(CACHE_PREFIX) || k.startsWith(TTL_PREFIX))
    );
    await Promise.all(cacheKeys.map((k) => del(k)));
  } catch (error) {
    console.warn('IndexedDB cache clear failed:', error);
  }
}

/**
 * SWR middleware that persists data to IndexedDB.
 * Use as: useSWR(key, fetcher, { use: [offlineCacheMiddleware] })
 * Or integrate via the SWRConfig provider.
 */
export function createSWRCacheProvider() {
  const map = new Map();

  return {
    provider: () => map,
    onSuccess: async (data: unknown, key: string) => {
      if (data !== undefined) {
        await cacheSet(key, data);
      }
    },
    fallback: async (key: string) => {
      return await cacheGet(key);
    },
  };
}
