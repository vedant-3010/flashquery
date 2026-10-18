import { LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { exchangeOpenRouterCode } from '@/ai/openRouter'
import { paths } from '@/app/paths'
import { CenteredLayout } from '@/features/account/CenteredLayout'
import { FormError } from '@/features/account/FormError'
import { takeConnectState } from '@/features/settings/openRouterConnect'
import { toAppError, type AppErrorData } from '@/lib/errors'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'

/**
 * Finishes the connection once per page load (React runs effects twice in development, and the
 * code and verifier can be used only once): the key, then the path to go back to.
 */
let finishing: Promise<string> | null = null

function finishConnect(): Promise<string> {
  finishing ??= (async () => {
    const code = new URLSearchParams(window.location.search).get('code')
    // The code is single-use and short-lived: off the address bar at once.
    window.history.replaceState(null, '', window.location.pathname)
    const { verifier, returnTo } = takeConnectState()
    if (!code || !verifier) {
      throw new Error('This page needs the sign-in that Settings → Connect OpenRouter starts.')
    }
    // Settings load first, so the saved (empty) keys don't overwrite the new one.
    await useSettingsStore.getState().hydrate()
    const key = await exchangeOpenRouterCode(code, verifier)
    const settings = useSettingsStore.getState()
    settings.setApiKey('openrouter', key)
    settings.setProvider('openrouter')
    settings.setAiSource('own')
    useToastStore.getState().show('OpenRouter connected.')
    return returnTo
  })()
  return finishing
}

/**
 * `/app/connect/openrouter` (F-AI-07): OpenRouter's sign-in comes back here with a code, which (with
 * the verifier this tab kept) becomes a key for the user's own account. Then back where they were.
 */
export function ConnectOpenRouterPage() {
  const [, navigate] = useLocation()
  const [error, setError] = useState<AppErrorData | null>(null)

  useEffect(() => {
    let current = true
    finishConnect().then(
      (returnTo) => {
        if (current) navigate(returnTo, { replace: true })
      },
      (caught: unknown) => {
        if (current) setError(toAppError(caught).toJSON())
      },
    )
    return () => {
      current = false
    }
  }, [navigate])

  return (
    <CenteredLayout
      title="Connecting OpenRouter"
      footer={
        <p>
          <Link href={paths.home} className="hover:underline">
            Back to your projects
          </Link>
        </p>
      }
    >
      {error ? (
        <FormError error={error} />
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Finishing the connection…
        </p>
      )}
    </CenteredLayout>
  )
}
