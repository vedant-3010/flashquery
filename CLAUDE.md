# HushGlance

Privacy-first AI data analyst that runs entirely in the browser. Users load a CSV / Excel / Parquet / JSON
file and ask questions in plain English ("Which region grew fastest?"). HushGlance writes DuckDB SQL with an
LLM, runs it client-side in DuckDB-WASM, picks a chart, explains its reasoning, and lets users pin answers
to a drag-and-drop dashboard. Stats/forecast questions can run as Python (pandas) via Pyodide.
No server can read the user's files: analysis runs in the browser, and a signed-in user's projects
and files are saved to their account end-to-end encrypted (M17, D123: a key only their passphrase or
recovery key opens). Only what the active privacy mode allows is sent (Strict, the default since
D122: names and types only; Balanced, opt-in: a few sample values too) to the LLM provider the user
picks with their own API key,
or, for a signed-in user without one, to HushGlance AI (M16, D119): our `ai` Edge Function passes the
request to OpenRouter with zero data retention forced and stores none of it (3 free questions, then
Starter or Pro through Dodo Payments, D120–D121).
v2 (PRD D100) adds accounts (Supabase): a Home page with projects, and dashboards saved to the cloud
and shared by invite or link. Where an account service is configured, the app asks for an account;
the try demo (`/app/try`) stays open (D115). The account service stores only what a signed-in user
saves (encrypted, M17) or shares; guests and the demo never talk to it. It speaks to founders, finance and
accounting people and anyone in business first, privacy before everything, with one section for data
people (D117): business-facing copy avoids DuckDB, WebAssembly, p95, GROUP BY, BYOK, Pyodide and
"schema"; the SQL view, inspector and "For data people" keep the technical words.

- Requirements, feature IDs (e.g. `F-ASK-05`), acceptance criteria (AC) and milestones: `docs/PRD.md`.
  Read the relevant section before starting any feature.
- Area rules load automatically from `.claude/rules/` (data engine, AI pipeline, UI).
- Progress = ticked checkboxes in `docs/PRD.md` §4. Milestone order: `docs/PRD.md` §10 (v2: M9–M17).

## Product principles (use these to break ties)
1. **Private by default**: no row goes to an AI beyond what the privacy mode allows, and the user can
   inspect every payload sent to the AI. Nothing readable goes to the account service: saved work is
   encrypted in the browser first (M17, D123), and a shared dashboard uploads only after a dialog
   lists exactly what will go (v2, D103).
2. **Explainable**: every answer shows its SQL, a plain-English explanation, its assumptions, and why that
   chart was chosen. SQL is editable and re-runnable.
3. **Never block the UI**: heavy work runs in workers; the app stays responsive on 1M+ rows.
4. **Works without a key**: demo mode + sample data must always work (this is how recruiters see it).
5. **LLM output is untrusted input**: validate with Zod and the SQL guard before anything executes.

## Commands
- `npm run dev`: dev server: the landing page at http://localhost:5173/, the app at http://localhost:5173/app/
- `npm run build`: `tsc -b` + production build
- `npm run check`: typecheck + lint + unit + build + `npm run size` (initial JS gzip: app ≤ 350 KB, landing ≤ 150 KB), same as CI
- `npm run typecheck` / `npm run lint` / `npm run format`
- `npm test`: Vitest (one file: `npx vitest run src/engine/sqlGuard.test.ts`)
- `npm run e2e`: Playwright; runs in demo mode, no API key needed
- `ANTHROPIC_API_KEY=… npm run evals` (or `OPENAI_API_KEY=…`): NL→SQL evals → `evals/report.md` (`EVAL_DRY_RUN=1` checks the
  harness without a key; see `.claude/rules/ai.md`)
- `http://localhost:5173/app/bench`: benchmark page (§5 budgets on this device; "Copy as Markdown")
- `node scripts/record-demo.mjs` (after `VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= npm run build`,
  accounts off): re-records the README demo, `docs/demo.png`
- `node scripts/record-og.mjs` (after `npm run build`): re-records the landing page's `public/og.png`
- Deploy: Vercel, configured by `vercel.json`; steps and checks in `docs/DEPLOY.md`; the full launch
  checklist in `docs/RELEASE.md`. `VITE_SITE_URL` (Vercel) makes the landing page's link-preview
  tags absolute; `/app/` is kept out of search engines (`robots.txt`, `X-Robots-Tag`)
- Edge Functions locally: `npx supabase functions serve --env-file supabase/functions/.env` (copy
  `.env.example` there; `node scripts/hosted-stub.mjs` stands in for OpenRouter so nothing costs
  money). Setting up hosted AI and Pro end to end: `docs/HOSTED_AI_SETUP.md`. Their logic is
  in `supabase/functions/_shared/` (plain TS, no Deno imports), unit-tested from `src/test/edge/`.
- Accounts locally (optional, needs Docker): `npx supabase start` runs Supabase on this computer
  (`supabase/config.toml`; migrations from `supabase/migrations/` apply on start), then put its API URL
  and publishable key in `.env.local` (see `.env.example`). Emails land in Mailpit
  (http://127.0.0.1:54324), the database in Studio (http://127.0.0.1:54323). `npx supabase stop`
  when done. Without `.env.local`, accounts are off.
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
- v2 (approved 2026-10-08, D105; added in the milestone that needs them): routing with `wouter` (paths
  under `/app/`, M12); accounts and sharing with `@supabase/supabase-js` (lazy chunk, M13)

## Architecture
```
Main thread: React UI, Zustand stores, LLM calls (network only, lazy-loaded chunk)
 ├─ src/engine/*           → DuckDB-WASM worker (AsyncDuckDB): ingest, profile, query, export
 ├─ workers/xlsx.worker    → SheetJS: workbook → CSV bytes → registered in DuckDB
 └─ workers/python.worker  → Pyodide + pandas: CSV bytes in → tables/text out
Optional (v2): src/platform/* → Supabase (Auth + Postgres with RLS): accounts, saved and shared dashboards
```
Ask pipeline (`src/ai/pipeline.ts`); each stage emits a status event for the UI timeline:
`buildContext → plan (LLM → SqlPlan; Balanced: ≤ 3 'explore' queries first) → guard (Zod + AST allowlist + EXPLAIN) → execute (normalized,
row-capped) → self-correct ≤ 2× on error → chooseChart (heuristic; LLM hint only if compatible) →
local summary → result check (empty / all-NULL / one row for a breakdown: one guided retry within the
same budget)`, then, in Balanced mode with a key, the AI summary (`narrate`) once the answer is shown.
The planning request carries up to 3 curated examples and, in Balanced mode, up to 3 learned ones.

## Layout
```
src/
  landing/      the landing page at / (own entry, own Tailwind build; film/, how/, features/, sections/)
  app/          routes (wouter, base /app: Home, /p/:id[/view], /try, /new, /bench), shell, top bar
  components/   shared app components (EmptyState, IconButton); ui/ = shadcn/ui primitives (generated)
  hooks/        shared React hooks (useMediaQuery, useResolvedTheme)
  features/     home/ datasets/ grid/ sql/ ask/ explain/ charts/ dashboard/ python/ settings/ bench/
                account/ sharing/ plan/ sync/  (React only)
  engine/       duckdb init, ingest, catalog, profile, query, normalize, sqlGuard, samples, export,
                chartData, filters (dashboard filter views + AST table rewrite)
  ai/           models, providers, prompts/, schemas, context, pipeline, dashboard, fixtures/  (no React/DOM)
  dashboard/    schema (Zod), layout (placement), run (guarded, filtered tile runs)  (no React/DOM)
  charts/       classify, select (rules; builders in build/), shape + shapeMore (data → series), toOption
                (→ ECharts option; builders in options/), theme (palettes)  (pure)
  workers/      *.worker.ts (Comlink wiring only) + clients.ts (typed main-thread clients)
  stores/       zustand stores      lib/  format, errors, theme, ids, idb      types/  shared types
  platform/     (v2) the only code that talks to Supabase: client, auth, cloud dashboards, sharing,
                plans, hosted AI, the encrypted workspace (vault.ts)
  test/         setup, fixtures
docs/           PRD.md, ARCHITECTURE.md, SECURITY.md, DEPLOY.md, RELEASE.md, demo.png     evals/ (questions.jsonl, run.eval.ts)
e2e/ (Playwright)     scripts/ (sample + fixture generators, record-demo, record-og)
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
- v2 account service (D100–D104):
  - Only `src/platform/` talks to Supabase, and it's a lazy chunk. Guests and the demo load none of it
    and make no request to it (`e2e/privacy.spec.ts`).
  - Nothing uploads without the share-consent dialog listing exactly what will go (tiles, rows,
    columns). Shared dashboards carry results only, never source files.
  - The CSP allows exactly the project's `https://` and `wss://` Supabase host, never a wildcard.
  - The Supabase URL and publishable key are public config read from `VITE_SUPABASE_*` (D102). The
    rule above about `import.meta.env` is about users' LLM keys. The service-role key never goes in
    the client or the repo.
  - Every table has row-level security, with policy tests.
- v2 hosted AI and plans (M16, D119–D121):
  - The `ai` Edge Function never stores or logs a request or response body (status lines only), and
    forces `provider: { zdr: true, data_collection: 'deny', require_parameters: true }`, the model
    list and the output cap on every request. The OpenRouter key exists only as a function secret.
  - Quotas, plans and subscriptions change only on the server (`ai_begin`, `billing_apply`: service
    role only); clients read their own rows. Limits, prices and the model list are table rows.
  - Payments: Dodo's hosted checkout and portal by redirect, never a payment script on our pages; a
    subscription changes only through the verified webhook.
  - Strict mode sends no data value in error text either (`scrubError` in `context.ts`).
- The encrypted workspace (M17, D123, `docs/SECURITY.md`):
  - Everything saved to the account is encrypted in the browser first (`src/lib/vault.ts`): records
    and file chunks with additional data naming their place. Never send a plaintext project record,
    file, name or question to Supabase; `e2e/sync.spec.ts` has a canary for it.
  - The data key is a non-extractable `CryptoKey`; it's stored (IndexedDB, `vaultKey`) only with
    "Remember on this device". The passphrase and recovery key never leave the browser.
  - Projects marked "Keep on this device only" and the try projects never sync.
- Voice input uses on-device speech recognition only (D106): no audio leaves the device.

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
- Projects (D113): project data (history, dashboards, notes, suggestions, the kept-file manifest)
  loads and saves through `inProject(spec)` (`p:<id>:<key>` in IndexedDB), which throws when no
  project is open; settings, eval cases and the project list stay global. A page holds one project:
  `openProject` (`src/stores/projectSession.ts`) loads it once, and opening another one reloads the
  page after `whenSaved()`. Home never loads project stores. A new per-project record goes in
  `PROJECT_RECORD_KEYS` (the v1 migration moves it).
- Routes: wouter with base `/app`, so `Link`/`navigate` take `/p/x` and rendered hrefs include
  `/app`. The dev and preview servers serve the app for any path under `/app/` (`appRoutes` in
  vite.config.ts), as Vercel does (`vercel.json` rewrites). e2e: `/app/` is Home; specs open the
  workspace with `openProject(page)` from `e2e/app.ts` (it visits `/app/new`).
- Accounts (D114): supabase-js is reached only through `src/platform/`, a lazy chunk; lint rejects
  importing it, `@/platform/auth` or `@/platform/supabase` anywhere else (type imports are fine), and
  only `useAuthStore` (`src/stores/auth.ts`) loads it. `accountsConfig()` (`platform/config.ts`) says whether accounts are
  on without loading it. e2e: `mockSupabase(page)` from `e2e/supabase.ts` mocks the service for the
  real supabase-js (the dev server reads its URL from `window.__HushGlanceAccounts`; CI builds with
  the same URL). A new table needs row-level security and policies (`src/test/migrations.test.ts`)
  and pgTAP policy tests (`supabase/tests/`, run with `npx supabase test db` against the local stack).
- Sharing (D116): the app reaches `src/platform/sharing.ts` only through `sharing()` in
  `src/stores/sharing.ts` (lint). What uploads is `toSharedDoc` (`src/dashboard/cloud.ts`), always
  after `ConsentDialog`. A policy must not rely on `dashboard_role()` to see a row being inserted
  (the insert reads it back): check `owner_id` on the row. e2e: `mockCloud()` (`e2e/supabaseSharing.ts`)
  passed to `signIn`/`mockSupabase` lets several pages (owner, member, guest) share one service.
- Sign-in gate (D115): `RequireAccount` wraps Home, `/new` and projects (not the try project,
  `TRY_PROJECT_ID`). e2e: `openProject`/`signIn` (`e2e/app.ts`) sign in to the mock first; guest
  checks use `/app/try`. The sign-in pages share the landing's palette (in the app theme under the
  landing's names: keep it in step with `landing.css`; `.paper-scope`, `.ink-accent`) but no code:
  importing a landing module into the app splits a chunk off the landing page. Their animations are
  CSS (`.auth-*`). The app's Tailwind skips `src/landing/` (`@source not` in `index.css`).
- Content sized in pixels (the ECharts canvas, the grid's rows) sets the minimum width of every grid
  and flex item around it, so the page can't shrink when the window narrows. Its host gets
  `contain-inline-size` (`EChart.tsx`, `DataGrid.tsx`) and takes its width from its container;
  `e2e/ask.spec.ts` checks that the answer card follows the window.
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
- The CSP's `connect-src` allows `http://localhost:*` and `http://127.0.0.1:*` for local model servers
  (F-AI-06, D85) and nothing else beyond the named hosts. Never widen it to `https:` (D86).
- New users start in Strict (D122). e2e checks of what only Balanced sends (sample rows, the AI
  summary, exploration, AI suggestions, learned examples) call `chooseBalanced(page)` from
  `e2e/app.ts` first.
- Settings are v8 (v5: local server, kept files; v6: effort; v7: chart palette; v8: OpenRouter,
  `aiSource`, `hostedModel`, `hostedNoticeSeen`). A new saved field needs a migration in
  `SETTINGS_RECORD`.
- Who answers (M16): `useAiMode()` / `currentAiMode()` (`src/stores/aiMode.ts`) is 'hosted', 'own' or
  'demo'; use it, not `activeApiKey(...) === null`, for "is this demo mode?". `currentProvider(effort,
  meter)` takes the hosted question's meter: `meterFor(answerId)` for an ask and everything after it,
  `newMeter('dashboard' | 'suggest')` otherwise. The plan calls (`@/platform/plans`,
  `@/platform/hostedAi`) are reached only through `src/stores/plan.ts` (lint). Hosted AI is "not
  offered" when the catalog can't load (e2e's mock answers 404 unless `mockHosted()` from
  `e2e/hosted.ts` is added after `signIn`): signed-in specs stay in demo mode by default.
- The try link's opening question always uses the demo set (`ask(q, { demo: true })`), so it never
  spends a hosted question or the user's key.
- OpenRouter (provider `openrouter`, own key or hosted) goes through `ChatOpenAICompletions` (chat
  completions only); effort and the output cap go in `modelKwargs`, since LangChain sends
  `reasoning_effort` only to model names it knows.
- Chart palettes (`src/charts/theme.ts`) must pass `src/lib/contrast.test.ts` (marks ≥ 3:1) and
  `src/lib/colorVision.test.ts` (each pair ≥ 6 ΔE under protan/deutan/tritan; the default ≥ 12).
- Dropdowns and popovers that can grow long cap their height at Radix's
  `--radix-*-content-available-height`, or they run off short screens (D111).
- The generated `DropdownMenuContent` is as wide as its trigger: give every menu a width
  (`w-auto` to fit its items, or e.g. `w-72`), and `truncate` long names (table names) with a `title`.
- The encrypted workspace (M17): `src/platform/vault.ts` is reached only through `src/stores/sync.ts`
  (lint). The session (`syncSession.ts`) holds the vault and the key; the engine (`syncEngine.ts`, no
  React or Supabase, tested against a fake) pushes records 3 s after `saveRecord` announces them
  (`onRecordSaved` in `idb.ts`) and pulls changes; another device's records are written with
  `writeEnvelope`, which isn't announced back. Which local records sync: `remoteName` in
  `syncMeta.ts` (`projects` and `PROJECT_RECORD_KEYS`). A new per-project record syncs once it's in
  `PROJECT_RECORD_KEYS` and the engine's specs (`syncHost.ts`). Kept files: a synced project always
  keeps its files (`keepsFiles` in `persistFiles.ts`), uploaded and downloaded through
  `setCloudFiles` (`syncFiles.ts`). Projects are v2 (`localOnly`), the kept-files list v2 (`cloud`).
  e2e: `mockVault(page, state)` from `e2e/vault.ts` after `signIn` (one state for several devices);
  without it the vault tables answer 404 and syncing is "not offered", so other specs are unaffected.
- Voice input (`src/features/ask/speech.ts`): never call `SpeechRecognition.available()` until the mic
  is pressed. Playwright's Chromium has the API but crashes the tab on that call (real Chrome answers).
  e2e uses a fake on-device recognizer (`e2e/voice.spec.ts`); don't click the mic without one.
- Guests see a "sign in for 3 free questions" link next to the demo note: match the top bar's sign-in
  link with `{ name: 'Sign in', exact: true }`.
- The ask bar's model chip is named "Model: …", so match the top bar's badge with
  `{ name: 'Demo mode', exact: true }` (it shows "Demo" on medium screens; the name keeps "mode").
  Privacy and the engine share one pill (`StatusPill`, D118), named "Status: Strict, engine
  ready" (match `/^Status: Strict/` or `/engine ready$/`); its popover switches the mode and
  restarts the engine. How it works, shortcuts and theme are under "Help and appearance".
- A finished answer folds its steps (D118): read them with `answerSteps(answer)` from `e2e/app.ts`.
- No sparkle icons (D118): lint rejects `Sparkles`/`Sparkle`/`WandSparkles`; pick an icon for what
  the action does. The app's one brand colour is `--brand` (`text-brand`), for an answer's key
  figures only (`splitNumbers`); everything else keeps the neutral theme.
- Demo answers come in sets, one per sample (`DEMO_SETS` in `src/ai/fixtures.ts`: Global Sales and
  Company finances, D117); the demo provider answers only from loaded samples. A new demo question
  goes in its set's JSON and in `EXPECTED_CHARTS` (`fixtures.test.ts` runs it on the sample). The try
  projects (`TRY_DEMOS`, `isTryProject` in `app/tryDemo.ts`) are the ones guests may open.
- Phones (D117): below `md` the top bars put their extras in `AppMenu` ("More"); below 640 px
  dashboards stack (`StackedTiles`, `stackRows` in `dashboard/layout.ts`). `e2e/responsive.spec.ts`
  checks 390 and 820 px; match "More" with `exact: true` (a start card says "and more").
- The Python worker also runs the scratchpad notebook (`src/workers/notebook.ts`, own namespace);
  Stop/timeout reset both. Kept files (`src/stores/persistFiles.ts`) live in OPFS, opt-in only.
- Two pages (PRD D99): `index.html` is the landing page, `app/index.html` the app (served at
  `/app/`). e2e tests open the app with `page.goto('/app/')`. `npm run size` checks both budgets
  (app 350 KB, landing 150 KB gzip). The landing page must not import engine, AI or store code; its
  CSS (`src/landing/landing.css`) only scans `src/landing/` and `BrandMark.tsx`.
- Model IDs live only in `src/ai/models.ts` (default `claude-sonnet-5`, fast `claude-haiku-4-5-20251001`;
  OpenRouter slugs: `DEFAULT_MODEL.openrouter`, `HOSTED_DEFAULT_MODEL`), plus the hosted list in the
  `ai_models` table. Check provider docs (and openrouter.ai/api/v1/models) before changing them.
