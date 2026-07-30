/**
 * After a deploy, an open tab still references the previous build's hashed
 * chunks, which 404. Reloading picks up the fresh build; the recorded timestamp
 * stops that becoming a loop when the failure is anything other than deploy
 * skew.
 *
 * Vite dispatches one vite:preloadError per failed dependency, synchronously in
 * a single tick, and rethrows every event a listener leaves uncancelled. Every
 * lazy route here preloads between five and eighty-four dependencies, so a
 * deploy that changes more than one of them fails several at once. Cancelling
 * only the event that starts the reload lets its siblings throw, and a throw in
 * a lazy import reaches the root error boundary — which replaces the page with
 * "Something went wrong" in the moment before the reload navigates away.
 *
 * So a reload, once decided, cancels everything that follows it.
 */

const RELOAD_MARK = 'chunk-reload-at'
const RELOAD_WINDOW_MS = 30_000

export interface ChunkReloadEnvironment {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  reload: () => void
  now: () => number
}

export function createChunkReloadHandler(
  environment: ChunkReloadEnvironment,
): (event: Event) => void {
  let reloadInFlight = false

  return (event: Event) => {
    // The page is already on its way out. Nothing this build can load will
    // help, and an uncancelled sibling would surface the error boundary first.
    if (reloadInFlight) {
      event.preventDefault()
      return
    }

    const lastReload = environment.storage.getItem(RELOAD_MARK)
    const now = environment.now()
    // Reloading has already failed to fix this, so it is not deploy skew. Let
    // the error through to the boundary and to Sentry rather than loop.
    if (lastReload && now - Number(lastReload) < RELOAD_WINDOW_MS) return

    reloadInFlight = true
    environment.storage.setItem(RELOAD_MARK, String(now))
    event.preventDefault()
    environment.reload()
  }
}

export function installChunkReloadHandler(
  environment: ChunkReloadEnvironment = {
    storage: sessionStorage,
    reload: () => window.location.reload(),
    now: () => Date.now(),
  },
): void {
  window.addEventListener('vite:preloadError', createChunkReloadHandler(environment))
}
