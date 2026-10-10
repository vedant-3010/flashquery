/** Step 1: the file goes into the database inside the tab; the "server" it would go to doesn't exist. */
export function LoadVisual() {
  return (
    <div className="grid h-full content-center gap-6 p-8">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <div className="rounded-lg border border-hairline-strong bg-paper px-3 py-2.5 shadow-[0_8px_18px_-14px_rgba(21,21,21,.5)]">
          <p className="text-[12px] font-medium">orders.csv</p>
          <p className="tabular font-mono text-[10.5px] text-ink-muted">102 MB · on your disk</p>
        </div>
        <svg viewBox="0 0 120 12" className="h-3 w-full" aria-hidden>
          <path
            d="M0 6H112"
            stroke="currentColor"
            className="flow-dash text-ink"
            strokeWidth="1.4"
          />
          <path
            d="M108 2.5 113 6 108 9.5"
            fill="none"
            stroke="currentColor"
            className="text-ink"
            strokeWidth="1.4"
          />
        </svg>
        <div className="rounded-xl border border-ink bg-panel px-4 py-3">
          <p className="font-mono text-[10px] tracking-[0.12em] text-ink-faint uppercase">
            Your browser tab
          </p>
          <p className="mt-1 text-[13px] font-medium">A database, in your browser</p>
          <p className="tabular font-mono text-[10.5px] text-ink-muted">
            1,000,000 rows · 14 columns
          </p>
        </div>
      </div>
      <div className="ml-auto grid w-[62%] grid-cols-[1fr_auto] items-center gap-3 opacity-80">
        <svg viewBox="0 0 120 12" className="h-3 w-full" aria-hidden>
          <path
            d="M0 6H112"
            stroke="currentColor"
            className="text-hairline-strong"
            strokeWidth="1.2"
            strokeDasharray="3 5"
          />
          <path
            d="M54 2 62 10M62 2 54 10"
            stroke="currentColor"
            className="text-accent"
            strokeWidth="1.4"
          />
        </svg>
        <div className="rounded-xl border border-dashed border-hairline-strong px-4 py-3 text-ink-faint">
          <p className="text-[13px] line-through decoration-accent">An upload server</p>
          <p className="tabular font-mono text-[10.5px]">0 bytes · there isn't one</p>
        </div>
      </div>
    </div>
  )
}
