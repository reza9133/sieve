import { useId, useState, type DragEvent } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';
import { Notice } from '@/components/ui/Notice';
import { documentWarnings, hashFile, type FileHashResult } from '@/lib/hash';

/**
 * Byte-exact SHA-256 of a local file. Files are read in the browser and never uploaded.
 * `onHash` lets a form adopt the result.
 */
export function FileHasher({ onHash, label = 'Drop a file here, or choose one' }: { onHash?: (hash: string) => void; label?: string }) {
  const inputId = useId();
  const [result, setResult] = useState<FileHashResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const r = await hashFile(file);
      setResult(r);
      onHash?.(r.hash);
    } catch {
      setError('This file could not be read.');
    } finally {
      setBusy(false);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void handle(e.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-3">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-within:border-accent ${over ? 'border-accent bg-accent/10' : 'border-border hover:border-accent'}`}
      >
        <span className="font-medium">{busy ? 'Hashing…' : label}</span>
        <span className="text-sm text-muted">The file stays on this device.</span>
        <input id={inputId} type="file" className="sr-only" onChange={(e) => void handle(e.target.files?.[0])} />
      </label>
      {error && <Notice kind="danger">{error}</Notice>}
      {result && (
        <div className="surface space-y-2 p-4 text-sm">
          <p>
            <span className="text-muted">File</span> {result.name} ({result.bytes.toLocaleString()} bytes)
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-muted">SHA-256</span>
            <span className="mono break-all">{result.hash}</span>
            <CopyButton value={result.hash} />
          </p>
          {documentWarnings(result).map((w) => (
            <Notice key={w} kind="warning">
              {w}
            </Notice>
          ))}
        </div>
      )}
      <p className="text-sm text-muted">
        The hash covers the exact bytes. Converting line endings or re-saving the file changes it. Validators fetch the document over HTTPS, accept at
        most 30,000 bytes, and decode it as strict UTF-8, so host the same bytes you hash. Sieve does not fetch URLs for you.
      </p>
    </div>
  );
}
