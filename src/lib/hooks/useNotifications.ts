'use client';

import { useEffect, useState, useCallback } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import type { Notification } from '@/types/database';

export function useNotifications(userId: string | undefined) {
  const supabase = createClient();

  const { data: notifications = [], isLoading, mutate } = useSWR<Notification[]>(
    userId ? ['notifications', userId] : null,
    async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(50);
      return (data as Notification[]) || [];
    },
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 3000,
    }
  );

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Subscribe to real-time changes
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const newNotif = payload.new as Notification;
          // Optimistically update SWR cache
          mutate((prev) => (prev ? [newNotif, ...prev] : [newNotif]), { revalidate: false });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, supabase, mutate]);

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    mutate(
      (prev) => prev?.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      { revalidate: false }
    );
  };

  const markAllAsRead = async () => {
    if (!userId) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
    mutate(
      (prev) => prev?.map((n) => ({ ...n, is_read: true })),
      { revalidate: false }
    );
  };

  const deleteNotification = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    mutate(
      (prev) => prev?.filter((n) => n.id !== id),
      { revalidate: false }
    );
  };

  return {
    notifications,
    unreadCount,
    loading: isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refresh: () => mutate(),
  };
}
