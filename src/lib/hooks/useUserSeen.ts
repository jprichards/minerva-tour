import { useEffect, useRef } from 'react';
import { useUser } from '@/lib/hooks/useUser';
import { logAuditEvent } from '@/lib/audit';

const LS_KEY = 'mt_last_seen_audit';
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Logs a `user_seen` audit event at most once per 24-hour window.
 * Uses localStorage to gate repeat calls across page loads.
 */
export function useUserSeen() {
  const { profile, loading } = useUser();
  const hasFired = useRef(false);

  useEffect(() => {
    if (loading || !profile || hasFired.current) return;
    hasFired.current = true;

    try {
      const last = localStorage.getItem(LS_KEY);
      if (last && Date.now() - Number(last) < TWENTY_FOUR_HOURS_MS) return;
    } catch {
      // localStorage unavailable (SSR, private browsing edge cases)
    }

    logAuditEvent('user_seen', 'user', profile.id, {});

    try {
      localStorage.setItem(LS_KEY, String(Date.now()));
    } catch {
      // best-effort
    }
  }, [loading, profile]);
}
