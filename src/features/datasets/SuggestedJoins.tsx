import { Link2, X } from 'lucide-react'
import { useMemo } from 'react'
import { IconButton } from '@/components/IconButton'
import { relationshipId } from '@/engine/relationships'
import { formatPercent } from '@/lib/format'
import { useRelationshipsStore } from '@/stores/relationships'
import { useSettingsStore } from '@/stores/settings'

const KIND: Record<string, string> = {
  'many-to-one': 'many to one',
  'one-to-one': 'one to one',
  'many-to-many': 'many to many',
}

/** Join keys found between the loaded tables (F-PROF-07); they go with questions unless ignored. */
export function SuggestedJoins() {
  const locale = useSettingsStore((state) => state.locale)
  const found = useRelationshipsStore((state) => state.found)
  const dismissed = useRelationshipsStore((state) => state.dismissed)
  const dismiss = useRelationshipsStore((state) => state.dismiss)
  const shown = useMemo(
    () => found.filter((r) => !dismissed.includes(relationshipId(r))),
    [found, dismissed],
  )
  if (shown.length === 0) return null

  return (
    <section aria-label="Suggested joins" className="mx-2 mt-2 rounded-md border px-2 py-1.5">
      <h3 className="flex items-center gap-1.5 text-xs font-medium">
        <Link2 className="size-3.5" aria-hidden />
        Suggested joins
      </h3>
      <p className="text-[11px] text-muted-foreground">
        Found by matching names and values. Sent with questions to help the AI join tables.
      </p>
      <ul className="mt-1 grid gap-1">
        {shown.map((r) => {
          const id = relationshipId(r)
          return (
            <li key={id} className="flex items-start gap-1 text-xs">
              <span className="min-w-0 flex-1">
                <span className="font-mono break-all">
                  {r.from.table}.{r.from.column} → {r.to.table}.{r.to.column}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {KIND[r.kind]} · {formatPercent(r.overlap, locale, { maxFractionDigits: 0 })} of
                  values match
                </span>
              </span>
              <IconButton
                label={`Ignore the join ${r.from.table}.${r.from.column} → ${r.to.table}.${r.to.column}`}
                size="icon-xs"
                onClick={() => dismiss(id)}
              >
                <X />
              </IconButton>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
