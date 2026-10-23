import type { ReactNode } from 'react';
import type { ParsedError } from '@/chain/errors';
import { Button } from './Button';

type Kind = 'info' | 'warning' | 'danger' | 'success';

const styles: Record<Kind, string> = {
  info: 'border-accent/40 bg-accent/5',
  warning: 'border-warning/50 bg-warning/10',
  danger: 'border-danger/50 bg-danger/10',
  success: 'border-success/50 bg-success/10',
};
const marks: Record<Kind, string> = { info: 'text-accent', warning: 'text-warning', danger: 'text-danger', success: 'text-success' };
const icons: Record<Kind, string> = { info: 'i', warning: '!', danger: '!', success: '✓' };

export function Notice({ kind = 'info', title, children }: { kind?: Kind; title?: string; children?: ReactNode }) {
  return (
    <div role={kind === 'danger' ? 'alert' : 'note'} className={`flex gap-3 rounded-lg border p-4 ${styles[kind]}`}>
      <span aria-hidden className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border border-current text-xs font-bold ${marks[kind]}`}>
        {icons[kind]}
      </span>
      <div className="min-w-0 text-sm leading-6">
        {title && <p className="font-semibold text-text">{title}</p>}
        {children && <div className="text-text">{children}</div>}
      </div>
    </div>
  );
}

/** An RPC or contract failure with a retry button and the raw text tucked into details. */
export function ErrorState({ error, onRetry, title = 'Could not load this' }: { error: ParsedError; onRetry?: () => void; title?: string }) {
  return (
    <div className="surface space-y-3 border-danger/40 p-5" role="alert">
      <p className="font-display text-lg">{title}</p>
      <p className="text-sm text-text">{error.message}</p>
      <details className="text-sm text-muted">
        <summary className="cursor-pointer">Details</summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 text-xs">{error.details}</pre>
      </details>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="surface flex flex-col items-start gap-3 p-6">
      <p className="font-display text-lg">{title}</p>
      {children && <div className="max-w-prose text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}
