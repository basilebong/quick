/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_URL?: string;
}

declare const __PERSIST_BUSTER__: string;
