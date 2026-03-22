import { describe, it, expect } from 'vitest';
import { evaluateFlag } from '@/lib/feature-flags';
import type { FeatureFlag } from '@/types/database';

function makeFlag(overrides: Partial<FeatureFlag> = {}): FeatureFlag {
  return {
    key: 'test-flag',
    description: 'Test flag',
    enabled: true,
    target_user_ids: [],
    target_roles: [],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    updated_by: null,
    ...overrides,
  };
}

describe('evaluateFlag', () => {
  it('returns false when flag is null', () => {
    expect(evaluateFlag(null, 'user-1', 'member')).toBe(false);
  });

  it('returns false when flag is undefined', () => {
    expect(evaluateFlag(undefined, 'user-1', 'member')).toBe(false);
  });

  it('returns false when flag is disabled', () => {
    const flag = makeFlag({ enabled: false });
    expect(evaluateFlag(flag, 'user-1', 'member')).toBe(false);
  });

  it('returns true when flag is enabled with no targeting (global rollout)', () => {
    const flag = makeFlag({ enabled: true });
    expect(evaluateFlag(flag, 'user-1', 'member')).toBe(true);
  });

  it('returns true for global rollout even without user context', () => {
    const flag = makeFlag({ enabled: true });
    expect(evaluateFlag(flag, null, null)).toBe(true);
  });

  // User targeting
  it('returns true when user is in target_user_ids', () => {
    const flag = makeFlag({ target_user_ids: ['user-1', 'user-2'] });
    expect(evaluateFlag(flag, 'user-1', 'member')).toBe(true);
  });

  it('returns false when user is not in target_user_ids', () => {
    const flag = makeFlag({ target_user_ids: ['user-2', 'user-3'] });
    expect(evaluateFlag(flag, 'user-1', 'member')).toBe(false);
  });

  it('returns false for user targeting with no userId', () => {
    const flag = makeFlag({ target_user_ids: ['user-1'] });
    expect(evaluateFlag(flag, null, 'member')).toBe(false);
  });

  // Role targeting
  it('returns true when user role matches target_roles', () => {
    const flag = makeFlag({ target_roles: ['admin', 'member'] });
    expect(evaluateFlag(flag, 'user-1', 'member')).toBe(true);
  });

  it('returns false when user role does not match target_roles', () => {
    const flag = makeFlag({ target_roles: ['admin'] });
    expect(evaluateFlag(flag, 'user-1', 'member')).toBe(false);
  });

  it('returns false for role targeting with no userRole', () => {
    const flag = makeFlag({ target_roles: ['admin'] });
    expect(evaluateFlag(flag, 'user-1', null)).toBe(false);
  });

  // Combined targeting (OR logic)
  it('returns true when user matches target_user_ids but not role', () => {
    const flag = makeFlag({
      target_user_ids: ['user-1'],
      target_roles: ['admin'],
    });
    expect(evaluateFlag(flag, 'user-1', 'member')).toBe(true);
  });

  it('returns true when user matches target_roles but not user_ids', () => {
    const flag = makeFlag({
      target_user_ids: ['user-99'],
      target_roles: ['member'],
    });
    expect(evaluateFlag(flag, 'user-1', 'member')).toBe(true);
  });

  it('returns false when user matches neither user_ids nor roles', () => {
    const flag = makeFlag({
      target_user_ids: ['user-99'],
      target_roles: ['admin'],
    });
    expect(evaluateFlag(flag, 'user-1', 'member')).toBe(false);
  });

  // Edge cases
  it('returns false when disabled even with matching targeting', () => {
    const flag = makeFlag({
      enabled: false,
      target_user_ids: ['user-1'],
      target_roles: ['member'],
    });
    expect(evaluateFlag(flag, 'user-1', 'member')).toBe(false);
  });

  it('handles empty string userId', () => {
    const flag = makeFlag({ target_user_ids: ['user-1'] });
    expect(evaluateFlag(flag, '', 'member')).toBe(false);
  });

  it('handles empty string userRole', () => {
    const flag = makeFlag({ target_roles: ['member'] });
    expect(evaluateFlag(flag, 'user-1', '')).toBe(false);
  });
});
