'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/hooks/useUser';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { isPushSupported, getPermissionStatus, subscribeToPush, unsubscribeFromPush, isSubscribedToPush } from '@/lib/push-notifications';
import { ArrowLeft, Bell, BellOff, BellRing, Check, CheckCheck, Trash2, Calendar, Trophy, TrendingUp, MessageSquare, Target } from 'lucide-react';
import type { NotificationType } from '@/types/database';

const typeIcons: Record<NotificationType, typeof Bell> = {
  event_start: Calendar,
  event_end: Calendar,
  score_posted: Target,
  handicap_update: TrendingUp,
  admin_message: MessageSquare,
  season_mode: Calendar,
  tournament: Trophy,
  general: Bell,
};

const typeColors: Record<NotificationType, string> = {
  event_start: 'bg-emerald-100 text-emerald-600',
  event_end: 'bg-gray-100 text-gray-600',
  score_posted: 'bg-blue-100 text-blue-600',
  handicap_update: 'bg-purple-100 text-purple-600',
  admin_message: 'bg-red-100 text-red-600',
  season_mode: 'bg-amber-100 text-amber-600',
  tournament: 'bg-yellow-100 text-yellow-600',
  general: 'bg-gray-100 text-gray-600',
};

export default function NotificationsPage() {
  const router = useRouter();
  const { profile } = useUser();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification } = useNotifications(profile?.id);

  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushPermission, setPushPermission] = useState<string>('default');

  useEffect(() => {
    setPushSupported(isPushSupported());
    setPushPermission(getPermissionStatus());
    isSubscribedToPush().then(setPushSubscribed).catch(() => {});
  }, []);

  const handleTogglePush = async () => {
    if (pushSubscribed) {
      const success = await unsubscribeFromPush();
      if (success) setPushSubscribed(false);
    } else {
      // In production, this key would come from the server/env
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
      if (!vapidKey) {
        // For now, just request permission
        const permission = await Notification.requestPermission();
        setPushPermission(permission);
        return;
      }
      const subscription = await subscribeToPush(vapidKey);
      if (subscription) setPushSubscribed(true);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-1 text-xs text-emerald-600 font-medium"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {/* Push Notification Opt-in */}
      {pushSupported && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                pushSubscribed ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'
              }`}>
                <BellRing className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Push Notifications</p>
                <p className="text-xs text-gray-500">
                  {pushPermission === 'denied'
                    ? 'Blocked in browser settings'
                    : pushSubscribed
                    ? 'Enabled — you\'ll get alerts for events and scores'
                    : 'Get notified when events open, scores are posted, and more'}
                </p>
              </div>
            </div>
            <button
              onClick={handleTogglePush}
              disabled={pushPermission === 'denied'}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pushSubscribed
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {pushSubscribed ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12">
          <BellOff className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No notifications yet.</p>
          <p className="text-xs text-gray-400 mt-1">You'll be notified about events, scores, and updates.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => {
            const Icon = typeIcons[notif.type as NotificationType] || Bell;
            const colorClass = typeColors[notif.type as NotificationType] || typeColors.general;
            const timeAgo = getTimeAgo(notif.created_at);

            return (
              <div
                key={notif.id}
                className={`flex gap-3 p-3 rounded-xl border transition-colors ${
                  notif.is_read
                    ? 'bg-white border-gray-100'
                    : 'bg-blue-50/50 border-blue-100'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="cursor-pointer"
                    onClick={() => {
                      if (!notif.is_read) markAsRead(notif.id);
                      if (notif.link) router.push(notif.link);
                    }}
                  >
                    <p className={`text-sm ${notif.is_read ? 'text-gray-700' : 'text-gray-900 font-semibold'}`}>
                      {notif.title}
                    </p>
                    {notif.body && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.body}</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">{timeAgo}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  {!notif.is_read && (
                    <button
                      onClick={() => markAsRead(notif.id)}
                      className="p-1 hover:bg-gray-100 rounded"
                      title="Mark as read"
                    >
                      <Check className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteNotification(notif.id)}
                    className="p-1 hover:bg-red-50 rounded"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
