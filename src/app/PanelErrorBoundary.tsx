import { Component, type ReactNode } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toAppError, type AppError } from '@/lib/errors'

interface PanelErrorBoundaryProps {
  /** What failed, as it reads in "Couldn't show …", e.g. "the dashboard". */
  name: string
  children: ReactNode
}

interface PanelErrorBoundaryState {
  error: AppError | null
  showDetails: boolean
}

/**
 * Keeps a crash inside one panel so the rest of the app keeps working (F-PERF-03).
 * A class because React has no hook for error boundaries; React itself logs the caught error.
 */
export class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  state: PanelErrorBoundaryState = { error: null, showDetails: false }

  static getDerivedStateFromError(error: unknown): Partial<PanelErrorBoundaryState> {
    return { error: toAppError(error, 'panel_crash'), showDetails: false }
  }

  private reset = () => this.setState({ error: null, showDetails: false })

  private toggleDetails = () => this.setState((state) => ({ showDetails: !state.showDetails }))

  render() {
    const { error, showDetails } = this.state
    if (!error) return this.props.children

    return (
      <div
        role="alert"
        className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <TriangleAlert className="size-8 text-destructive" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-medium">Couldn't show {this.props.name}</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={this.reset}>
            <RotateCcw aria-hidden />
            Try again
          </Button>
          {error.detail && (
            <Button
              size="sm"
              variant="outline"
              aria-expanded={showDetails}
              onClick={this.toggleDetails}
            >
              {showDetails ? 'Hide details' : 'Show details'}
            </Button>
          )}
        </div>
        {showDetails && error.detail && (
          <pre className="max-h-48 w-full max-w-md overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs whitespace-pre-wrap">
            {error.detail}
          </pre>
        )}
      </div>
    )
  }
}
