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

export function NotebookVignette() {
  return (
    <div className={`${card} grid gap-2`}>
      <p className="font-mono text-[10px]">
        <span className="text-ink-faint">[2]</span> df.plot(kind=
        <span className="text-ok">"scatter"</span>)
      </p>
      <svg
        viewBox="0 0 100 50"
        className="h-full w-full rounded border border-hairline bg-white"
        aria-hidden
      >
        {Array.from({ length: 26 }, (_, i) => (
          <circle
            key={i}
            cx={6 + i * 3.5}
            cy={44 - i * 1.4 - ((i * 7) % 5)}
            r="1.4"
            fill="#1f77b4"
          />
        ))}
      </svg>
    </div>
  )
}

export function LocalModelVignette() {
  return (
    <div className={`${card} grid content-center gap-2`}>
      <p className={mono}>Server URL</p>
      <p className="rounded-md border border-hairline bg-paper px-2 py-1 font-mono text-[10px]">
        http://localhost:11434/v1
      </p>
      <p className="flex items-center gap-1.5 text-[10.5px] text-ok">
        <span className="size-1.5 rounded-full bg-ok" /> Connected · qwen2.5-coder:7b
      </p>
      <p className={mono}>Nothing leaves this computer.</p>
    </div>
  )
}

export function ExploreVignette() {
  return (
    <ol className={`${card} grid content-center gap-1.5 font-mono`}>
      {[
        ['Writing SQL', '1.2 s'],
        ['Exploring data', 'SELECT DISTINCT channel'],
        ['Writing SQL', '0.9 s'],
        ['Running', '21 ms'],
      ].map(([stage, detail], i) => (
        <li key={i} className="flex items-center gap-1.5 text-[10px]">
          <span className={`size-2 rounded-full ${i === 1 ? 'bg-accent' : 'bg-ok'}`} />
          <span className="text-ink">{stage}</span>
          <span className="ml-auto truncate text-ink-faint">{detail}</span>
        </li>
      ))}
    </ol>
  )
}

export function JoinsVignette() {
  return (
    <div className={`${card} grid content-center gap-2`}>
      <p className={mono}>Suggested joins</p>
      <p className="font-mono text-[10.5px]">
        orders.customer_id <span className="text-accent-ink">→</span> customers.id
      </p>
      <p className={mono}>many to one · 100% of values match</p>
      <div className="h-[3px] rounded-full bg-hairline">
        <div className="h-full w-full rounded-full bg-ok" />
      </div>
    </div>
  )
}

export function PaletteVignette() {
  return (
    <div className={`${card} grid content-start gap-1`}>
      <p className="flex items-center justify-between rounded-md border border-hairline bg-paper px-2 py-1 text-[10.5px]">
        orders <span className="font-mono text-ink-faint">⌘K</span>
      </p>
      {['Preview orders.csv', 'Query orders in SQL', 'Open dashboard: Sales'].map((item, i) => (
        <p
          key={item}
          className={`rounded-md px-2 py-1 text-[10.5px] ${i === 0 ? 'bg-paper-deep' : ''}`}
        >
          {item}
        </p>
      ))}
    </div>
  )
}
