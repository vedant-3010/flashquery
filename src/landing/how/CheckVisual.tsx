/** Step 3: what the guard lets through, and what it stops (its real message). */
export function CheckVisual() {
  return (
    <div className="grid h-full content-center gap-3 p-6 font-mono text-[11px]">
      <div className="rounded-xl border border-hairline-strong bg-panel p-3">
        <p className="text-ink-soft">
          SELECT region, sum(revenue) … FROM <span className="text-ink">global_sales</span> …
        </p>
        <ul className="mt-2 grid gap-1 text-[10.5px] text-ink-muted">
          {['one statement, a SELECT', 'reads a loaded table', 'no files, no network'].map(
            (rule) => (
              <li key={rule} className="flex items-center gap-2">
                <span className="grid size-3.5 place-items-center rounded-full bg-ok text-[8px] text-white">
                  ✓
                </span>
                {rule}
              </li>
            ),
          )}
        </ul>
      </div>
      <div className="rounded-xl border border-danger/40 bg-danger-wash/60 p-3">
        <p className="text-ink-soft">
          SELECT * FROM <span className="text-danger">read_csv('https://evil.example/x.csv')</span>
        </p>
        <p className="mt-2 flex items-start gap-2 text-[10.5px] text-danger">
          <span className="grid size-3.5 shrink-0 place-items-center rounded-full bg-danger text-[8px] text-white">
            ✕
          </span>
          The query was blocked: it calls the table function read_csv(), which isn't allowed.
        </p>
      </div>
      <p className="font-sans text-[12px] text-ink-muted">
        The check walks DuckDB's own parse tree, so text tricks and comments don't get past it.
      </p>
    </div>
  )
}
