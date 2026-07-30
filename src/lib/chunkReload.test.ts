import { describe, expect, it } from 'vitest'
import { createChunkReloadHandler, type ChunkReloadEnvironment } from '@/lib/chunkReload'

function environment(startingMark: string | null = null, startingTime = 1_000_000) {
  const state = { mark: startingMark, now: startingTime, reloads: 0 }
  const harness: ChunkReloadEnvironment = {
    storage: {
      getItem: () => state.mark,
      setItem: (_key: string, value: string) => {
        state.mark = value
      },
    },
    reload: () => {
      state.reloads += 1
    },
    now: () => state.now,
  }
  return { state, harness }
}

// Vite dispatches one of these per failed dependency and rethrows any the
// listener leaves uncancelled.
function preloadError() {
  return new Event('vite:preloadError', { cancelable: true })
}

describe('createChunkReloadHandler', () => {
  it('reloads on the first failed dependency and records when it did', () => {
    const { state, harness } = environment()
    const handle = createChunkReloadHandler(harness)

    const event = preloadError()
    handle(event)

    expect(state.reloads).toBe(1)
    expect(event.defaultPrevented).toBe(true)
    expect(state.mark).toBe('1000000')
  })

  // The bug this covers: a stale route chunk fails several dependencies in one
  // tick. Every uncancelled sibling throws, and a throw inside a lazy import
  // reaches the root error boundary before the reload navigates away — so the
  // page the user was rescued from is replaced by "Something went wrong".
  it('cancels every sibling of the failure it is already reloading for', () => {
    const { state, harness } = environment()
    const handle = createChunkReloadHandler(harness)

    const events = [preloadError(), preloadError(), preloadError()]
    for (const event of events) handle(event)

    expect(events.every((event) => event.defaultPrevented)).toBe(true)
    expect(state.reloads).toBe(1)
  })

  it('cancels siblings that arrive in a later tick, while the reload is still in flight', () => {
    const { state, harness } = environment()
    const handle = createChunkReloadHandler(harness)

    handle(preloadError())
    state.now += 5_000

    const late = preloadError()
    handle(late)

    expect(late.defaultPrevented).toBe(true)
    expect(state.reloads).toBe(1)
  })

  // A reload that did not fix the problem means this is not deploy skew.
  // Looping would hide it, so the error goes to the boundary and to Sentry.
  it('lets the error through when a reload has just been tried', () => {
    const { state, harness } = environment('1000000', 1_020_000)
    const handle = createChunkReloadHandler(harness)

    const event = preloadError()
    handle(event)

    expect(state.reloads).toBe(0)
    expect(event.defaultPrevented).toBe(false)
  })

  it('reloads again once the loop window has passed', () => {
    const { state, harness } = environment('1000000', 1_040_000)
    const handle = createChunkReloadHandler(harness)

    const event = preloadError()
    handle(event)

    expect(state.reloads).toBe(1)
    expect(event.defaultPrevented).toBe(true)
    expect(state.mark).toBe('1040000')
  })

  it('reloads when the recorded mark is not a number', () => {
    const { state, harness } = environment('not-a-timestamp')
    const handle = createChunkReloadHandler(harness)

    handle(preloadError())

    expect(state.reloads).toBe(1)
  })
})
