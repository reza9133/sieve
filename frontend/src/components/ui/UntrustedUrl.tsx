import { validateHttpsUrl } from '@/lib/validation';
import { CopyButton } from './CopyButton';

/** A URL from chain data: shown as plain text; opening it is an explicit, separate action. */
export function UntrustedUrl({ url }: { url: string }) {
  if (!url) return <span className="text-muted">none</span>;
  const safe = validateHttpsUrl(url) === null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="mono break-all">{url}</span>
      <CopyButton value={url} />
      {safe && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="rounded-md border border-border px-2 py-0.5 text-xs text-accent hover:border-accent"
        >
          Open link
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </span>
  );
}
