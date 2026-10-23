import { useEffect, useState } from 'react';

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setDone(false), 1600);
    return () => window.clearTimeout(id);
  }, [done]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
    } catch {
      // Clipboard blocked: fall back to a selection the user can copy by hand.
      window.prompt('Copy this value', value);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${label}: ${done ? 'copied' : value.slice(0, 12)}`}
      className="rounded-md border border-border px-2 py-0.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
    >
      <span aria-live="polite">{done ? 'Copied' : label}</span>
    </button>
  );
}
