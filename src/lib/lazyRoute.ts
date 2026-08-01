/**
 * `lazy`, hardened against the one way a route chunk fails without rejecting.
 *
 * When a deploy leaves an open tab pointing at chunks that now 404, Vite's
 * preload helper dispatches `vite:preloadError` and rethrows unless a listener
 * cancels it. `chunkReload` cancels — otherwise the throw reaches the root error
 * boundary. But the helper's last line is `baseModule().catch(handlePreloadError)`,
 * and a cancelled handler returns undefined, so the cancelled import resolves
 * with `undefined` instead of failing. React.lazy reads `.default` off it and
 * throws during render, putting "Something went wrong" on screen for the second
 * before the reload navigates away — the exact symptom cancelling was meant to
 * remove, arriving by a different door.
 *
 * So an undefined module while a reload is committed is not an error to report:
 * it is a page already leaving. Holding Suspense keeps the loading state up
 * until it goes. With no reload scheduled, undefined is a genuine fault and is
 * thrown so the boundary and Sentry see it.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { chunkReloadScheduled } from '@/lib/chunkReload'

interface ModuleWithDefault<T> {
  default: T
}

export function isLoadableModule<T>(module: unknown): module is ModuleWithDefault<T> {
  return typeof module === 'object' && module !== null && 'default' in module
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRoute<T extends ComponentType<any>>(
  factory: () => Promise<ModuleWithDefault<T>>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    const module = await factory()
    if (isLoadableModule<T>(module)) return module
    // Never settles on purpose: the reload owns what happens next.
    if (chunkReloadScheduled()) return new Promise<ModuleWithDefault<T>>(() => {})
    throw new Error('A page chunk loaded without a component export')
  })
}
