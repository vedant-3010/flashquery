import { useEffect } from 'react'
import { VaultSetupDialog } from '@/features/sync/VaultSetupDialog'
import { VaultUnlockDialog } from '@/features/sync/VaultUnlockDialog'
import { useSyncStore } from '@/stores/sync'

const SETUP_ASKED = 'hushglance:vault-setup-asked'
const DAY_MS = 24 * 60 * 60 * 1000

/** Setup is offered by itself at most once a day ("Not now" is an answer); Home's card stays. */
function setupAskedRecently(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(SETUP_ASKED) ?? 0) < DAY_MS
  } catch {
    return false
  }
}

function noteSetupAsked(): void {
  try {
    localStorage.setItem(SETUP_ASKED, String(Date.now()))
  } catch {
    // Private mode: asked again next time.
  }
}

/**
 * The setup and unlock dialogs (F-SYNC-01/02), mounted once per page. `prompt` (Home): opens the
 * one this account needs by itself, once per page (unlock) or per day (setup).
 */
export function SyncDialogs({ prompt = false }: { prompt?: boolean }) {
  const status = useSyncStore((state) => state.status)
  const asked = useSyncStore((state) => state.asked)
  const openDialog = useSyncStore((state) => state.openDialog)

  useEffect(() => {
    if (!prompt || asked) return
    if (status === 'locked') openDialog('unlock')
    else if (status === 'setup' && !setupAskedRecently()) {
      noteSetupAsked()
      openDialog('setup')
    }
  }, [prompt, asked, status, openDialog])

  return (
    <>
      <VaultSetupDialog />
      <VaultUnlockDialog />
    </>
  )
}
