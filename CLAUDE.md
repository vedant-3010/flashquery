# AskData

Privacy-first AI data analyst that runs entirely in the browser. Users load a CSV / Excel / Parquet / JSON
file and ask questions in plain English ("Which region grew fastest?"). AskData writes DuckDB SQL with an
LLM, runs it client-side in DuckDB-WASM, picks a chart, explains its reasoning, and lets users pin answers
to a drag-and-drop dashboard. Stats/forecast questions can run as Python (pandas) via Pyodide.
There is no backend. Only what the active privacy mode allows (schema, a few sample values) is sent to
the LLM provider the user picks with their own API key.

- Requirements, feature IDs (e.g. `F-ASK-05`), acceptance criteria (AC) and milestones: `docs/PRD.md`.
  Read the relevant section before starting any feature.
- Area rules load automatically from `.claude/rules/` (data engine, AI pipeline, UI).
- Progress = ticked checkboxes in `docs/PRD.md` §4. Milestone order: `docs/PRD.md` §10.

## Product principles (use these to break ties)
1. **Private by default**: raw rows never leave the device beyond what the privacy mode allows, and the
   user can inspect every payload sent to the AI.
2. **Explainable**: every answer shows its SQL, a plain-English explanation, its assumptions, and why that
   chart was chosen. SQL is editable and re-runnable.
3. **Never block the UI**: heavy work runs in workers; the app stays responsive on 1M+ rows.
4. **Works without a key**: demo mode + sample data must always work (this is how recruiters see it).
5. **LLM output is untrusted input**: validate with Zod and the SQL guard before anything executes.

## Commands
- `npm run dev`: dev server at http://localhost:5173
- `npm run build`: `tsc -b` + production build
- `npm run check`: typecheck + lint + unit + build + `npm run size` (initial JS ≤ 350 KB gzip), same as CI
- `npm run typecheck` / `npm run lint` / `npm run format`
- `npm test`: Vitest (one file: `npx vitest run src/engine/sqlGuard.test.ts`)
- `npm run e2e`: Playwright; runs in demo mode, no API key needed
- `ANTHROPIC_API_KEY=… npm run evals`: NL→SQL evals → `evals/report.md` (`EVAL_DRY_RUN=1` checks the
  harness without a key; see `.claude/rules/ai.md`)
- `http://localhost:5173/#/bench`: benchmark page (§5 budgets on this device; "Copy as Markdown")
- `npx shadcn@latest add <component>`: add a shadcn/ui primitive (files in `src/components/ui/` stay
  as generated; they're in `.prettierignore`)
- `node scripts/generate-samples.mjs` / `node scripts/generate-e2e-fixtures.mjs`: regenerate
  `public/samples/*.csv` / `e2e/fixtures/*` (deterministic)

## Stack (decided; ask before adding, removing or swapping a library)
- React + TypeScript (strict) + Vite; Tailwind CSS v4 + shadcn/ui (`src/components/ui/`, generated) + lucide-react
- SQL engine: `@duckdb/duckdb-wasm` (`AsyncDuckDB`, runs in its own worker)
- Python: `pyodide` in a dedicated worker, lazy-loaded on first use
- Excel: SheetJS `xlsx` (installed from cdn.sheetjs.com) inside a worker
- Worker RPC: `comlink`
- LLM: LangChain.js (`@langchain/core`, `@langchain/anthropic`, `@langchain/openai`) with
  `withStructuredOutput(zodSchema)`, behind our own `LLMProvider` interface
- Validation: `zod` v4 at every boundary (LLM output, IndexedDB data, imports, worker messages)
- State: `zustand` (one store per domain in `src/stores/`); persistence: IndexedDB via `idb-keyval`
- Grid: `@tanstack/react-table` + `@tanstack/react-virtual`, paged from DuckDB
- Charts: `echarts` through our own thin `<EChart>` wrapper (tree-shaken `echarts/core`); no React wrapper lib
- Dashboard: `react-grid-layout` v2 API
- SQL editor: `@uiw/react-codemirror` + `@codemirror/lang-sql`; `sql-formatter` for display
- Tests: Vitest + Testing Library (jsdom), Playwright e2e

## Architecture
```
Main thread: React UI, Zustand stores, LLM calls (network only, lazy-loaded chunk)
 ├─ src/engine/*           → DuckDB-WASM worker (AsyncDuckDB): ingest, profile, query, export
 ├─ workers/xlsx.worker    → SheetJS: workbook → CSV bytes → registered in DuckDB
 └─ workers/python.worker  → Pyodide + pandas: CSV bytes in → tables/text out
```
Ask pipeline (`src/ai/pipeline.ts`); each stage emits a status event for the UI timeline:
`buildContext → plan (LLM → SqlPlan) → guard (Zod + AST allowlist + EXPLAIN) → execute (normalized,
row-capped) → self-correct ≤ 2× on error → chooseChart (heuristic; LLM hint only if compatible) →
local summary`, then, in Balanced mode with a key, the AI summary (`narrate`) once the answer is shown.

## Layout
```
src/
  app/          shell, layout, providers, view switching (no router; hash for #/bench)
  components/   shared app components (EmptyState, IconButton); ui/ = shadcn/ui primitives (generated)
  hooks/        shared React hooks (useMediaQuery, useResolvedTheme)
  features/     datasets/ grid/ sql/ ask/ explain/ charts/ dashboard/ python/ settings/ bench/  (React only)
  engine/       duckdb init, ingest, catalog, profile, query, normalize, sqlGuard, samples, export,
                chartData, filters (dashboard filter views + AST table rewrite)
  ai/           models, providers, prompts/, schemas, context, pipeline, dashboard, fixtures/  (no React/DOM)
  dashboard/    schema (Zod), layout (placement), run (guarded, filtered tile runs)  (no React/DOM)
  charts/       classify, select (chart choice), shape (data → series), toOption (→ ECharts option), theme  (pure)
  workers/      *.worker.ts (Comlink wiring only) + clients.ts (typed main-thread clients)
  stores/       zustand stores      lib/  format, errors, theme, ids, idb      types/  shared types
  test/         setup, fixtures
docs/PRD.md     evals/ (questions.jsonl, run.eval.ts, report.md)     e2e/ (Playwright)
```

## Code conventions
- Strict TS. No `any` (use `unknown` + Zod). No `!` non-null assertions outside tests.
- Types come from Zod schemas via `z.infer`; define each schema once (`src/ai/schemas.ts`, `src/engine/types.ts`).
- Pure logic (chart selection, SQL guard, prompt builders, normalizers, formatters) lives outside React
  and has unit tests. Components stay thin.
- Function components, named exports, one component per file, PascalCase filenames; hooks are `useX.ts`.
- Errors: engine/ai functions throw or return `AppError { code, message, detail }`; the UI shows a friendly
  one-liner plus "Show details". Never swallow errors.
- Anything slow accepts an `AbortSignal` and can be cancelled from the UI.
- Import via the `@/` alias. Keep files under ~300 lines; split when larger.
- All number/date formatting goes through `src/lib/format.ts` (Intl, locale-aware, compact, currency).

## Privacy & security (hard rules)
- Only `src/ai/context.ts` builds what is sent to an LLM, per privacy mode. Every request/response is
  logged to the AI payload inspector (API keys redacted).
- Every LLM-generated SQL passes `src/engine/sqlGuard.ts` before execution: exactly one SELECT/WITH
  statement, only known tables/CTEs, table functions from an allowlist, no ATTACH/COPY/INSTALL/LOAD/SET/PRAGMA.
- Generated Python never runs without explicit user approval (unless the user enabled auto-run), and
  only inside the Python worker.
- API keys live in memory; persisted to IndexedDB only if the user ticks "Remember on this device".
  Never read keys from `import.meta.env`, never log them, never include them in exports or commits.
- Data values and column names are untrusted text (possible prompt injection). Delimit them in prompts.
- No analytics or third-party requests besides the chosen LLM API and the pinned CDNs (Pyodide, DuckDB extensions).

## Performance rules
- Never materialize a large result in JS. Grids page from DuckDB; charts receive ≤ 5,000 points
  (aggregate or downsample in SQL first).
- Lazy-load DuckDB-WASM, Pyodide, ECharts, LangChain providers and CodeMirror via dynamic `import()`.
  Initial JS budget ≤ 350 KB gzipped.
- No main-thread task > 50 ms while scrolling or querying the 1M-row sample (verify in the Performance panel).
- Charts: create the ECharts instance once, then `setOption`; memoize options.

## Definition of done (every feature)
1. `npm run typecheck && npm run lint && npm test && npm run build` all pass.
2. New pure logic has unit tests; new user flows add or extend a Playwright spec (demo mode).
3. Verified in the browser with `npm run dev`; data-heavy features verified on the 1M-row sample.
4. Checkbox ticked in `docs/PRD.md`; deviations recorded in `docs/PRD.md` §12 Decisions log.

## Workflow
- One milestone at a time, in order. Start each feature in plan mode: restate its AC, list the files to
  touch and how you'll verify, then implement.
- Small commits with conventional prefixes: `feat(ask): ...`, `fix(engine): ...`, `test(charts): ...`.
- If a requirement is ambiguous or conflicts with these rules, ask instead of guessing.
- No major-version upgrades or new dependencies without asking.

## Gotchas
- DuckDB-WASM + Vite: import the `mvp` and `eh` bundles with `?url`
  (`@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url`, `.../duckdb-browser-mvp.worker.js?url`, same for `eh`),
  then `selectBundle`. Don't use the `coi` bundle: we don't set COOP/COEP headers in v1.
  Keep duckdb-wasm and pyodide in `optimizeDeps.exclude`.
- DuckDB returns BIGINT as `BigInt`, DECIMAL/HUGEINT and temporals in Arrow-specific forms. Everything goes
  through `src/engine/normalize.ts` before reaching React, ECharts, JSON.stringify or IndexedDB.
- `apache-arrow` comes transitively from duckdb-wasm; never add a different major as a direct dependency.
- DuckDB-WASM (no threads) runs queries one at a time: keep grid page queries small and cancel stale ones.
- Pyodide: `indexURL` must use the `version` exported by the installed `pyodide` package
  (`https://cdn.jsdelivr.net/pyodide/v<version>/full/`); never mix versions.
- SheetJS comes from `https://cdn.sheetjs.com/...tgz`; never `npm i xlsx` (the registry copy is stale).
- react-grid-layout v2 ships its own types: don't add `@types/react-grid-layout`; use the v2 API
  (`useContainerWidth`, `gridConfig`, `dragConfig`), not `react-grid-layout/legacy`.
- LangChain in the browser: `ChatAnthropic` needs `clientOptions: { dangerouslyAllowBrowser: true }`,
  `ChatOpenAI` needs `configuration: { dangerouslyAllowBrowser: true }`. Intentional (BYOK), not a bug.
- Structured-output schemas: use required fields with `.nullable()` rather than `.optional()`.
- DuckDB's Node runtime (tests, scripts) writes `COPY ... TO` to the real disk and doesn't overwrite
  existing files: always COPY into a fresh temp dir.
- Unit tests are typechecked by `tsconfig.test.json` (adds Node types); app code by `tsconfig.app.json`.
- TanStack Table is v9: `useTable({ features: tableFeatures({...}) })`, features are opt-in (no
  `getVisibleLeafColumns` without the visibility feature). With `manualSorting` the table holds no
  rows, so set `sortDescFirst` per column explicitly.
- `COPY … TO` needs `USE_TMP_FILE false` (see PRD D26). DuckDB errors can arrive as JSON in the
  browser: always wrap them with `duckdbError`.
- A dependency only reached through a lazy import or a worker must be listed in
  `optimizeDeps.include` in vite.config.ts, or the dev server reloads open pages when it finds it.
- Workers: `new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })`.
- LangChain retries in its own caller (the SDK clients run with `maxRetries: 0`): set `maxRetries` on
  `ChatAnthropic`/`ChatOpenAI` (2), or failures back off for minutes. Structured output uses
  `method: 'jsonSchema'` (tool calling conflicts with adaptive thinking); see PRD D29–D30.
- e2e never needs a key: provider flows mock `https://api.anthropic.com` with `page.route`
  (`e2e/ai-provider.spec.ts`), which runs the real LangChain + SDK code in the browser.
- ECharts 6: `grid.containLabel` is deprecated; use `outerBoundsMode: 'same', outerBoundsContain: 'all'`
  (keeps axis names inside too). Time axes need `useUTC: true` (our dates are UTC wall clock). ECharts
  can't parse oklch colors: chart colors are hex in `src/charts/theme.ts`.
- `sr-only` (and any absolutely positioned) elements inside a scrolling container need a positioned
  ancestor (`relative`), or they stretch the page and `scrollIntoView` scrolls the whole document.
- Zustand 5: a selector must not build a new object or array on each call (e.g. `findTile(...)` inside
  `useStore(...)`): it re-renders forever. Select the stable state and derive with `useMemo`.
- Pyodide runs in `src/workers/python.worker.ts` (logic in `python.ts`, testable with a fake runtime).
  The real-Pyodide test is opt-in (`RUN_PYODIDE=1 npx vitest run src/workers/python.test.ts`): it
  downloads ~20 MB from the CDN and caches packages in a temp dir, never in node_modules.
- Production CSP (`CONTENT_SECURITY_POLICY` in vite.config.ts, build only): a new third-party host, inline
  script or eval breaks the build's `e2e/privacy.spec.ts` (run with `CI=1`). Change the policy only with a
  PRD §12 entry (D66). Import `z` from `@/lib/zod` (jitless), never from 'zod' (lint enforces it).
- `engine.registerBuffer(name, bytes)` transfers the bytes to the DuckDB worker: read `bytes.length`
  before the call, never after.
- Model IDs live only in `src/ai/models.ts` (default `claude-sonnet-5`, fast `claude-haiku-4-5-20251001`).
  Check provider docs before changing them.
