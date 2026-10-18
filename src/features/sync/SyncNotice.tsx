import { CloudOff, HardDrive, Lock, LockOpen, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { IconButton } from '@/components/IconButton'
import { Button } from '@/components/ui/button'
import { reloadForProject } from '@/stores/projectSession'
import { usePlanStore } from '@/stores/plan'
import { useSyncStore } from '@/stores/sync'
import { useToastStore } from '@/stores/toast'

function Notice({
  icon,
  children,
  action,
  onDismiss,
}: {
  icon: ReactNode
  children: ReactNode
  action?: ReactNode
  onDismiss?: () => void
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-3 py-2.5 text-sm"
    >
      <span className="text-muted-foreground [&>svg]:size-4" aria-hidden>
        {icon}
      </span>
      <p className="min-w-0 flex-1">{children}</p>
      {action}
      {onDismiss && (
        <IconButton label="Dismiss" size="icon-xs" onClick={onDismiss}>
          <X />
        </IconButton>
      )}
    </div>
  )
}

/**
 * The encrypted workspace's notices (F-SYNC-01/02/06): on Home, set up or unlock; anywhere,
 * storage full. Inside a project, a change from another device offers a reload.
 */
export function SyncNotice({ where }: { where: 'home' | 'project' }) {
  const status = useSyncStore((state) => state.status)
  const storageFull = useSyncStore((state) => state.storageFull)
  const changedElsewhere = useSyncStore((state) => state.changedElsewhere)
  const openDialog = useSyncStore((state) => state.openDialog)
  const dismissStorageFull = useSyncStore((state) => state.dismissStorageFull)
  const openUpgrade = usePlanStore((state) => state.openUpgrade)
  const toast = useToastStore((state) => state.show)

  useEffect(() => {
    if (!changedElsewhere || where !== 'project') return
    useSyncStore.setState({ changedElsewhere: false })
    toast('This project changed on another device.', {
      label: 'Reload',
      run: () => void reloadForProject(),
    })
  }, [changedElsewhere, where, toast])

  if (storageFull) {
    return (
      <Notice
        icon={<HardDrive />}
        onDismiss={dismissStorageFull}
        action={
          <Button size="sm" variant="outline" onClick={() => openUpgrade('chosen')}>
            Get more storage
          </Button>
        }
      >
        Your account’s storage is full. New files stay on this device only until there’s room.
      </Notice>
    )
  }
  if (where !== 'home') return null
  if (status === 'setup') {
    return (
      <Notice
        icon={<Lock />}
        action={
          <Button size="sm" onClick={() => openDialog('setup')}>
            Set up
          </Button>
        }
      >
        Your projects are only in this browser. Save them to your account, encrypted, to open them
        on any device.
      </Notice>
    )
  }
  if (status === 'locked') {
    return (
      <Notice
        icon={<LockOpen />}
        action={
          <Button size="sm" onClick={() => openDialog('unlock')}>
            Unlock
          </Button>
        }
      >
        Unlock to see the projects saved to your account.
      </Notice>
    )
  }
  if (status === 'error') {
    return (
      <Notice
        icon={<CloudOff />}
        action={
          <Button size="sm" variant="outline" onClick={() => void useSyncStore.getState().retry()}>
            Try again
          </Button>
        }
      >
        Couldn’t reach your saved workspace. Changes stay on this device and save when it’s back.
      </Notice>
    )
  }
  return null
}
