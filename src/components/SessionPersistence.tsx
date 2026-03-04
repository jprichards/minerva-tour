'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { backupSession, clearSessionBackup } from '@/lib/session-persistence';

/**
 * Automatically backs up the Supabase auth session to localStorage
 * whenever it changes. This allows session recovery on iOS standalone
 * PWAs where cookies can be lost between launches.
 *
 * Mount once in the root layout.
 */
export function SessionPersistence() {
  useEffect(() => {
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.access_token && session?.refresh_token) {
        backupSession(session.access_token, session.refresh_token);
      }

      if (event === 'SIGNED_OUT') {
        clearSessionBackup();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
