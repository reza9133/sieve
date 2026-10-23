import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { THEMES, useTheme, type Theme } from '@/theme/theme';

const icons: Record<Theme, ReactNode> = {
  light: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  dim: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />
    </svg>
  ),
};
const labels: Record<Theme, string> = { light: 'Light', dim: 'Dim', dark: 'Dark' };

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = THEMES[(i + d + THEMES.length) % THEMES.length];
    if (next) {
      setTheme(next);
      refs.current[THEMES.indexOf(next)]?.focus();
    }
  };
  return (
    <div role="radiogroup" aria-label="Colour theme" className="flex rounded-lg border border-border bg-surface p-0.5">
      {THEMES.map((t, i) => (
        <button
          key={t}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={theme === t}
          aria-label={`${labels[t]} theme`}
          title={`${labels[t]} theme`}
          tabIndex={theme === t ? 0 : -1}
          onClick={() => setTheme(t)}
          onKeyDown={(e) => onKey(e, i)}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${theme === t ? 'bg-accent text-on-accent' : 'text-muted hover:text-text'}`}
        >
          {icons[t]}
        </button>
      ))}
    </div>
  );
}
