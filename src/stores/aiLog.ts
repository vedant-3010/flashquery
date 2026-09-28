import { create } from 'zustand'
import { redactSecrets, type AiLogEntry } from '@/ai/log'

// "What the AI saw" (F-EXPL-04): every request of this session, verbatim, newest first. Kept in
// memory only. Messages are scrubbed of anything key-shaped before they are stored (F-SEC-04).

const MAX_ENTRIES = 100

interface AiLogState {
  entries: AiLogEntry[]
  add: (entry: AiLogEntry, secrets: readonly string[]) => void
  clear: () => void
}

export const useAiLogStore = create<AiLogState>()((set) => ({
  entries: [],
  add: (entry, secrets) => {
    const redacted: AiLogEntry = {
      ...entry,
      messages: entry.messages.map((message) => ({
        ...message,
        content: redactSecrets(message.content, secrets),
      })),
      error: entry.error === null ? null : redactSecrets(entry.error, secrets),
    }
    set((state) => ({ entries: [redacted, ...state.entries].slice(0, MAX_ENTRIES) }))
  },
  clear: () => set({ entries: [] }),
}))
