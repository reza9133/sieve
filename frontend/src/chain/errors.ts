/**
 * Human-friendly error parsing for contract errors.
 * Reverts in Sieve are standardized as "[EXPECTED] <message>".
 */

export interface ParsedError {
  title: string
  message: string
  raw: string
  isUserRejection: boolean
  isExpectedContractError: boolean
}

export function parseContractError(error: unknown): ParsedError {
  if (!error) {
    return {
      title: 'Error',
      message: 'An unknown error occurred',
      raw: '',
      isUserRejection: false,
      isExpectedContractError: false,
    }
  }

  const rawStr =
    typeof error === 'string'
      ? error
      : (error as { reason?: string })?.reason ||
        (error as { message?: string })?.message ||
        JSON.stringify(error)

  // Check user cancellation / rejection
  const code = (error as { code?: number })?.code
  if (
    code === 4001 ||
    rawStr.includes('4001') ||
    rawStr.toLowerCase().includes('user rejected') ||
    rawStr.toLowerCase().includes('user denied')
  ) {
    return {
      title: 'Transaction Cancelled',
      message: 'You rejected the transaction in your wallet.',
      raw: rawStr,
      isUserRejection: true,
      isExpectedContractError: false,
    }
  }

  // Check [EXPECTED] pattern
  const expectedMatch = rawStr.match(/\[EXPECTED\]\s*([^"\r\n]+)/)
  if (expectedMatch) {
    const cleanMsg = expectedMatch[1].trim()
    return {
      title: 'Action Rejected',
      message: cleanMsg,
      raw: rawStr,
      isUserRejection: false,
      isExpectedContractError: true,
    }
  }

  // Network / RPC errors
  if (rawStr.includes('Failed to fetch') || rawStr.includes('NetworkError') || rawStr.includes('429')) {
    return {
      title: 'RPC Network Error',
      message: 'Unable to communicate with GenLayer Studionet RPC. The endpoint may be busy or rate-limited.',
      raw: rawStr,
      isUserRejection: false,
      isExpectedContractError: false,
    }
  }

  return {
    title: 'Transaction Failed',
    message: rawStr.length > 180 ? rawStr.slice(0, 180) + '…' : rawStr,
    raw: rawStr,
    isUserRejection: false,
    isExpectedContractError: false,
  }
}
