'use client';

import useSWR, { SWRConfiguration, KeyedMutator } from 'swr';
import { createClient } from '@/lib/supabase/client';

/**
 * Generic SWR wrapper for Supabase queries.
 * Provides instant cached data on revisits, background revalidation,
 * and deduplication of in-flight requests.
 *
 * @param key - SWR cache key (null to skip fetching)
 * @param fetcher - Async function that uses the Supabase client to fetch data
 * @param config - Additional SWR configuration
 *
 * @example
 * const { data, isLoading } = useSupabaseQuery(
 *   profile?.id ? ['user-profile', profile.id] : null,
 *   async (supabase) => {
 *     const { data } = await supabase.from('users').select('*').eq('id', profile.id).single();
 *     return data;
 *   }
 * );
 */
export function useSupabaseQuery<T = unknown>(
  key: string | (string | undefined | null)[] | null,
  fetcher: (supabase: ReturnType<typeof createClient>) => Promise<T>,
  config?: SWRConfiguration<T>
): {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  isValidating: boolean;
  mutate: KeyedMutator<T>;
} {
  const supabase = createClient();

  const result = useSWR<T>(
    key,
    () => fetcher(supabase),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 2000, // Deduplicate requests within 2s
      ...config,
    }
  );

  return {
    data: result.data,
    error: result.error,
    isLoading: result.isLoading,
    isValidating: result.isValidating,
    mutate: result.mutate,
  };
}
