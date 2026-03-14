'use client';

import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_BUCKET_RANGES, type BucketRange } from '@/lib/chirps';

export function useChirpBucketConfig() {
  const supabase = createClient();

  const { data, isLoading, mutate } = useSWR<BucketRange[]>(
    'chirp-bucket-ranges',
    async () => {
      const { data: setting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'chirp_bucket_ranges')
        .single();

      if (!setting?.value) return DEFAULT_BUCKET_RANGES;

      const stored = (setting.value as unknown as { ranges: BucketRange[] })?.ranges;
      if (!Array.isArray(stored) || stored.length !== 8) return DEFAULT_BUCKET_RANGES;
      return stored;
    },
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  const save = async (ranges: BucketRange[]) => {
    const { error } = await supabase.from('app_settings').upsert({
      key: 'chirp_bucket_ranges',
      value: { ranges } as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;
    await mutate(ranges, false);
  };

  return {
    ranges: data ?? DEFAULT_BUCKET_RANGES,
    isLoading,
    save,
  };
}
