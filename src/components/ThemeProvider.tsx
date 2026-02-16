'use client';

import { createContext, useContext } from 'react';
import { useTheme, type ThemePreference } from '@/lib/hooks/useTheme';

interface ThemeContextValue {
  preference: ThemePreference;
  setTheme: (t: ThemePreference) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  setTheme: () => {},
  isDark: false,
});

export function useThemeContext() {
  return useContext(ThemeContext);
}

/**
 * Inline script injected into <head> to set the dark class before first paint.
 * This prevents a flash of the wrong theme on page load.
 */
export function ThemeScript() {
  const script = `
(function(){
  try {
    var p = localStorage.getItem('mt-theme') || 'system';
    var d = p === 'dark' || (p === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (d) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  } catch(e){}
})();
`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}
