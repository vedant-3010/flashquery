import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import type { Answer } from '@/stores/ask'
import { useDatasetsStore } from '@/stores/datasets'
import { PROBLEMS, useFeedbackStore, type Problem } from '@/stores/feedback'
import { useToastStore } from '@/stores/toast'

function EvalCaseForm({ answer, onDone }: { answer: Answer; onDone: () => void }) {
  const datasets = useDatasetsStore((state) => state.datasets)
  const saveCase = useFeedbackStore((state) => state.saveCase)
  const showToast = useToastStore((state) => state.show)
  const [problem, setProblem] = useState<Problem>('numbers')
  const [notes, setNotes] = useState('')
  const [sql, setSql] = useState(answer.sql ?? '')
  const notesId = useId()
  const sqlId = useId()
  const table = answer.plan?.tablesUsed[0] ?? answer.tables[0] ?? ''
  const dataset = datasets.find((d) => d.table === table)
  const corrected = sql.trim() !== (answer.sql ?? '').trim()

  const save = (event: React.FormEvent) => {
    event.preventDefault()
    saveCase({
      dataset: table,
      fileName: dataset?.source.fileName ?? null,
      schemaHash: dataset?.schemaHash ?? null,
      question: answer.question,
      referenceSql: sql.trim(),
      generatedSql: corrected ? answer.sql : null,
      rating: 'down',
      problem,
      notes: notes.trim() || null,
    })
    showToast('Saved as an eval case. Export them from Settings.')
    onDone()
  }

  return (
    <form className="grid gap-4" onSubmit={save}>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">What was wrong?</legend>
        <RadioGroup value={problem} onValueChange={(value) => setProblem(value as Problem)}>
          {Object.entries(PROBLEMS).map(([value, label]) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem value={value} id={`${notesId}-${value}`} />
              <Label htmlFor={`${notesId}-${value}`} className="font-normal">
                {label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor={notesId}>Details (optional)</Label>
        <Textarea
          id={notesId}
          rows={2}
          maxLength={1000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={sqlId}>SQL that gives the right answer</Label>
        <Textarea
          id={sqlId}
          rows={6}
          spellCheck={false}
          className="font-mono text-xs"
          value={sql}
          onChange={(event) => setSql(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {corrected
            ? 'Your SQL becomes the reference answer; the AI’s SQL is kept for comparison.'
            : 'Fix the SQL if you can: the eval runner compares the AI’s answer with this one.'}
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Skip
        </Button>
        <Button type="submit" disabled={sql.trim() === ''}>
          Save as eval case
        </Button>
      </DialogFooter>
    </form>
  )
}

/** 👎 feedback (F-ASK-14): what was wrong, and an eval case with the corrected SQL. */
export function EvalCaseDialog({ answer, open, onOpenChange }: EvalCaseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>What went wrong?</DialogTitle>
          <DialogDescription>
            Feedback stays on this device. Saved cases can be exported for the NL→SQL evals.
          </DialogDescription>
        </DialogHeader>
        {open && <EvalCaseForm answer={answer} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

interface EvalCaseDialogProps {
  answer: Answer
  open: boolean
  onOpenChange: (open: boolean) => void
}
