import type { AuthChangeEvent, User } from '@supabase/supabase-js'
import { z } from '@/lib/zod'
import { accountError } from '@/platform/errors'
import { accountClient as client } from '@/platform/supabase'

// Accounts (F-ACCT-01…04): sign-up and sign-in (password, email link, Google, GitHub), password
// reset, the profile's display name, sign-out and deleting the account. Lazy (see supabase.ts).
// Profiles hold only a display name: no avatars, so no image requests to other hosts (D114).

export type Provider = 'google' | 'github'

export interface Account {
  id: string
  email: string
  name: string
  /** How they signed up: email, google or github. */
  provider: string
}

const ProfileRowSchema = z.object({ id: z.string(), display_name: z.string() })

/** Where email links and OAuth return to (this deployment's /app/…). */
const backTo = (path: string) => `${window.location.origin}/app${path}`

function fallbackName(user: User): string {
  const meta = user.user_metadata as Record<string, unknown>
  const name = meta.full_name ?? meta.name
  return typeof name === 'string' && name.trim()
    ? name.trim()
    : ((user.email ?? '').split('@')[0] ?? '')
}

async function toAccount(user: User): Promise<Account> {
  const { data, error } = await client()
    .from('profiles')
    .select('id, display_name')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw accountError(error)
  const profile = data === null ? null : ProfileRowSchema.parse(data)
  return {
    id: user.id,
    email: user.email ?? '',
    name: profile?.display_name || fallbackName(user),
    provider: typeof user.app_metadata.provider === 'string' ? user.app_metadata.provider : 'email',
  }
}

/** The signed-in account (restoring a saved session, or finishing an email link or OAuth). */
export async function currentAccount(): Promise<Account | null> {
  const { data, error } = await client().auth.getSession()
  if (error) throw accountError(error)
  return data.session ? toAccount(data.session.user) : null
}

/** Sign-ins, sign-outs and refreshes, from this tab or another one. Returns the unsubscribe. */
export function onAccountChange(
  listener: (event: AuthChangeEvent, account: Account | null) => void,
): () => void {
  const { data } = client().auth.onAuthStateChange((event, session) => {
    // Supabase asks for no awaiting inside the callback: read the profile afterwards.
    setTimeout(() => {
      const next = session ? toAccount(session.user) : Promise.resolve(null)
      void next.then(
        (account) => listener(event, account),
        () => listener(event, null),
      )
    })
  })
  return () => data.subscription.unsubscribe()
}

/** 'confirm-email' when the project asks new users to confirm their address first. */
export async function signUp(input: {
  name: string
  email: string
  password: string
}): Promise<{ account: Account | null; next: 'signed-in' | 'confirm-email' }> {
  const { data, error } = await client().auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.name.trim() }, emailRedirectTo: backTo('/auth/callback') },
  })
  if (error) throw accountError(error)
  if (!data.session || !data.user) return { account: null, next: 'confirm-email' }
  return { account: await toAccount(data.user), next: 'signed-in' }
}

export async function signIn(input: { email: string; password: string }): Promise<Account> {
  const { data, error } = await client().auth.signInWithPassword(input)
  if (error) throw accountError(error)
  return toAccount(data.user)
}

export async function sendSignInLink(email: string): Promise<void> {
  const { error } = await client().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: backTo('/auth/callback') },
  })
  if (error) throw accountError(error)
}

/** Leaves for the provider's sign-in page; it comes back to /app/auth/callback. */
export async function signInWith(provider: Provider): Promise<void> {
  const { error } = await client().auth.signInWithOAuth({
    provider,
    options: { redirectTo: backTo('/auth/callback') },
  })
  if (error) throw accountError(error)
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await client().auth.resetPasswordForEmail(email, {
    redirectTo: backTo('/reset'),
  })
  if (error) throw accountError(error)
}

/** After a reset link: the link signed them in, now the new password. */
export async function setPassword(password: string): Promise<void> {
  const { error } = await client().auth.updateUser({ password })
  if (error) throw accountError(error)
}

export async function setDisplayName(id: string, name: string): Promise<void> {
  const { error } = await client()
    .from('profiles')
    .update({ display_name: name.trim() })
    .eq('id', id)
  if (error) throw accountError(error)
}

export async function signOut(): Promise<void> {
  const { error } = await client().auth.signOut()
  if (error) throw accountError(error)
}

/** Deletes the account and everything it saved in the cloud (the database cascades), then signs out. */
export async function deleteAccount(): Promise<void> {
  const { error } = await client().rpc('delete_my_account')
  if (error) throw accountError(error)
  // The user is gone; only this browser's copy of the session is left to drop.
  await client().auth.signOut({ scope: 'local' })
}
