/**
 * BigInt-safe unit conversions and formatting for GEN (18 decimals).
 * Never uses Number for financial values or overflowable timestamps.
 */

export const WEI_PER_GEN = 1000000000000000000n // 10^18
export const WEI_PER_MILLI_GEN = 1000000000000000n // 10^15
export const WEI_PER_MICRO_GEN = 1000000000000n // 10^12

/** Normalize any incoming representation (bigint, number, string) safely to BigInt */
export function toBigInt(value: bigint | number | string | null | undefined): bigint {
  if (value === null || value === undefined) return 0n
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new TypeError(`Cannot convert non-integer number ${value} to BigInt`)
    }
    return BigInt(value)
  }
  const str = String(value).trim()
  if (str === '' || str === '0x' || str === '0') return 0n
  // hex string
  if (str.startsWith('0x') || str.startsWith('0X')) {
    return BigInt(str)
  }
  return BigInt(str)
}

/**
 * Format a wei amount into a user-friendly GEN string with up to maxDecimals places.
 * Example: 2500000000000000n -> "0.0025 GEN"
 */
export function formatGEN(weiInput: bigint | number | string, maxDecimals = 6): string {
  const wei = toBigInt(weiInput)
  if (wei === 0n) return '0 GEN'

  const negative = wei < 0n
  const absWei = negative ? -wei : wei

  const whole = absWei / WEI_PER_GEN
  const remainder = absWei % WEI_PER_GEN

  const sign = negative ? '-' : ''

  if (remainder === 0n) {
    return `${sign}${whole.toString()} GEN`
  }

  const fracStr = remainder.toString().padStart(18, '0')
  const sliced = fracStr.slice(0, maxDecimals)
  const trimmed = sliced.replace(/0+$/, '')

  if (!trimmed) {
    return `${sign}${whole.toString()} GEN`
  }

  return `${sign}${whole.toString()}.${trimmed} GEN`
}

/**
 * Compact GEN formatter for tags and compact displays.
 */
export function formatGENCompact(weiInput: bigint | number | string): string {
  const wei = toBigInt(weiInput)
  if (wei === 0n) return '0 GEN'

  const absWei = wei < 0n ? -wei : wei

  if (absWei >= WEI_PER_GEN) {
    return formatGEN(wei, 4)
  }
  if (absWei >= WEI_PER_MILLI_GEN) {
    const mgen = absWei / WEI_PER_MILLI_GEN
    const remainder = absWei % WEI_PER_MILLI_GEN
    const remStr = remainder.toString().padStart(15, '0').slice(0, 2).replace(/0+$/, '')
    return `${wei < 0n ? '-' : ''}${mgen.toString()}${remStr ? '.' + remStr : ''} mGEN`
  }
  return `${wei.toString()} wei`
}

/**
 * Parse a decimal GEN string (e.g., "0.0025") into BigInt wei (e.g., 2500000000000000n).
 * Validates and throws a descriptive error on malformed input.
 */
export function parseGEN(input: string): bigint {
  const clean = input.trim().replace(/,/g, '')
  if (!clean) {
    throw new Error('GEN amount cannot be empty')
  }

  const match = clean.match(/^(\d+)(?:\.(\d+))?$/)
  if (!match) {
    throw new Error(`Invalid decimal GEN amount: "${input}"`)
  }

  const wholePart = match[1]
  const fracPart = match[2] || ''

  if (fracPart.length > 18) {
    throw new Error(`GEN amount has too many decimals (${fracPart.length} > 18)`)
  }

  const paddedFrac = fracPart.padEnd(18, '0')
  return BigInt(wholePart) * WEI_PER_GEN + BigInt(paddedFrac)
}

/** Shorten an address or hash: 0x1234...5678 */
export function shortenAddress(address: string, chars = 4): string {
  if (!address) return ''
  const clean = address.trim()
  if (clean.length <= chars * 2 + 2) return clean
  return `${clean.slice(0, chars + 2)}…${clean.slice(-chars)}`
}
