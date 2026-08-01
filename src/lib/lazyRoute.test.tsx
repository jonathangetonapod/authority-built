import { Component, Suspense, type ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { lazyRoute } from '@/lib/lazyRoute'
import {
  createChunkReloadHandler,
  resetChunkReloadScheduledForTests,
} from '@/lib/chunkReload'

afterEach(() => resetChunkReloadScheduledForTests())

function scheduleReload() {
  const handle = createChunkReloadHandler({
    storage: { getItem: () => null, setItem: () => {} },
    reload: () => {},
    now: () => 1_000_000,
  })
  handle(new Event('vite:preloadError', { cancelable: true }))
}

const Page = () => <p>Loaded page</p>

class Boundary extends Component<{ children: ReactNode }, { message: string }> {
  state = { message: '' }
  static getDerivedStateFromError(error: Error) {
    return { message: error.message }
  }
  render() {
    return this.state.message
      ? <p data-testid="boundary">{this.state.message}</p>
      : this.props.children
  }
}

describe('lazyRoute', () => {
  it('renders a chunk that loaded normally', async () => {
    const Route = lazyRoute(async () => ({ default: Page }))

    render(
      <Suspense fallback={<p>Loading</p>}>
        <Route />
      </Suspense>,
    )

    expect(await screen.findByText('Loaded page')).toBeInTheDocument()
  })

  // The regression: cancelling vite:preloadError leaves the import resolved
  // with undefined, and plain React.lazy reads `.default` off it and throws —
  // flashing the root error boundary in the moment before the reload lands.
  it('holds the loading state when a cancelled chunk resolves undefined mid-reload', async () => {
    scheduleReload()
    const Route = lazyRoute(async () => undefined as never)

    render(
      <Suspense fallback={<p>Loading</p>}>
        <Route />
      </Suspense>,
    )

    expect(await screen.findByText('Loading')).toBeInTheDocument()
    // Still suspended after the microtask queue drains: nothing was thrown.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByText('Loading')).toBeInTheDocument()
  })

  // No reload committed means undefined is a real fault, not a page on its way
  // out, so it has to reach the boundary and Sentry rather than hang forever.
  it('throws when a chunk resolves undefined and no reload is scheduled', async () => {
    const Route = lazyRoute(async () => undefined as never)

    render(
      <Boundary>
        <Suspense fallback={<p>Loading</p>}>
          <Route />
        </Suspense>
      </Boundary>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('boundary')).toHaveTextContent(
        'A page chunk loaded without a component export',
      ),
    )
  })
})
