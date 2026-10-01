import CodeMirror, { EditorView, keymap, Prec } from '@uiw/react-codemirror'
import { useMemo } from 'react'

// Loaded with React.lazy (CodeMirror stays out of the initial bundle). No Python language mode:
// that would be a new dependency (@codemirror/lang-python); plain text with line numbers is enough
// to read and edit the generated code.

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  /** Mod-Enter. Should be stable: the editor's extensions depend on it. */
  onRun: () => unknown
  dark: boolean
  label: string
  readOnly?: boolean
}

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '12.5px', backgroundColor: 'transparent' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
})

export function CodeEditor({
  value,
  onChange,
  onRun,
  dark,
  label,
  readOnly = false,
}: CodeEditorProps) {
  const extensions = useMemo(
    () => [
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
      EditorView.contentAttributes.of({ 'aria-label': label }),
      Prec.highest(editorTheme),
    ],
    [onRun, label],
  )
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={dark ? 'dark' : 'light'}
      height="100%"
      className="h-full"
      editable={!readOnly}
      indentWithTab={false}
      basicSetup={{ foldGutter: false, highlightActiveLine: false, autocompletion: false }}
    />
  )
}
