---
paths:
  - "src/app/**"
  - "src/features/**"
  - "src/components/**"
  - "src/charts/**"
---
# UI rules (React, charts, grid, dashboard)

## General
- Build from shadcn/ui primitives in `src/components/ui/` (add with `npx shadcn@latest add <name>`).
- Every async surface has loading (skeleton), empty and error states. Errors: one-line message + "Show details".
- Dark mode via the `dark` class on `<html>`; ECharts gets a matching theme from `src/charts/theme.ts`.
- Accessibility: keyboard reachable, visible focus, `aria-label` on icon buttons, charts have an
  `aria-label` summary plus a "View as table" toggle, honour `prefers-reduced-motion` (no chart animation).
- Shortcuts: `/` focuses the ask box, `Ctrl/Cmd+Enter` runs the SQL editor, `Esc` cancels a running question,
  `?` opens the shortcuts dialog (`src/app/ShortcutsDialog.tsx`: list every new shortcut there).
- Background events (pinned, exported, engine restarted, saved) show a toast (`useToastStore`).
- Contrast: `src/lib/contrast.test.ts` checks the theme tokens in `index.css`; keep it passing when
  changing colours (text 4.5:1, chart marks 3:1).

## Charts
- `src/charts/select.ts` is the single source of truth: `selectChart({ columns, rows, rowCount, question,
  hint, title, currency }) → ChartSpec` with a human-readable `reason` (column classes in `classify.ts`;
  one builder per type in `src/charts/build/`: `basic.ts` for v1, `more.ts` for v2, D111).
  Rules table in `docs/PRD.md` §6, refinements in D44. Pure; table-driven unit tests. `buildSpec`,
  `chartChoices` and `respec` power the switcher (F-VIZ-03) and the settings popover (F-VIZ-06).
- An LLM `chartHint` is used only if it is compatible with the result shape; otherwise fall back to the rules
  (the reason says which).
- `src/charts/shape.ts` `prepare(spec, data)` pivots series, sorts, and applies top-N + "Other";
  `src/charts/toOption.ts`: `(spec, prepared, { theme, locale, animation }) → EChartsOption`. Both pure;
  snapshot tests. Data from the user's files never goes into HTML tooltips unescaped.
- Chart data comes from `src/engine/chartData.ts` (≤ 5,000 points: whole, sampled, every n-th or binned).
- `<EChart>`: `echarts.init` once per mount (canvas renderer), `setOption(option, { notMerge: true })` on
  change, `ResizeObserver` → `resize()`, `dispose()` on unmount. Register only the chart types and
  components we use via `echarts/core`.
- Above 5,000 points: aggregate in SQL first; lines use `sampling: 'lttb'`; scatter uses `large: true`.
- Numbers via `src/lib/format.ts`: Intl, compact notation, user-selectable locale (incl. `en-IN`
  lakh/crore grouping), currency from column metadata or settings.
- Colour-blind-safe categorical palette; never encode meaning by colour alone. Palettes live in
  `src/charts/theme.ts` (per chart, per dashboard, default in Settings) and are tested for contrast and
  for colour vision (`src/lib/colorVision.test.ts`). Option builders share one style in
  `src/charts/options/common.ts` (tooltips via `tooltipRow`, which escapes data).

## Grid
- TanStack Table in manual mode (`manualSorting`, `manualFiltering`, `manualPagination`) + TanStack Virtual
  for rows and columns. The row model is a windowed cache fed by `engine/paging.ts` (`PageCache`);
  unloaded rows render as skeleton rows. Fixed 28 px rows; grids taller than 15M px scale the scroll
  offset (`src/features/grid/DataGrid.tsx`).
- Header: type icon, name, sort indicator, profile popover (nulls, distinct, min/max, mini histogram
  computed on open: `src/engine/histogram.ts`), filter popover (F-GRID-04) with chips above the grid.
- Columns menu (visibility, order) and cell selection (click, Shift-click, row numbers, arrows;
  Ctrl/Cmd+C copies ≤ 10k rows re-read from DuckDB): `ColumnsMenu`, `selection.ts`, `useGridSelection`.
- Numbers right-aligned and locale-formatted; nulls shown as muted `null`.

## Dashboard
- react-grid-layout v2: `useContainerWidth()` + `<ReactGridLayout width gridConfig dragConfig resizeConfig>`,
  12 columns, drag only by `.tile-handle`. Defaults: KPI 3×2, chart 6×4, table 6×5, text 4×2. The tile
  menu's Size and Move earlier/later are the keyboard alternative to dragging.
- `DashboardTile` (Zod, `src/dashboard/schema.ts`): id, type ('chart' | 'kpi' | 'table' | 'text'), title, sql,
  chartSpec, text, layout { x, y, w, h }, datasetRefs [{ table, schemaHash, label, fileName, sample }],
  snapshot (last result ≤ 5,000 rows + timestamp + filtered), question, edited.
- Tiles render their snapshot instantly, then refresh from DuckDB if referenced tables exist with a matching
  `schemaHash`; otherwise show "Re-upload <file> to refresh" (`refreshWhenReady`, PRD D52). Every run goes
  through `src/dashboard/run.ts` (guard + filters).
- Persist to IndexedDB, debounced 500 ms on change. Export/import as JSON validated by Zod.
- Text tiles: `src/lib/markdown.ts` subset rendered as React elements; never `dangerouslySetInnerHTML`.
- Cross-filtering (`src/dashboard/crossFilter.ts`): a click adds a normal dashboard value filter.
  Presentation mode is read-only. Export: standalone HTML (`src/dashboard/exportHtml.ts`, escaped, its
  own no-script CSP) and print to PDF.
- Chart annotations (`src/charts/annotations.ts`) always carry a text label; stacked charts get only
  the target line.
