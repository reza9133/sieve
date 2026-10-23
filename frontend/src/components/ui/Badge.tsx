import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  neutral: 'border-border bg-surface-2 text-text',
  accent: 'border-accent/50 bg-accent/10 text-accent',
  success: 'border-success/50 bg-success/10 text-success',
  warning: 'border-warning/50 bg-warning/10 text-warning',
  danger: 'border-danger/50 bg-danger/10 text-danger',
};

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
