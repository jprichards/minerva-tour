'use client';

import { useState, useEffect, useCallback } from 'react';

const ADMIN_MODE_KEY = 'mt-admin-mode';

/**
 * Hook to toggle between admin and member view.
 * Persists preference to localStorage.
 * When in "member" view, admin sees exactly what a regular member sees.
 */
export function useAdminMode() {
  const [isAdminView, setIsAdminView] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(ADMIN_MODE_KEY);
    if (stored !== null) {
      setIsAdminView(stored === 'true');
    }
  }, []);

  const toggleAdminMode = useCallback(() => {
    setIsAdminView((prev) => {
      const next = !prev;
      localStorage.setItem(ADMIN_MODE_KEY, String(next));
      return next;
    });
  }, []);

  return {
    isAdminView,
    toggleAdminMode,
  };
}
