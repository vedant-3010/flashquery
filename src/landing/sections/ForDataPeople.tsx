import { TextLink } from '@/landing/CtaLink'
import { BENCH, BENCH_URL } from '@/landing/data'
import { HeadlineLines } from '@/landing/HeadlineLines'
import { Eyebrow } from '@/landing/Eyebrow'
import { Reveal } from '@/landing/Reveal'

// The one section for technical readers (D117): what's under the hood, the benchmark (PRD D79) and
// what it's built on. Everything above it speaks to the business; the jargon lives here.

const TOOLS = [
  {
    title: 'SQL you can read and edit',
    body: 'Every answer’s query is shown, checked and re-runnable, with a full editor for your own. DuckDB, compiled to WebAssembly, runs it in the tab.',
  },
  {
    title: 'Python when SQL isn’t enough',
    body: 'Forecasts, regressions and outliers run as pandas in Pyodide, only after you approve the code. A notebook takes your own cells, with matplotlib.',
  },
  {
    title: 'Your model, or your machine',
    body: 'Bring an Anthropic or OpenAI key, or point it at Ollama or LM Studio and keep every request on this computer.',
  },
  {
    title: 'Joins and lookups it does for you',
    body: 'It spots the keys between files by name and by matching values, and can run up to three small checked queries before it answers.',
  },
  {
    title: 'Made for the keyboard',
    body: '⌘K to jump anywhere, / to ask, ? for every shortcut. Grids copy as TSV straight into a spreadsheet.',
  },
]

const STACK = ['DuckDB-WASM', 'Pyodide', 'ECharts', 'LangChain.js', 'React']

/** The benchmark's speed figures (the bundle size is in `npm run size`, not a selling point). */
const STATS = BENCH.stats.filter((stat) => stat.id !== 'bundle')

export function ForDataPeople() {
  return (
    <section
      id="data-people"
      aria-labelledby="data-people-title"
      className="mx-auto max-w-[1200px] px-5 pt-24 md:px-8 md:pt-32"
    >
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
        <Reveal group className="lg:col-span-5">
          <Eyebrow>For data people</Eyebrow>
          <Reveal as="div">
            <h2 id="data-people-title" className="mt-4 text-[clamp(36px,4.6vw,60px)] text-balance">
              <HeadlineLines lead="Under the hood," line="nothing hidden." />
            </h2>
          </Reveal>
          <Reveal as="p" className="mt-5 max-w-[28rem] text-[16px] leading-[1.6] text-ink-muted">
            Plain English on the surface, a real analytics stack underneath, open to anyone who
            wants it. Fast because it’s local: no round trip to a database server.
          </Reveal>
          <Reveal as="div" className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6">
            {STATS.map((stat) => (
              <div key={stat.id} className="border-t border-hairline pt-4">
                <p className="flex items-baseline gap-1.5 font-serif text-[40px] leading-none text-ink">
                  <span className="tabular">{stat.value.toFixed(stat.digits)}</span>
                  {stat.unit && <span className="text-[0.45em] text-accent-ink">{stat.unit}</span>}
                </p>
                <p className="mt-2 text-[13.5px] leading-snug text-ink-soft">{stat.label}</p>
              </div>
            ))}
          </Reveal>
          <Reveal as="p" className="mt-6 font-mono text-[11px] leading-[1.6] text-ink-faint">
            {BENCH.environment}.{' '}
            <TextLink href={BENCH_URL} className="text-ink-muted hover:text-ink">
              Run the benchmark on yours
            </TextLink>
          </Reveal>
        </Reveal>

        <Reveal group className="lg:col-span-7">
          <dl className="border-b border-hairline">
            {TOOLS.map((tool) => (
              <Reveal
                key={tool.title}
                className="grid gap-x-8 gap-y-1.5 border-t border-hairline py-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
              >
                <dt className="font-serif text-[24px] leading-[1.1] text-ink">{tool.title}</dt>
                <dd className="text-[14.5px] leading-[1.6] text-ink-muted">{tool.body}</dd>
              </Reveal>
            ))}
          </dl>
          <Reveal
            as="p"
            className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[12px] text-ink-faint"
          >
            <span className="text-ink-muted">Built on</span>
            {STACK.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </Reveal>
        </Reveal>
      </div>
    </section>
  )
}
