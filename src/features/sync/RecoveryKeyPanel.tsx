import { Check, Copy, Download } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { downloadBytes } from '@/lib/download'

/** The recovery key, shown once (F-SYNC-01): copy it or download it as a text file. */
export function RecoveryKeyPanel({ recoveryKey }: { recoveryKey: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    void navigator.clipboard
      ?.writeText(recoveryKey)
      .then(() => setCopied(true))
      .catch(() => setCopied(false))
  }
  const download = () => {
    const text = [
      'HushGlance recovery key',
      '',
      recoveryKey,
      '',
      'It opens your saved workspace if you forget your passphrase. Keep it somewhere safe and',
      'private: with your account, it reads everything you saved. HushGlance has no copy.',
      '',
    ].join('\n')
    downloadBytes(new TextEncoder().encode(text), 'HushGlance-recovery-key.txt', 'text/plain')
  }

  return (
    <div className="grid gap-2">
      <p
        aria-label="Recovery key"
        className="rounded-lg border bg-muted/50 p-3 font-mono text-sm tracking-wide break-all select-all"
      >
        {recoveryKey}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={download}>
          <Download aria-hidden />
          Download
        </Button>
      </div>
    </div>
  )
}
