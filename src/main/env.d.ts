/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MAIN_VITE_DATABASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
