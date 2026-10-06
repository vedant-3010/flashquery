import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { DEMO_SQL } from '@/landing/data'
import { sqlTokens, type SqlTokenKind } from '@/landing/film/sqlTokens'

const LINES = DEMO_SQL.split('\n')

const COLOR: Record<SqlTokenKind, string> = {
  keyword: 'text-accent-ink font-medium',
  function: 'text-[#2c5a86]',
  number: 'text-[#8f2f6b]',
  string: 'text-ok',
  plain: 'text-ink-soft',
}

export const SQL_LINE_COUNT = LINES.length

/** The answer's SQL, revealed line by line, with a working copy button. */
export function FilmSql({ lines }: { lines: number }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(DEMO_SQL).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1600)
          })
        }}
        className="absolute top-0 right-0 inline-flex items-center gap-1 rounded-md border border-hairline bg-paper px-1.5 py-0.5 text-[10px] text-ink-muted transition-colors hover:text-ink active:scale-95"
      >
        {copied ? (
          <Check className="size-3" aria-hidden />
        ) : (
          <Copy className="size-3" aria-hidden />
        )}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="overflow-hidden font-mono text-[10px] leading-[1.55]" aria-label="SQL">
        {LINES.map((line, i) => (
          <div
            key={i}
            className="flex gap-3 transition-all duration-300"
            style={{
              opacity: i < lines ? 1 : 0,
              transform: i < lines ? 'none' : 'translateX(-4px)',
            }}
          >
            <span className="w-4 shrink-0 text-right text-ink-faint/70 select-none">{i + 1}</span>
            <code className="whitespace-pre">
              {sqlTokens(line).map((token, j) => (
                <span key={j} className={COLOR[token.kind]}>
                  {token.text}
                </span>
              ))}
            </code>
          </div>
        ))}
      </pre>
    </div>
  )
}
