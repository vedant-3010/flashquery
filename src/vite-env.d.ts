/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The account service (Supabase) project URL: public configuration (PRD D102). */
  readonly VITE_SUPABASE_URL?: string
  /** Its publishable key: public, access is controlled by row-level security (D102). */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
