'use client';

import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { evaluateFlag } from '@/lib/feature-flags';
import type { FeatureFlag } from '@/types/database';

const STORAGE_KEY = 'mt-feature-flags';

function loadCachedFlags(): FeatureFlag[] | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as FeatureFlag[];
  } catch {
    // Corrupted cache — ignore
  }
  return undefined;
}

function persistFlags(flags: FeatureFlag[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch {
    // Storage full or unavailable — ignore
  }
}

export function useFeatureFlag(key: string): { enabled: boolean; loading: boolean } {
  const supabase = createClient();
  const { authUser, profile } = useUser();

  const { data: flags, isLoading } = useSWR<FeatureFlag[]>(
    'feature-flags',
    async () => {
      const { data } = await supabase
        .from('feature_flags')
        .select('*')
        .order('key');

      const result = (data ?? []) as unknown as FeatureFlag[];
      persistFlags(result);
      return result;
    },
    {
      fallbackData: loadCachedFlags(),
      revalidateOnFocus: true,
      dedupingInterval: 30000,
    }
  );

  if (!flags) {
    return { enabled: false, loading: true };
  }

  const flag = flags.find((f) => f.key === key);
  const enabled = evaluateFlag(flag, authUser?.id, profile?.role);

  return { enabled, loading: isLoading };
}
