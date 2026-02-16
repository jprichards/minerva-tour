'use client';

import { useState, useEffect, useCallback } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'mt-theme';

function getSystemDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(preference: ThemePreference) {
  if (typeof document === 'undefined') return;
  const isDark =
    preference === 'dark' || (preference === 'system' && getSystemDark());
  document.documentElement.classList.toggle('dark', isDark);
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>('system');

  // Read stored preference on mount
  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY) as ThemePreference | null;
    if (stored && ['system', 'light', 'dark'].includes(stored)) {
      setPreference(stored);
      applyTheme(stored);
    } else {
      applyTheme('system');
    }
  }, []);

  // Listen for system color scheme changes when in "system" mode
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [preference]);

  const setTheme = useCallback((next: ThemePreference) => {
    setPreference(next);
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }, []);

  const isDark =
    preference === 'dark' || (preference === 'system' && getSystemDark());

  return { preference, setTheme, isDark };
}
