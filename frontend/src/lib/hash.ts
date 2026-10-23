import { MAX_DOC_BYTES } from './constants';
import { sha256Hex } from './commitment';

export interface FileHashResult {
  hash: string;
  bytes: number;
  name: string;
  tooLarge: boolean;
  validUtf8: boolean;
  empty: boolean;
}

/** Byte-exact SHA-256 of a file. Reads raw bytes: no newline or encoding conversion happens. */
export async function hashFile(file: Blob & { name?: string }): Promise<FileHashResult> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let validUtf8 = true;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    validUtf8 = false;
  }
  return {
    hash: await sha256Hex(bytes),
    bytes: bytes.length,
    name: file.name ?? 'file',
    tooLarge: bytes.length > MAX_DOC_BYTES,
    validUtf8,
    empty: bytes.length === 0,
  };
}

export async function hashText(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text));
}

export function documentWarnings(result: FileHashResult): string[] {
  const warnings: string[] = [];
  if (result.empty) warnings.push('The file is empty. Validators reject empty documents.');
  if (result.tooLarge)
    warnings.push(`The file is ${result.bytes} bytes. Validators accept at most ${MAX_DOC_BYTES}.`);
  if (!result.validUtf8)
    warnings.push('The file is not valid UTF-8. Validators decode strictly and will reject it.');
  return warnings;
}
