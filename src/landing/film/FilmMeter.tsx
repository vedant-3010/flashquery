/** The film's footer: what left the device. The file: nothing. The AI: what the mode allows. */
export function FilmMeter({ asked }: { asked: boolean }) {
  return (
    <div className="grid border-t border-hairline bg-paper-deep/60 text-[10.5px] @[480px]:grid-cols-2">
      <div className="flex items-center gap-2 border-b border-hairline px-3 py-2 @[480px]:border-r @[480px]:border-b-0">
        <svg viewBox="0 0 48 12" className="hidden h-3 w-12 shrink-0 @[480px]:block" aria-hidden>
          <path
            d="M0 10.5H44"
            stroke="currentColor"
            className="text-hairline-strong"
            strokeWidth="1"
          />
          <path
            d="M0 10.5H44"
            stroke="currentColor"
            className="flow-dash text-ink-faint"
            strokeWidth="1"
          />
          <circle cx="45" cy="10.5" r="1.6" className="animate-pulse fill-ok" />
        </svg>
        <span className="text-ink-muted">File uploaded</span>
        <span className="tabular ml-auto font-mono font-medium text-ink">0 bytes</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-ink-muted">Sent to the AI</span>
        <span className="ml-auto truncate font-mono text-ink">
          {asked ? 'column names + 3 sample rows' : 'nothing yet'}
        </span>
      </div>
    </div>
  )
}
