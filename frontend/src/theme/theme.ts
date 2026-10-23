import { createContext, useContext, useEffect, useState } from 'react';
import { store } from '@/lib/storage';

export type Theme = 'light' | 'dim' | 'dark';
export const THEMES: Theme[] = ['light', 'dim', 'dark'];
export const THEME_KEY = 'theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dim' || value === 'dark';
}

/** Saved choice first; otherwise follow the OS preference. Mirrors the inline script in index.html. */
export function resolveInitialTheme(): Theme {
  const saved = store.read(THEME_KEY);
  if (isTheme(saved)) return saved;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

export interface SceneTokens {
  accent: string;
  accent2: string;
  danger: string;
  success: string;
  text: string;
  bg: string;
  glow: number;
  metal: number;
}

const rgbToCss = (triplet: string) => `rgb(${triplet.trim().split(/\s+/).join(',')})`;

/** Read the active theme's CSS variables so 3D materials never hardcode colour. */
export function readSceneTokens(): SceneTokens {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    accent: rgbToCss(get('--accent', '0 124 118')),
    accent2: rgbToCss(get('--accent-2', '91 63 214')),
    danger: rgbToCss(get('--danger', '185 28 28')),
    success: rgbToCss(get('--success', '21 128 61')),
    text: rgbToCss(get('--text', '20 27 45')),
    bg: rgbToCss(get('--bg', '243 246 249')),
    glow: Number(get('--scene-glow', '0')) || 0,
    metal: Number(get('--scene-metal', '0.5')) || 0,
  };
}

/** Scene tokens that update whenever the theme changes. */
export function useSceneTokens(): SceneTokens {
  const { theme } = useTheme();
  const [tokens, setTokens] = useState<SceneTokens>(() => readSceneTokens());
  useEffect(() => {
    // data-theme is applied in an effect; read on the next frame so the new variables are live.
    const id = requestAnimationFrame(() => setTokens(readSceneTokens()));
    return () => cancelAnimationFrame(id);
  }, [theme]);
  return tokens;
}
