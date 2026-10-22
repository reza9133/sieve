/**
 * Input validation that strictly mirrors `contracts/sieve.py`.
 * The contract is always the final judge; client checks prevent wasted gas and 40-second finality waits.
 */

export const TENDER_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
export const HASH_REGEX = /^0x[0-9a-f]{64}$/
export const SALT_REGEX = /^[A-Za-z0-9_.~-]{16,64}$/
export const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/

export const MIN_BUDGET_WEI = 1000000000000000n // 10^15 = 0.001 GEN
export const MIN_BOND_WEI = 100000000000000n // 10^14 = 0.0001 GEN

export const MAX_ID = 64
export const MAX_TITLE = 120
export const MAX_SUMMARY = 600
export const MAX_URL = 512
export const MAX_REQUIREMENTS = 8
export const MAX_BIDS_LIMIT = 16

export const MIN_WINDOW_SEC = 120n
export const MAX_COMMIT_HORIZON_SEC = 30n * 24n * 60n * 60n // 30 days
export const MAX_REVEAL_WINDOW_SEC = 7n * 24n * 60n * 60n // 7 days

export interface ValidationResult {
  valid: boolean
  error?: string
}

export function validateTenderId(value: string): ValidationResult {
  const clean = value.trim()
  if (!clean) return { valid: false, error: 'Tender ID is required' }
  if (clean.length > MAX_ID) {
    return { valid: false, error: `Tender ID cannot exceed ${MAX_ID} characters` }
  }
  if (!TENDER_ID_REGEX.test(clean)) {
    return {
      valid: false,
      error:
        'Must start with alphanumeric and contain only letters, numbers, hyphens, dots, or underscores',
    }
  }
  return { valid: true }
}

export function validateTitle(value: string): ValidationResult {
  const clean = value.trim()
  if (!clean) return { valid: false, error: 'Title is required' }
  if (clean.length > MAX_TITLE) {
    return { valid: false, error: `Title cannot exceed ${MAX_TITLE} characters` }
  }
  return { valid: true }
}

export function validateSummary(value: string): ValidationResult {
  const clean = value.trim()
  if (!clean) return { valid: false, error: 'Summary is required' }
  if (clean.length > MAX_SUMMARY) {
    return { valid: false, error: `Summary cannot exceed ${MAX_SUMMARY} characters` }
  }
  return { valid: true }
}

export function validateHash(value: string): ValidationResult {
  const clean = value.trim().toLowerCase()
  if (!clean) return { valid: false, error: 'SHA-256 hash is required' }
  if (!HASH_REGEX.test(clean)) {
    return {
      valid: false,
      error: 'Must be "0x" followed by exactly 64 lowercase hexadecimal characters',
    }
  }
  return { valid: true }
}

export function validateSalt(value: string): ValidationResult {
  const clean = value.trim()
  if (!clean) return { valid: false, error: 'Salt is required' }
  if (!SALT_REGEX.test(clean)) {
    return {
      valid: false,
      error: 'Salt must be 16 to 64 characters from [A-Za-z0-9_.~-]',
    }
  }
  return { valid: true }
}

export function validateAddress(value: string): ValidationResult {
  const clean = value.trim()
  if (!clean) return { valid: false, error: 'Address is required' }
  if (!ETH_ADDRESS_REGEX.test(clean)) {
    return { valid: false, error: 'Must be a valid 42-character 0x-prefixed hex address' }
  }
  if (clean.toLowerCase() === '0x' + '0'.repeat(40)) {
    return { valid: false, error: 'Zero address is prohibited' }
  }
  return { valid: true }
}

/**
 * Validate URL strictly mirroring _host() in contracts/sieve.py
 */
export function validateHttpsUrl(url: string): ValidationResult {
  const text = url.trim()
  if (!text) return { valid: false, error: 'URL is required' }
  if (text.length > MAX_URL) {
    return { valid: false, error: `URL cannot exceed ${MAX_URL} characters` }
  }

  // Check control characters or whitespace
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code <= 32 || code === 127) {
      return { valid: false, error: 'URL contains whitespace or control characters' }
    }
  }

  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }

  if (parsed.protocol.toLowerCase() !== 'https:') {
    return { valid: false, error: 'URL must use HTTPS protocol' }
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URL cannot contain username or password' }
  }

  if (parsed.port && parsed.port !== '443') {
    return { valid: false, error: 'URL port must be omitted or 443' }
  }

  if (parsed.hash) {
    return { valid: false, error: 'URL cannot include a fragment identifier (#)' }
  }

  const hostname = (parsed.hostname || '').toLowerCase().replace(/\.+$/, '')
  if (!hostname) {
    return { valid: false, error: 'URL has empty hostname' }
  }

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.test')
  ) {
    return { valid: false, error: 'Localhost and internal hostnames are prohibited' }
  }

  // Check for IPv4 literal (e.g. 192.168.1.1)
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    return { valid: false, error: 'IP literal hostnames are prohibited' }
  }

  // Check for IPv6 literal (e.g. [::1])
  if (hostname.includes(':') || hostname.startsWith('[')) {
    return { valid: false, error: 'IPv6 literal hostnames are prohibited' }
  }

  // Validate labels
  const labels = hostname.split('.')
  if (hostname.length > 253 || labels.length < 2) {
    return { valid: false, error: 'Invalid hostname format or missing domain suffix' }
  }

  const tld = labels[labels.length - 1]
  if (!/^[a-z]{2,63}$/.test(tld)) {
    return { valid: false, error: 'Invalid top-level domain' }
  }

  for (const label of labels) {
    if (!label || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
      return { valid: false, error: `Invalid hostname label: "${label}"` }
    }
  }

  return { valid: true }
}

export function validateEconomics(budgetWei: bigint, bondWei: bigint): ValidationResult {
  if (budgetWei < MIN_BUDGET_WEI) {
    return { valid: false, error: 'Budget must be at least 0.001 GEN (10^15 wei)' }
  }
  if (bondWei < MIN_BOND_WEI) {
    return { valid: false, error: 'Bond must be at least 0.0001 GEN (10^14 wei)' }
  }
  if (bondWei > budgetWei) {
    return { valid: false, error: 'Bond cannot exceed the tender budget' }
  }
  return { valid: true }
}

export function validateLimits(requirementCount: number, maxBids: number): ValidationResult {
  if (!Number.isInteger(requirementCount) || requirementCount < 1 || requirementCount > MAX_REQUIREMENTS) {
    return { valid: false, error: `Requirement count must be an integer between 1 and ${MAX_REQUIREMENTS}` }
  }
  if (!Number.isInteger(maxBids) || maxBids < 1 || maxBids > MAX_BIDS_LIMIT) {
    return { valid: false, error: `Bid capacity (max bids) must be between 1 and ${MAX_BIDS_LIMIT}` }
  }
  return { valid: true }
}

/**
 * Validate deadlines relative to current time
 */
export function validateDeadlines(
  commitBySec: bigint,
  revealBySec: bigint,
  nowSec?: bigint
): ValidationResult {
  const now = nowSec ?? BigInt(Math.floor(Date.now() / 1000))

  if (commitBySec < now + MIN_WINDOW_SEC) {
    return { valid: false, error: 'Bidding window must remain open for at least 120 seconds' }
  }
  if (commitBySec > now + MAX_COMMIT_HORIZON_SEC) {
    return { valid: false, error: 'Bidding window cannot exceed 30 days from creation' }
  }
  if (revealBySec < commitBySec + MIN_WINDOW_SEC) {
    return { valid: false, error: 'Reveal window must be at least 120 seconds after commit deadline' }
  }
  if (revealBySec > commitBySec + MAX_REVEAL_WINDOW_SEC) {
    return { valid: false, error: 'Reveal window cannot exceed 7 days after commit deadline' }
  }

  return { valid: true }
}

/**
 * Decode failed_mask bitmask: bit i (0-indexed) = requirement number i+1 was `not_met`
 */
export function decodeFailedMask(failedMask: number, requirementCount: number): number[] {
  const failed: number[] = []
  for (let i = 0; i < requirementCount; i++) {
    if ((failedMask & (1 << i)) !== 0) {
      failed.push(i + 1)
    }
  }
  return failed
}
