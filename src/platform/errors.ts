import { AppError } from '@/lib/errors'

// Account service errors in plain words (F-ACCT-01). Supabase answers with codes and messages meant
// for developers; the UI shows one line and keeps the original as the detail. Pure.

const BY_CODE: Record<string, string> = {
  invalid_credentials: 'Wrong email or password.',
  email_not_confirmed: 'Confirm your email first: the link is in your inbox.',
  user_already_exists: 'An account with this email already exists. Sign in instead.',
  email_exists: 'An account with this email already exists. Sign in instead.',
  weak_password: 'Choose a longer password (at least 8 characters).',
  over_email_send_rate_limit: 'Too many emails sent. Wait a minute and try again.',
  over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
  otp_expired: 'That link has expired. Ask for a new one.',
  signup_disabled: 'New accounts are turned off on this deployment.',
  same_password: 'Choose a password you haven’t used here before.',
}

interface ServiceError {
  code?: unknown
  message?: unknown
  status?: unknown
}

/** An AppError for a Supabase error (auth or database), with a message a person can act on. */
export function accountError(error: unknown): AppError {
  if (error instanceof AppError) return error
  const raw: ServiceError = typeof error === 'object' && error !== null ? error : {}
  const code = typeof raw.code === 'string' ? raw.code : null
  const message = typeof raw.message === 'string' ? raw.message : String(error)
  const known = code ? BY_CODE[code] : undefined
  const offline = /failed to fetch|networkerror|load failed/i.test(message)
  return new AppError({
    code: offline ? 'account_offline' : 'account',
    message:
      known ??
      (offline
        ? "Couldn't reach the account service. Check your connection and try again."
        : "The account service didn't accept that. Try again in a moment."),
    detail: code ? `${code}: ${message}` : message,
  })
}
