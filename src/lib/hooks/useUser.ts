'use client';

import { useEffect, useState, useCallback } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@/types/database';
import type { User as AuthUser } from '@supabase/supabase-js';

export function useUser() {
  const supabase = createClient();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Step 1: Resolve auth user once
  useEffect(() => {
    const getAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setAuthUser(user);
      } catch {
        setAuthUser(null);
      } finally {
        setAuthReady(true);
      }
    };
    getAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      if (!session?.user) {
        // Clear SWR cache when signed out
        mutateProfile(undefined, { revalidate: false });
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Step 2: SWR for user profile — cached across navigations
  const { data: profile, isLoading: profileLoading, mutate: mutateProfile } = useSWR<User | null>(
    authUser?.id ? ['user-profile', authUser.id] : null,
    async () => {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser!.id)
        .single();
      return data;
    },
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
    }
  );

  const loading = !authReady || (!!authUser && profileLoading);

  const isAdmin = profile?.role === 'admin';
  const isMember = profile?.role === 'member' || isAdmin;
  const isPlayingGuest = profile?.role === 'playing_guest';
  const isAuthenticated = !!authUser;

  return {
    authUser,
    profile: profile ?? null,
    loading,
    isAdmin,
    isMember,
    isPlayingGuest,
    isAuthenticated,
  };
}
