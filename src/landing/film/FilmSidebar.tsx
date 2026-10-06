import { DEMO_FILE, ROWS } from '@/landing/data'
import type { Frame } from '@/landing/film/filmScript'
import { formatNumber } from '@/lib/format'
import { cx as cn } from '@/landing/cx'

const COLUMNS: [string, '#' | 'T' | 'D'][] = [
  ['order_id', '#'],
  ['order_date', 'D'],
  ['region', 'T'],
  ['country', 'T'],
  ['channel', 'T'],
  ['category', 'T'],
  ['units', '#'],
  ['revenue', '#'],
]

/** The film's catalog: the file drops in, then its rows are counted and its columns listed. */
export function FilmSidebar({ frame }: { frame: Frame }) {
  const loaded = frame.rows >= ROWS
  const drop = 1 - frame.fileIn
  return (
    <aside className="hidden w-[168px] shrink-0 flex-col gap-2.5 border-r border-hairline p-3 @[560px]:flex">
      <p className="font-mono text-[9.5px] tracking-[0.16em] text-ink-faint uppercase">Datasets</p>
      <div className="relative h-[62px]">
        <div
          className="absolute inset-0 grid place-items-center rounded-lg border border-dashed border-hairline-strong text-[10.5px] text-ink-faint"
          style={{ opacity: Math.max(0, 1 - frame.fileIn * 1.4) }}
        >
          Drop a file
        </div>
        <div
          className="absolute inset-0 rounded-lg border border-hairline-strong bg-paper px-2.5 py-2 shadow-[0_6px_14px_-10px_rgba(21,21,21,.45)]"
          style={{
            opacity: frame.fileIn,
            transform: `translateY(${drop * -26}px) rotate(${drop * -5}deg)`,
          }}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink">
            <svg viewBox="0 0 12 14" className="h-3 w-2.5 shrink-0" aria-hidden>
              <path d="M1 1h6.5L11 4.5V13H1z" fill="none" stroke="currentColor" strokeWidth="1.1" />
              <path d="M7.5 1v3.5H11" fill="none" stroke="currentColor" strokeWidth="1.1" />
            </svg>
            {DEMO_FILE.name}
          </div>
          <p className="tabular mt-0.5 font-mono text-[10px] text-ink-muted">
            {formatNumber(frame.rows, 'en-US')} rows
          </p>
          <div className="mt-1 h-[2px] overflow-hidden rounded-full bg-hairline">
            <div
              className="h-full bg-ink transition-[width] duration-75"
              style={{ width: `${(frame.rows / ROWS) * 100}%` }}
            />
          </div>
        </div>
      </div>
      <ul className="grid gap-[3px]" aria-label="Columns of sales.csv">
        {COLUMNS.map(([name, kind], i) => (
          <li
            key={name}
            className={cn(
              'flex items-center gap-1.5 font-mono text-[10px] text-ink-soft transition-all duration-500',
              loaded ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
            )}
            style={{ transitionDelay: loaded ? `${i * 45}ms` : '0ms' }}
          >
            <span className="w-2.5 text-center text-ink-faint">{kind === 'D' ? '◷' : kind}</span>
            {name}
          </li>
        ))}
        <li
          className={cn(
            'font-mono text-[10px] text-ink-faint transition-opacity duration-500',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
          style={{ transitionDelay: loaded ? '380ms' : '0ms' }}
        >
          + {DEMO_FILE.columns - COLUMNS.length} more
        </li>
      </ul>
    </aside>
  )
}
