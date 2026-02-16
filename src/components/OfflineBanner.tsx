'use client';

import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, Check } from 'lucide-react';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { getPendingCount, flushQueue } from '@/lib/offline/sync-queue';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch: only render after client mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Poll pending count
  useEffect(() => {
    const checkPending = async () => {
      try {
        const count = await getPendingCount();
        setPendingCount(count);
      } catch {
        // IndexedDB not available
      }
    };

    checkPending();
    const interval = setInterval(checkPending, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !syncing) {
      handleSync();
    }
  }, [isOnline, pendingCount]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await flushQueue();
      if (result.synced > 0) {
        setJustSynced(true);
        setTimeout(() => setJustSynced(false), 3000);
      }
      const count = await getPendingCount();
      setPendingCount(count);
    } catch {
      // Sync failed
    } finally {
      setSyncing(false);
    }
  };

  // Don't render on server to avoid hydration mismatch
  if (!mounted) return null;

  // Show nothing if online and no pending
  if (isOnline && pendingCount === 0 && !justSynced) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-gray-800 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm">
          <WifiOff className="w-4 h-4" />
          <span>You&apos;re offline — scores will sync when you reconnect</span>
        </div>
      )}

      {/* Pending Sync Indicator */}
      {pendingCount > 0 && isOnline && !syncing && (
        <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" />
          <span>{pendingCount} score{pendingCount !== 1 ? 's' : ''} pending sync</span>
          <button
            onClick={handleSync}
            className="ml-2 bg-white/20 rounded-lg px-3 py-0.5 text-xs font-medium hover:bg-white/30 transition-colors"
          >
            Sync now
          </button>
        </div>
      )}

      {/* Syncing Indicator */}
      {syncing && (
        <div className="bg-blue-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Syncing scores...</span>
        </div>
      )}

      {/* Pending when offline */}
      {!isOnline && pendingCount > 0 && (
        <div className="bg-amber-600 text-white px-4 py-1 flex items-center justify-center gap-2 text-xs">
          <span>{pendingCount} score{pendingCount !== 1 ? 's' : ''} saved — will sync when back online</span>
        </div>
      )}

      {/* Success indicator */}
      {justSynced && (
        <div className="bg-green-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm animate-fade-in">
          <Check className="w-4 h-4" />
          <span>All scores synced successfully!</span>
        </div>
      )}
    </div>
  );
}
