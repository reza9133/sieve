import { useState } from 'react';
import { useTheme } from '@/theme/theme';

/** Sieve mark: ring and holes follow the text colour, the falling dots follow the accent. */
export function SieveMark({ className = 'h-8 w-8' }: { className?: string }) {
  const holes: Array<[number, number]> = [
    [26, 19],
    [38, 19],
    [20, 28],
    [32, 28],
    [44, 28],
    [26, 37],
    [38, 37],
  ];
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <circle cx="32" cy="28" r="22" fill="none" stroke="currentColor" strokeWidth="4.5" />
      {holes.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" fill="currentColor" />
      ))}
      <g style={{ fill: 'rgb(var(--accent))' }}>
        <circle cx="26" cy="52" r="2.6" />
        <circle cx="39" cy="55.5" r="2.1" opacity=".7" />
        <circle cx="32" cy="61" r="1.5" opacity=".45" />
      </g>
    </svg>
  );
}

export function SieveWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <SieveMark />
      <span className="font-display text-2xl font-bold leading-none tracking-tight">Sieve</span>
    </span>
  );
}

/**
 * The GenLayer mark lives in public/brand/genlayer-logo.svg (black, light theme) and
 * genlayer-logo-light.svg (white, dim and dark themes). Replace those files to update the logo.
 * If neither loads, a clearly marked placeholder is shown.
 */
export function GenLayerLogo({ className = 'h-6' }: { className?: string }) {
  const { theme } = useTheme();
  const sources = theme === 'light' ? ['/brand/genlayer-logo.svg'] : ['/brand/genlayer-logo-light.svg', '/brand/genlayer-logo.svg'];
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const src = sources.find((s) => !failed[s]);
  if (!src) {
    return (
      <span
        className="inline-flex items-center rounded border border-dashed border-warning px-2 py-0.5 text-xs text-warning"
        title="Drop the official SVG at public/brand/genlayer-logo.svg"
      >
        GenLayer logo missing
      </span>
    );
  }
  return <img key={src} src={src} alt="GenLayer" className={`w-auto ${className}`} onError={() => setFailed((f) => ({ ...f, [src]: true }))} />;
}
