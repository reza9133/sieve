import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { store } from '@/lib/storage';
import { THEME_KEY, ThemeContext, isTheme, resolveInitialTheme, type Theme } from './theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    return isTheme(attr) ? attr : resolveInitialTheme();
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    store.write(THEME_KEY, next);
    setThemeState(next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
