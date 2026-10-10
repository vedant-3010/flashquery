import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '@/lib/errors'
import { accountsConfig, type AccountsConfig } from '@/platform/config'

// The Supabase client (D101), created once. This module and the ones importing it are a lazy chunk:
// only src/platform/ talks to Supabase, and only once someone signs in or has a session (F-SEC-09).

let client: SupabaseClient | null = null

export function supabaseClient(config: AccountsConfig): SupabaseClient {
  client ??= createClient(config.url, config.key, {
    auth: {
      // Authorization-code flow with a verifier kept here: links and OAuth come back with ?code=.
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: config.storageKey,
    },
  })
  return client
}

/** The client for this deployment's account service; an error where there is none. */
export function accountClient(): SupabaseClient {
  const config = accountsConfig()
  if (!config) {
    throw new AppError({
      code: 'accounts_off',
      message: 'Accounts aren’t set up on this deployment.',
      detail: null,
    })
  }
  return supabaseClient(config)
}
