/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The account service (Supabase) project URL: public configuration (PRD D102). */
  readonly VITE_SUPABASE_URL?: string
  /** Its publishable key: public, access is controlled by row-level security (D102). */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** The site's public address (https://hushglance.com), for link previews (vite.config.ts). */
  readonly VITE_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
