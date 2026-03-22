import type { FeatureFlag, UserRole } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Central registry of all feature flag keys.
 * Always use these constants instead of raw strings to prevent typos.
 *
 * Add new entries here when creating a flag, remove when cleaning up.
 */
export const FEATURE_FLAGS = {
  // Example: STATS_V2: 'stats-v2',
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/**
 * Pure function that evaluates whether a flag is enabled for a given user.
 * Extracted for testability — no side effects, no DB calls.
 */
export function evaluateFlag(
  flag: FeatureFlag | null | undefined,
  userId?: string | null,
  userRole?: UserRole | string | null
): boolean {
  if (!flag || !flag.enabled) return false;

  const hasUserTargeting = flag.target_user_ids.length > 0;
  const hasRoleTargeting = flag.target_roles.length > 0;

  if (!hasUserTargeting && !hasRoleTargeting) return true;

  if (hasUserTargeting && userId && flag.target_user_ids.includes(userId)) {
    return true;
  }

  if (hasRoleTargeting && userRole && flag.target_roles.includes(userRole)) {
    return true;
  }

  return false;
}

/**
 * Server-side feature flag check for API routes and server components.
 * Makes a fresh DB query each call (no caching) so kill switches take effect immediately.
 */
export async function isFeatureEnabled(
  supabase: SupabaseClient,
  key: string,
  userId?: string
): Promise<boolean> {
  const { data: flag } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('key', key)
    .single();

  if (!flag) return false;

  const typedFlag = flag as unknown as FeatureFlag;

  if (!typedFlag.enabled) return false;

  const hasUserTargeting = typedFlag.target_user_ids.length > 0;
  const hasRoleTargeting = typedFlag.target_roles.length > 0;

  if (!hasUserTargeting && !hasRoleTargeting) return true;

  if (!userId) return false;

  if (hasUserTargeting && typedFlag.target_user_ids.includes(userId)) {
    return true;
  }

  if (hasRoleTargeting) {
    const { data: userRow } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userRow && typedFlag.target_roles.includes(userRow.role)) {
      return true;
    }
  }

  return false;
}
