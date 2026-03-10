'use client';

import { useUserSeen } from '@/lib/hooks/useUserSeen';

export default function UserActivityTracker() {
  useUserSeen();
  return null;
}
