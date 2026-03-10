import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { logAuditEventMock } = vi.hoisted(() => ({
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'user-1' },
    loading: false,
  }),
}));

import { useUserSeen } from '@/lib/hooks/useUserSeen';

describe('useUserSeen', () => {
  let getItemSpy: ReturnType<typeof vi.spyOn>;
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
  });

  afterEach(() => {
    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  it('logs user_seen when no previous entry in localStorage', () => {
    renderHook(() => useUserSeen());

    expect(logAuditEventMock).toHaveBeenCalledWith('user_seen', 'user', 'user-1', {});
    expect(setItemSpy).toHaveBeenCalledWith('mt_last_seen_audit', expect.any(String));
  });

  it('skips logging when last seen is within 24 hours', () => {
    const recentTimestamp = String(Date.now() - 1000 * 60 * 60); // 1 hour ago
    getItemSpy.mockReturnValue(recentTimestamp);

    renderHook(() => useUserSeen());

    expect(logAuditEventMock).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('logs user_seen when last seen is older than 24 hours', () => {
    const staleTimestamp = String(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
    getItemSpy.mockReturnValue(staleTimestamp);

    renderHook(() => useUserSeen());

    expect(logAuditEventMock).toHaveBeenCalledWith('user_seen', 'user', 'user-1', {});
    expect(setItemSpy).toHaveBeenCalled();
  });

  it('does not fire twice on re-render', () => {
    const { rerender } = renderHook(() => useUserSeen());
    rerender();
    rerender();

    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
  });
});
