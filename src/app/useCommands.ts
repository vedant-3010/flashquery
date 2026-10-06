import { useMemo } from 'react'
import { DEMO_TABLE } from '@/ai/fixtures'
import { DEMO_QUESTIONS } from '@/ai/providers/fixture'
import { SAMPLES } from '@/engine/samples'
import { useAskStore } from '@/stores/ask'
import { useDashboardStore } from '@/stores/dashboard'
import { useDatasetsStore } from '@/stores/datasets'
import { useHistoryStore } from '@/stores/history'
import { activeApiKey, useSettingsStore } from '@/stores/settings'
import { useSqlStore } from '@/stores/sql'
import { useUiStore } from '@/stores/ui'

export interface Command {
  id: string
  label: string
  group: string
  keywords?: string
  run: () => void
}

const MAX_QUESTIONS = 8

/** Everything the command palette can do (F-SHELL-07), built from the current state. */
export function useCommands(): Command[] {
  const datasets = useDatasetsStore((state) => state.datasets)
  const history = useHistoryStore((state) => state.entries)
  const dashboards = useDashboardStore((state) => state.dashboards)
  const demo = useSettingsStore((state) => activeApiKey(state) === null)
  const privacyMode = useSettingsStore((state) => state.privacyMode)

  return useMemo(() => {
    const ui = useUiStore.getState()
    const settings = useSettingsStore.getState()
    const ask = (question: string) => {
      ui.setView('workspace')
      void useAskStore.getState().ask(question)
    }
    const commands: Command[] = [
      {
        id: 'go-workspace',
        label: 'Go to Workspace',
        group: 'Go to',
        run: () => ui.setView('workspace'),
      },
      {
        id: 'go-sql',
        label: 'Go to SQL',
        group: 'Go to',
        keywords: 'scratchpad editor query',
        run: () => ui.setView('sql'),
      },
      {
        id: 'go-dashboard',
        label: 'Go to Dashboard',
        group: 'Go to',
        run: () => ui.setView('dashboard'),
      },
    ]

    // Questions: recent ones from history, then the demo questions when they can be answered.
    if (datasets.length > 0) {
      const asked = history
        .filter((entry) => entry.kind === 'question')
        .map((entry) => entry.text)
        .filter((text, index, all) => all.indexOf(text) === index)
        .slice(0, MAX_QUESTIONS)
      const suggested =
        demo && datasets.some((d) => d.table === DEMO_TABLE)
          ? DEMO_QUESTIONS.filter((q) => !asked.includes(q))
          : []
      for (const question of [...asked, ...suggested]) {
        commands.push({
          id: `ask-${question}`,
          label: question,
          group: 'Ask',
          run: () => ask(question),
        })
      }
    }

    for (const dataset of datasets) {
      commands.push(
        {
          id: `preview-${dataset.id}`,
          label: `Preview ${dataset.label}`,
          group: 'Datasets',
          keywords: `${dataset.table} rows table`,
          run: () => ui.showPreview(dataset.table),
        },
        {
          id: `sql-${dataset.id}`,
          label: `Query ${dataset.table} in SQL`,
          group: 'Datasets',
          keywords: dataset.label,
          run: () => useSqlStore.getState().openTable(dataset.table),
        },
      )
    }
    for (const sample of SAMPLES) {
      commands.push({
        id: `sample-${sample.id}`,
        label: `Load sample: ${sample.label}`,
        group: 'Datasets',
        keywords: 'try demo data',
        run: () => useDatasetsStore.getState().loadSample(sample.id),
      })
    }
    commands.push({
      id: 'paste',
      label: 'Paste data from a spreadsheet',
      group: 'Datasets',
      keywords: 'tsv excel sheets clipboard',
      run: () => ui.setPasteText(''),
    })

    for (const dashboard of dashboards) {
      commands.push({
        id: `dashboard-${dashboard.id}`,
        label: `Open dashboard: ${dashboard.name}`,
        group: 'Dashboards',
        run: () => {
          useDashboardStore.getState().setActive(dashboard.id)
          ui.setView('dashboard')
        },
      })
    }

    const other = privacyMode === 'strict' ? 'balanced' : 'strict'
    commands.push(
      {
        id: 'settings',
        label: 'Open settings',
        group: 'Settings',
        keywords: 'api key provider model',
        run: () => ui.setSettingsOpen(true),
      },
      {
        id: 'privacy',
        label: `Privacy mode: switch to ${other === 'strict' ? 'Strict' : 'Balanced'}`,
        group: 'Settings',
        run: () => settings.setPrivacyMode(other),
      },
      {
        id: 'theme-light',
        label: 'Theme: Light',
        group: 'Settings',
        run: () => settings.setTheme('light'),
      },
      {
        id: 'theme-dark',
        label: 'Theme: Dark',
        group: 'Settings',
        run: () => settings.setTheme('dark'),
      },
      {
        id: 'theme-system',
        label: 'Theme: Match the system',
        group: 'Settings',
        run: () => settings.setTheme('system'),
      },
      {
        id: 'inspector',
        label: 'Open the AI inspector',
        group: 'Help',
        keywords: 'payload privacy requests',
        run: () => {
          ui.setSidePanelTab('inspector')
          ui.setSidePanelOpen(true)
        },
      },
      {
        id: 'how',
        label: 'How flashQuery works',
        group: 'Help',
        keywords: 'privacy',
        run: () => ui.setHowItWorksOpen(true),
      },
      {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        group: 'Help',
        run: () => ui.setShortcutsOpen(true),
      },
      {
        id: 'bench',
        label: 'Run the benchmark',
        group: 'Help',
        keywords: 'performance speed',
        run: () => {
          window.location.hash = '#/bench'
        },
      },
    )
    return commands
  }, [datasets, history, dashboards, demo, privacyMode])
}
