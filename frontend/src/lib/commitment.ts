/**
 * Client-side commitment computation for Sieve sealed bids.
 *
 * Byte-exact mirror of `commitment()` in `scripts/sieve_tools.py` and `_commitment()` in `contracts/sieve.py`:
 *
 * fields = [
 *   "sieve-bid-v1",
 *   funder_address.lower() + ":" + tender_id,
 *   bidder_address.lower(),
 *   str(price_wei),
 *   proposal_url,
 *   proposal_hash.lower(),
 *   salt
 * ]
 * data = concat( for each field: uint32_big_endian(byteLength(utf8(field))) || utf8(field) )
 * commitment = "0x" + sha256(data).hex()
 */

export const COMMITMENT_DOMAIN = 'sieve-bid-v1'

const encoder = new TextEncoder()

/** Build tender key: funder_address.lower() + ":" + tender_id */
export function tenderKey(funderAddress: string, tenderId: string): string {
  return funderAddress.trim().toLowerCase() + ':' + tenderId.trim()
}

export interface CommitmentParams {
  funderAddress: string
  tenderId: string
  bidderAddress: string
  priceWei: bigint | string
  proposalUrl: string
  proposalHash: string
  salt: string
}

/**
 * Compute the sealed-bid commitment matching Sieve contract and sieve_tools.py.
 */
export async function computeCommitment(params: CommitmentParams): Promise<string> {
  const {
    funderAddress,
    tenderId,
    bidderAddress,
    priceWei,
    proposalUrl,
    proposalHash,
    salt,
  } = params

  const priceStr = typeof priceWei === 'bigint' ? priceWei.toString() : String(priceWei).trim()

  const fields = [
    COMMITMENT_DOMAIN,
    tenderKey(funderAddress, tenderId),
    bidderAddress.trim().toLowerCase(),
    priceStr,
    proposalUrl.trim(),
    proposalHash.trim().toLowerCase(),
    salt.trim(),
  ]

  // Calculate total byte length first
  const encodedFields = fields.map((f) => encoder.encode(f))
  let totalLen = 0
  for (const ef of encodedFields) {
    totalLen += 4 + ef.byteLength
  }

  const data = new Uint8Array(totalLen)
  let offset = 0
  const view = new DataView(data.buffer)

  for (const ef of encodedFields) {
    view.setUint32(offset, ef.byteLength, false) // 4-byte big-endian length
    offset += 4
    data.set(ef, offset)
    offset += ef.byteLength
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return '0x' + hashHex
}

/**
 * Compute SHA-256 of UTF-8 string or Uint8Array bytes.
 * Returns 0x + 64 lowercase hex characters.
 */
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return '0x' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Generate a cryptographically random salt.
 * 32 random bytes -> base64url without '=' padding (43 chars).
 * Matches the allowed pattern ^[A-Za-z0-9_.~-]{16,64}$.
 */
export function generateSalt(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  // convert bytes to binary string
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)
  // Convert standard base64 to base64url: + -> -, / -> _, remove =
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
