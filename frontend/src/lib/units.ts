import { WEI_PER_GEN } from './constants';

/** Parse a decimal GEN string ("0.0025") into wei. Returns null when the text is not a plain decimal. */
export function parseGen(input: string): bigint | null {
  const text = input.trim();
  if (!/^\d+(\.\d{0,18})?$/.test(text) && !/^\.\d{1,18}$/.test(text)) return null;
  const [whole = '0', frac = ''] = text.split('.');
  const wei = BigInt(whole === '' ? '0' : whole) * WEI_PER_GEN + BigInt(frac.padEnd(18, '0') || '0');
  return wei;
}

export interface FormatOptions {
  /** Maximum fraction digits to show. Truncates (never rounds up). Default: all significant digits. */
  maxDecimals?: number;
}

/** Format wei as a GEN decimal string without symbol. Exact, BigInt-only. */
export function formatGen(wei: bigint, options: FormatOptions = {}): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const whole = abs / WEI_PER_GEN;
  let frac = (abs % WEI_PER_GEN).toString().padStart(18, '0');
  const max = options.maxDecimals;
  let truncatedToZero = false;
  if (max !== undefined && max < 18) {
    const kept = frac.slice(0, max);
    truncatedToZero = abs > 0n && whole === 0n && /^0*$/.test(kept);
    frac = kept;
  }
  frac = frac.replace(/0+$/, '');
  if (truncatedToZero) return `<0.${'0'.repeat(Math.max(0, (max ?? 1) - 1))}1`;
  const wholeText = groupThousands(whole.toString());
  return `${negative ? '-' : ''}${wholeText}${frac ? `.${frac}` : ''}`;
}

export function formatGenSymbol(wei: bigint, options: FormatOptions = {}): string {
  return `${formatGen(wei, options)} GEN`;
}

/** Integer wei with thousands separators, for exact display. */
export function formatWei(wei: bigint): string {
  return `${groupThousands(wei.toString())} wei`;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
