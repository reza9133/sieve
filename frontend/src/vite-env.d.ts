/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIEVE_ADDRESS?: string;
  readonly VITE_RPC_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
