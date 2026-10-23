/** Contract constants mirrored from contracts/sieve.py (v0.1.0). `get_info` is preferred at runtime. */
export const WEI_PER_GEN = 10n ** 18n;
export const MIN_BUDGET_WEI = 10n ** 15n;
export const MIN_BOND_WEI = 10n ** 14n;
export const MAX_ID = 64;
export const MAX_TITLE = 120;
export const MAX_SUMMARY = 600;
export const MAX_URL = 512;
export const MAX_DOC_BYTES = 30_000;
export const MAX_REQUIREMENTS = 8;
export const MAX_BIDS_LIMIT = 16;
export const MIN_CONFIDENCE = 80;
export const MIN_WINDOW_SECONDS = 120n;
export const MAX_COMMIT_HORIZON_SECONDS = 30n * 24n * 3600n;
export const MAX_REVEAL_WINDOW_SECONDS = 7n * 24n * 3600n;
export const REVIEW_WINDOW_SECONDS = 3n * 24n * 3600n;
export const MAX_REVIEW_CALLS = 8;
export const MAX_SEMANTIC_ASSESSMENTS = 3;
export const RETRY_COOLDOWN_SECONDS = 60;
export const MAX_RETRY_COOLDOWN_SECONDS = 3600;
export const COMMITMENT_DOMAIN = 'sieve-bid-v1';
/** Extra margin on top of the contract minimum, for the ~40 s transaction latency. */
export const TX_LATENCY_MARGIN_SECONDS = 60n;

export const SOURCE_SHA256 = 'f7fad4c45626ed74dff33bc5256905acbdb1b5c9ec414b415dafe3371986a036';
export const CONTRACT_VERSION = '0.1.0';
export const DEFAULT_SIEVE_ADDRESS = '0x96e10D188e503d3a3Ac0002966480F4bd921e81a';
export const EXPLORER_BASE = 'https://explorer-studio.genlayer.com';
export const GITHUB_URL = 'https://github.com/reza9133/sieve';
export const X_URL = 'https://x.com/amirhp771';
export const GENLAYER_DOCS_URL = 'https://docs.genlayer.com';
export const VALUE_TRANSFER_DOCS_URL =
  'https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers';
