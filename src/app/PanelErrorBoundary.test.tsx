import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PanelErrorBoundary } from './PanelErrorBoundary'

let shouldThrow = true

function Flaky() {
  if (shouldThrow) throw new Error('kaboom')
  return <p>Panel content</p>
}

beforeEach(() => {
  shouldThrow = true
  // React reports caught errors through console.error; keep test output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PanelErrorBoundary', () => {
  it('replaces only the crashed panel with a friendly fallback', () => {
    render(
      <>
        <PanelErrorBoundary name="the dashboard">
          <Flaky />
        </PanelErrorBoundary>
        <p>Sidebar</p>
      </>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't show the dashboard")
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.')
    expect(screen.getByText('Sidebar')).toBeInTheDocument()
  })

  it('reveals technical details on request', async () => {
    const user = userEvent.setup()
    render(
      <PanelErrorBoundary name="the dashboard">
        <Flaky />
      </PanelErrorBoundary>,
    )

    expect(screen.queryByText('Error: kaboom')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show details' }))
    expect(screen.getByText('Error: kaboom')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide details' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('re-renders the panel on "Try again"', async () => {
    const user = userEvent.setup()
    render(
      <PanelErrorBoundary name="the dashboard">
        <Flaky />
      </PanelErrorBoundary>,
    )

    shouldThrow = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('Panel content')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
