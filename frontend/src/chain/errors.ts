export interface ParsedError {
  /** Short, human-readable message. */
  message: string;
  /** Raw underlying text, shown in an expandable block. */
  details: string;
  kind: 'contract' | 'wallet-rejected' | 'wallet' | 'network' | 'unknown';
}

const TAG = /\[(EXPECTED|EXTERNAL|GENERIC|TRANSIENT)\]\s*([^\n\r"\\]*)/;

/** Collect every string reachable in a value (bounded depth) so we can find a contract error. */
export function collectStrings(value: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > 6 || out.length > 200) return out;
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, depth + 1, out));
  else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, depth + 1, out);
  }
  return out;
}

/** Pull "[EXPECTED] Bidding is closed" style messages out of any error or receipt-like value. */
export function extractContractMessage(value: unknown): string | null {
  for (const text of collectStrings(value)) {
    const match = TAG.exec(text);
    if (match && match[2]) return match[2].trim();
  }
  return null;
}

function rawText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
  } catch {
    return String(error);
  }
}

export function walletErrorCode(error: unknown): number | null {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === 'number') return code;
    if (typeof code === 'string' && /^-?\d+$/.test(code)) return Number(code);
  }
  return null;
}

export function parseError(error: unknown): ParsedError {
  const details = rawText(error);
  const code = walletErrorCode(error);
  if (code === 4001) {
    return { kind: 'wallet-rejected', message: 'You rejected the request in your wallet. Nothing was sent.', details };
  }
  const contract = extractContractMessage(error) ?? extractContractMessage(details);
  if (contract) return { kind: 'contract', message: contract, details };
  if (code === -32002)
    return { kind: 'wallet', message: 'Your wallet already has a pending request. Open it to continue.', details };
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (/fetch|network|timeout|ENOTFOUND|Failed to|429|Too Many/i.test(text))
    return { kind: 'network', message: 'The Studionet RPC could not be reached, or it is rate limiting. Try again in a moment.', details };
  if (text) return { kind: 'unknown', message: text.length > 220 ? `${text.slice(0, 217)}...` : text, details };
  return { kind: 'unknown', message: 'Something went wrong.', details };
}
