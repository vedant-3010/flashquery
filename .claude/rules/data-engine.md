---
paths:
  - "src/engine/**"
  - "src/workers/**"
  - "src/features/datasets/**"
  - "src/features/grid/**"
  - "src/features/python/**"
---
# Data engine rules (DuckDB-WASM, workers, Pyodide)

## DuckDB lifecycle
- One `AsyncDuckDB` per tab, created lazily by `getDb()` in `src/engine/duckdb.ts` (memoized promise).
  Expose engine status (`idle | loading | ready | error`, version) to the UI. Start loading in an idle
  callback after first paint, or immediately on the first dataset action.
- On init: explicitly `LOAD` the extensions we need (parquet, json; check which are built in for the
  installed version), then `SET autoinstall_known_extensions = false; SET autoload_known_extensions = false;`
  so generated SQL can never pull in httpfs or anything else.
- "Restart engine": terminate, re-instantiate, re-ingest from retained `File` handles, restore views.

## Ingest
- CSV/TSV/Parquet/JSON: `registerFileHandle(name, file, DuckDBDataProtocol.BROWSER_FILEREADER, true)`;
  never read whole files into JS memory. Then `CREATE TABLE "<t>" AS SELECT * FROM read_csv(...)`,
  `read_parquet(...)` or `read_json_auto(...)`.
- CSV: `read_csv('<name>', auto_detect = true, sample_size = 20480)`. Show the sniffed delimiter, header and
  types; allow re-import with overrides (delimiter, header, skip rows, date format, all-varchar, ignore_errors).
- XLSX/XLS: parse in `xlsx.worker.ts` (SheetJS `read(buf, { dense: true })`), convert the chosen sheet to
  CSV bytes, `Comlink.transfer` the buffer back, `registerFileBuffer`, ingest as CSV. Multi-sheet → sheet picker.
- Table names: snake_case from the filename, `[a-z0-9_]` only, `t_` prefix if it starts with a digit,
  de-duplicated (`sales`, `sales_2`). Always double-quote identifiers in SQL we build.
- After ingest: row count, `SUMMARIZE "<t>"`, top-5 values for columns with approx_unique ≤ 50, semantic
  role inference (id, time, measure, category, geo, boolean, text). Store a Zod-validated `DatasetProfile`
  with a `schemaHash` (hash of ordered column names + types).
- Guardrails: warn above 500 MB, recommend Parquet above 1 GB, catch out-of-memory and explain it.
- Parse errors: surface DuckDB's line/column context and offer "skip bad rows" (ignore_errors).

## Querying
- Every query goes through `runQuery(sql, { signal, maxRows, timeoutMs })` in `src/engine/query.ts`:
  `DESCRIBE` the SQL → build a normalizing outer SELECT → execute with a row cap → return
  `{ columns: ColumnMeta[], rows, rowCount, truncated, elapsedMs, viewName }`.
- Normalization (in SQL where possible): DECIMAL/HUGEINT → DOUBLE; DATE/TIMESTAMP → ISO-8601 VARCHAR
  (keep the logical type in `ColumnMeta`); INTERVAL/BLOB/LIST/STRUCT/MAP → VARCHAR.
  In JS: BigInt → number when `Number.isSafeInteger`, otherwise string.
- Large results: `CREATE OR REPLACE TEMP VIEW "result_<id>" AS <sql>` and page it in 200-row windows
  (LIMIT/OFFSET, LRU page cache, prefetch the next window). Grid sort/filter = new SQL over the view.
  Base tables page ordered by `rowid`.
- Cancellation: honour `AbortSignal`, cancel the pending DuckDB query, default timeout 30 s (setting).
- Export: `COPY (<sql>) TO 'export.<ext>' (FORMAT csv | parquet)` → `copyFileToBuffer` → Blob download →
  drop the virtual file.

## Synthetic demo data (src/engine/samples.ts)
- Generates the "Global Sales" table (`global_sales`) in pure SQL from `range(n)` for n = 10k / 100k / 1M.
- Deterministic: derive every pseudo-random value from `hash(i, '<salt>')`, never `random()`.
- Spec in `docs/PRD.md` §9 (columns, growth rates per region, seasonality). The headline demo question
  must have an unambiguous answer (APAC grows fastest). Put the generation SQL in the file header comment.

## Workers & Comlink
- `*.worker.ts` files only `expose()` logic modules; the logic stays importable and testable outside workers.
- Transfer `ArrayBuffer`s (`Comlink.transfer`); never post large arrays of objects.
- Every worker has `init()` (returns version info) and `dispose()`; typed clients live in `src/workers/clients.ts`.

## Pyodide
- Load only when the user first runs Python; show download/progress state (several MB, then packages).
- `loadPyodide({ indexURL })` with `indexURL = https://cdn.jsdelivr.net/pyodide/v<version>/full/`, where
  `<version>` is the `version` export of the `pyodide` npm package. Load packages with `loadPackagesFromImports`.
- Data in: run the source SQL in DuckDB (cap 200k rows; `USING SAMPLE` if larger and say so in the UI),
  `COPY ... TO 'df.csv'`, transfer the bytes, write to the Pyodide FS, `df = pd.read_csv(...)`.
- Code contract: generated code reads `df`, must assign `result` (a DataFrame, rendered through the normal
  table + chart pipeline) and may assign `summary` (str). Capture stdout/stderr.
- Timeout (default 60 s) or "Stop": terminate and recreate the worker; tell the user the Python session reset.
