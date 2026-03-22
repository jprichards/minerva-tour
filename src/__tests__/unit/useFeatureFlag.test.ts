import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { mockSupabaseClient } from '../setup';

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    authUser: { id: 'user-1' },
    profile: { id: 'user-1', role: 'member' },
    loading: false,
    isAdmin: false,
  }),
}));

const mockFlags = [
  {
    key: 'enabled-global',
    description: '',
    enabled: true,
    target_user_ids: [],
    target_roles: [],
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    updated_by: null,
  },
  {
    key: 'disabled-flag',
    description: '',
    enabled: false,
    target_user_ids: [],
    target_roles: [],
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    updated_by: null,
  },
  {
    key: 'user-targeted',
    description: '',
    enabled: true,
    target_user_ids: ['user-1'],
    target_roles: [],
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    updated_by: null,
  },
  {
    key: 'role-targeted',
    description: '',
    enabled: true,
    target_user_ids: [],
    target_roles: ['admin'],
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    updated_by: null,
  },
];

describe('useFeatureFlag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    localStorage.clear();

    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockFlags, error: null }),
    });
  });

  it('returns enabled:true for a globally enabled flag', async () => {
    const { useFeatureFlag } = await import('@/lib/hooks/useFeatureFlag');
    const { result } = renderHook(() => useFeatureFlag('enabled-global'));

    await waitFor(() => {
      expect(result.current.enabled).toBe(true);
    });
  });

  it('returns enabled:false for a disabled flag', async () => {
    const { useFeatureFlag } = await import('@/lib/hooks/useFeatureFlag');
    const { result } = renderHook(() => useFeatureFlag('disabled-flag'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.enabled).toBe(false);
  });

  it('returns enabled:true when current user is in target_user_ids', async () => {
    const { useFeatureFlag } = await import('@/lib/hooks/useFeatureFlag');
    const { result } = renderHook(() => useFeatureFlag('user-targeted'));

    await waitFor(() => {
      expect(result.current.enabled).toBe(true);
    });
  });

  it('returns enabled:false when current user role does not match target_roles', async () => {
    const { useFeatureFlag } = await import('@/lib/hooks/useFeatureFlag');
    const { result } = renderHook(() => useFeatureFlag('role-targeted'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.enabled).toBe(false);
  });

  it('returns enabled:false for a nonexistent flag', async () => {
    const { useFeatureFlag } = await import('@/lib/hooks/useFeatureFlag');
    const { result } = renderHook(() => useFeatureFlag('does-not-exist'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.enabled).toBe(false);
  });
});
