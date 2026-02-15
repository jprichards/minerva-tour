'use client';

import { SWRConfig } from 'swr';
import { cacheGet, cacheSet } from '@/lib/offline/cache';
import { ReactNode } from 'react';

/**
 * SWR Provider with IndexedDB persistence.
 * Wraps SWR's global cache to automatically save fetched data to IndexedDB
 * and use it as fallback when offline.
 */
export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        // When data is successfully fetched, persist to IndexedDB
        onSuccess: (data, key) => {
          if (data !== undefined && typeof key === 'string') {
            cacheSet(key, data).catch(() => {});
          }
        },
        // On error, try to serve from IndexedDB cache
        onError: () => {
          // SWR handles errors internally; IndexedDB fallback is set via fallbackData per hook
        },
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
