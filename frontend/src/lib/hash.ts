/**
 * Document hashing utility for Sieve.
 * Computes byte-exact SHA-256 using Web Crypto API.
 */

export const MAX_DOC_BYTES = 30000 // contract limit

export interface FileHashResult {
  hash: string
  byteCount: number
  warnings: string[]
  isUtf8: boolean
}

/**
 * Hash a file using byte-exact Web Crypto SHA-256.
 * Checks for strict UTF-8 encoding and maximum size limits.
 */
export async function hashDocumentFile(file: File): Promise<FileHashResult> {
  const warnings: string[] = []
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const byteCount = bytes.length

  if (byteCount === 0) {
    throw new Error('File is empty (0 bytes). Contract validators reject empty artifacts.')
  }

  if (byteCount > MAX_DOC_BYTES) {
    warnings.push(
      `File size (${byteCount.toLocaleString()} bytes) exceeds the contract's MAX_DOC_BYTES limit of ${MAX_DOC_BYTES.toLocaleString()} bytes. Validators will disqualify this proposal or fail screening!`
    )
  }

  // Check strict UTF-8 decoding
  let isUtf8 = true
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    const text = decoder.decode(bytes)

    if (text.includes('\r\n')) {
      warnings.push(
        'File contains CRLF (Windows) line endings. Ensure your hosted HTTPS server delivers identical raw bytes without line ending normalization, or hash will mismatch!'
      )
    }
  } catch {
    isUtf8 = false
    warnings.push('File is NOT valid UTF-8. The contract requires strict UTF-8 encoding.')
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hash = '0x' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

  return {
    hash,
    byteCount,
    warnings,
    isUtf8,
  }
}
