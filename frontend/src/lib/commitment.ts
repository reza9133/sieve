import { COMMITMENT_DOMAIN } from './constants';

const encoder = new TextEncoder();

export interface CommitmentInput {
  funder: string;
  tenderId: string;
  bidder: string;
  priceWei: bigint;
  proposalUrl: string;
  proposalHash: string;
  salt: string;
}

/** "<funder lowercase>:<tender_id>", exactly as contracts/sieve.py builds it. */
export function tenderKey(funder: string, tenderId: string): string {
  return `${funder.toLowerCase()}:${tenderId}`;
}

/** Concatenate fields as uint32-big-endian(byteLength) || utf8 bytes. */
export function encodeFields(fields: readonly string[]): Uint8Array {
  const parts = fields.map((field) => encoder.encode(field));
  const total = parts.reduce((sum, part) => sum + 4 + part.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let offset = 0;
  for (const part of parts) {
    view.setUint32(offset, part.length, false);
    out.set(part, offset + 4);
    offset += 4 + part.length;
  }
  return out;
}

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (const byte of view) out += byte.toString(16).padStart(2, '0');
  return out;
}

export async function sha256Hex(data: Uint8Array | ArrayBuffer): Promise<string> {
  // Copy into a fresh ArrayBuffer so the digest input type is always a plain BufferSource.
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return `0x${toHex(digest)}`;
}

/**
 * The sealed-bid commitment. Must equal `commitment()` in scripts/sieve_tools.py and
 * `_commitment()` in contracts/sieve.py. Computed locally only: never send these inputs anywhere.
 */
export async function computeCommitment(input: CommitmentInput): Promise<string> {
  if (input.priceWei < 1n) throw new Error('price must be positive');
  const fields = [
    COMMITMENT_DOMAIN,
    tenderKey(input.funder, input.tenderId),
    input.bidder.toLowerCase(),
    input.priceWei.toString(10),
    input.proposalUrl,
    input.proposalHash.toLowerCase(),
    input.salt,
  ];
  return sha256Hex(encodeFields(fields));
}

/** 32 random bytes as base64url without padding: 43 characters from [A-Za-z0-9_-]. */
export function generateSalt(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
