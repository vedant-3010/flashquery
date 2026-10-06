import { DEMO_QUESTION, PAYLOAD_BALANCED } from '@/landing/data'

const mark = 'rounded-[3px] bg-accent-wash px-0.5 text-accent-ink'

/** Step 2: the request as the inspector shows it: the shape of the data, delimited as data. */
export function AskVisual() {
  const [date, region, revenue] = PAYLOAD_BALANCED.columns
  return (
    <div className="grid h-full content-center p-6">
      <div className="overflow-hidden rounded-xl border border-hairline-strong bg-panel">
        <p className="flex items-center gap-2 border-b border-hairline px-3 py-2 font-mono text-[10.5px] text-ink-muted">
          <span className="rounded bg-ink px-1.5 py-px text-paper">POST</span>
          api.anthropic.com · Balanced · key never shown
        </p>
        <pre className="overflow-hidden p-3 font-mono text-[10.5px] leading-[1.65] whitespace-pre-wrap text-ink-soft [overflow-wrap:anywhere]">
          <span className="text-ink-faint">{'<data>'}</span>
          {`\n{"name":"orders","rows":${PAYLOAD_BALANCED.rows},"columns":[\n`}
          {`  {"name":"${date?.name}","type":"DATE","min":`}
          <span className={mark}>"{date?.min}"</span>,…{`},\n`}
          {`  {"name":"${region?.name}","type":"VARCHAR","topValues":`}
          <span className={mark}>["North America","Europe","APAC"]</span>
          {`},\n`}
          {`  {"name":"${revenue?.name}","type":"DOUBLE","unit":"USD","max":`}
          <span className={mark}>29980</span>
          {`}],\n "sampleRows":`}
          <span className={mark}>[3 rows]</span>
          {'}\n'}
          <span className="text-ink-faint">{'</data>'}</span>
          {`\nQuestion: ${DEMO_QUESTION}`}
        </pre>
      </div>
      <p className="mt-3 text-[12px] text-ink-muted">
        <span className={mark}>Highlighted</span>: values from your data. Strict mode sends none of
        them.
      </p>
    </div>
  )
}
