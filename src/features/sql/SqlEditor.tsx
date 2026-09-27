import { PostgreSQL, sql, type SQLNamespace } from '@codemirror/lang-sql'
import CodeMirror, { EditorView, keymap, Prec } from '@uiw/react-codemirror'
import { useMemo } from 'react'

// Loaded with React.lazy from SqlView: CodeMirror stays out of the initial bundle (F-PERF-01).

interface SqlEditorProps {
  value: string
  onChange: (value: string) => void
  /** Run the query (Mod-Enter). Should be stable: the editor's extensions depend on it. */
  onRun: () => unknown
  /** Tables and their columns, for autocomplete. */
  schema: SQLNamespace
  /** Table whose columns complete without a `table.` prefix. */
  defaultTable: string | undefined
  dark: boolean
  placeholder: string
}

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: 'transparent' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
})

export function SqlEditor({
  value,
  onChange,
  onRun,
  schema,
  defaultTable,
  dark,
  placeholder,
}: SqlEditorProps) {
  const extensions = useMemo(
    () => [
      // PostgreSQL is the closest dialect CodeMirror ships to DuckDB's.
      sql({ dialect: PostgreSQL, schema, defaultTable, upperCaseKeywords: true }),
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              void onRun()
              return true
            },
          },
        ]),
      ),
      EditorView.contentAttributes.of({ 'aria-label': 'SQL query' }),
      EditorView.lineWrapping,
      // Above the light/dark theme's own background and gutter colors.
      Prec.highest(editorTheme),
    ],
    [schema, defaultTable, onRun],
  )

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={dark ? 'dark' : 'light'}
      height="100%"
      className="h-full"
      placeholder={placeholder}
      // Tab moves focus instead of indenting, so the editor never traps keyboard users.
      indentWithTab={false}
      basicSetup={{ foldGutter: false, highlightActiveLine: false }}
    />
  )
}
