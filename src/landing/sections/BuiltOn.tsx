import { Reveal } from '@/landing/Reveal'

const STACK = ['DuckDB-WASM', 'Pyodide', 'ECharts', 'LangChain.js', 'React']

/** What it's built on: names, not borrowed logos. */
export function BuiltOn() {
  return (
    <Reveal className="mx-auto mt-14 flex max-w-[1200px] flex-wrap items-center gap-x-8 gap-y-2 px-5 font-mono text-[12px] text-ink-faint md:px-8">
      <span className="text-ink-muted">Built on</span>
      {STACK.map((name) => (
        <span key={name} className="transition-colors duration-200 hover:text-ink">
          {name}
        </span>
      ))}
    </Reveal>
  )
}
