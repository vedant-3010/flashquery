// Small, hand-made previews of each feature for the feature index (PRD D99). Static HTML in the
// page's own style: they show the real UI's idea, not screenshots.

const card = 'h-full w-full rounded-xl border border-hairline-strong bg-panel p-3 text-[10px]'
const mono = 'font-mono text-[9.5px] text-ink-muted'

export function DashboardVignette() {
  return (
    <div className={`${card} grid grid-cols-3 grid-rows-[auto_1fr] gap-1.5`}>
      {['1.4B', '1M', '1,394'].map((v) => (
        <div key={v} className="rounded-md border border-hairline p-1.5">
          <p className={mono}>KPI</p>
          <p className="font-serif text-[18px] leading-none">{v}</p>
        </div>
      ))}
      <div className="col-span-2 rounded-md border border-hairline p-1.5">
        <svg viewBox="0 0 100 30" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
          <path
            d="M0 24 12 21 24 22 36 17 48 18 60 12 72 13 84 7 100 4"
            fill="none"
            stroke="#151515"
            strokeWidth="1.2"
          />
        </svg>
      </div>
      <div
        className="grid items-end gap-0.5 rounded-md border border-accent/60 p-1.5"
        style={{ gridTemplateColumns: 'repeat(4,1fr)' }}
      >
        {[90, 70, 45, 30].map((h, i) => (
          <span
            key={h}
            className={i === 0 ? 'bg-accent' : 'bg-ink-soft/60'}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  )
}

export function FilesVignette() {
  return (
    <div className={`${card} grid content-center gap-1.5`}>
      {[
        ['Q3 invoices.xlsx', '2,418 rows'],
        ['bank-export.csv', '9,904 rows'],
        ['Pasted from a sheet', '36 rows'],
      ].map(([name, rows], i) => (
        <p
          key={name}
          className="flex items-center gap-2 rounded-md border border-hairline bg-paper px-2 py-1.5"
        >
          <span className={`size-2 rounded-sm ${i === 0 ? 'bg-accent' : 'bg-ink-soft/50'}`} />
          <span className="text-[10.5px] text-ink">{name}</span>
          <span className="ml-auto font-mono text-[9.5px] text-ink-faint">{rows}</span>
        </p>
      ))}
      <p className={mono}>Read on this device · 0 bytes uploaded</p>
    </div>
  )
}

export function AskVignette() {
  return (
    <div className={`${card} grid content-center gap-2`}>
      <p className="ml-auto max-w-[85%] rounded-full bg-ink px-2.5 py-1 text-[10.5px] text-paper">
        Which customers owe us the most?
      </p>
      <p className="flex items-center gap-1.5 text-[10px] text-ink-muted">
        <span className="size-1.5 rounded-full bg-ok" /> Checked how “Overdue” is spelled
      </p>
      <p className="flex items-center gap-1.5 text-[10px] text-ink-muted">
        <span className="size-1.5 rounded-full bg-ok" /> Joined invoices to customers
      </p>
    </div>
  )
}

export function AnswerVignette() {
  return (
    <div className={`${card} grid content-start gap-1.5`}>
      <p className="text-[11px] text-ink">
        Harbor Health owes the most: <span className="text-accent-ink">$563K</span>
      </p>
      {[100, 77, 76, 42].map((width, i) => (
        <span key={width} className="flex items-center gap-1.5">
          <span
            className={`h-2 rounded-sm ${i === 0 ? 'bg-accent' : 'bg-ink-soft/50'}`}
            style={{ width: `${width * 0.7}%` }}
          />
        </span>
      ))}
      <p className={mono}>Why this chart · Assumptions · The query</p>
    </div>
  )
}

export function ShareVignette() {
  return (
    <div className={`${card} grid content-center gap-1.5`}>
      <p className={mono}>Shared with</p>
      {[
        ['maya@yourco.com', 'Can edit'],
        ['accountant@firm.com', 'Can view'],
      ].map(([email, role]) => (
        <p key={email} className="flex items-center gap-2 text-[10.5px]">
          <span className="text-ink">{email}</span>
          <span className="ml-auto text-ink-faint">{role}</span>
        </p>
      ))}
      <p className="flex items-center gap-1.5 rounded-md border border-hairline bg-paper px-2 py-1 font-mono text-[9.5px] text-ink-muted">
        /app/s/7Hk2qLw9…
        <span className="ml-auto text-ink">Revoke</span>
      </p>
    </div>
  )
}
