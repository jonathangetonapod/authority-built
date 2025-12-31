import * as Sentry from '@sentry/react'

export function initSentry() {
  console.log('[Sentry] Initializing Sentry...')

  // Temporary: Hardcoded DSN until Railway environment variable issue is resolved
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN || 'https://8afda039e36f8ba008a91b0069894718@o4510627480731648.ingest.us.sentry.io/4510627502096384'

  console.log('[Sentry] DSN:', sentryDsn ? 'Found' : 'Missing')

  if (!sentryDsn) {
    console.warn('[Sentry] DSN not configured - error tracking disabled')
    return
  }

  Sentry.init({
    dsn: sentryDsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Performance Monitoring
    tracesSampleRate: 1.0, // Capture 100% of transactions in production you may want to lower this

    // Session Replay
    replaysSessionSampleRate: 0.1, // Sample 10% of sessions
    replaysOnErrorSampleRate: 1.0, // Sample 100% of sessions with errors

    // Environment
    environment: import.meta.env.MODE,

    // Release tracking
    release: import.meta.env.VITE_APP_VERSION || 'development',

    // Filter out known errors
    beforeSend(event, hint) {
      const error = hint.originalException

      // Ignore network errors from ad blockers
      if (error && typeof error === 'object' && 'message' in error) {
        const message = String(error.message)
        if (
          message.includes('Failed to fetch') ||
          message.includes('NetworkError') ||
          message.includes('Load failed')
        ) {
          return null
        }
      }

      return event
    },
  })

  // Expose Sentry globally for debugging
  if (typeof window !== 'undefined') {
    (window as any).Sentry = Sentry
  }

  console.log('[Sentry] ✅ Sentry initialized successfully!')
  console.log('[Sentry] window.Sentry:', typeof (window as any).Sentry)
}

// Helper to capture exceptions with context
export function captureException(error: Error, context?: Record<string, any>) {
  console.error('[Error]', error, context)

  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        scope.setContext(key, value)
      })
    }
    Sentry.captureException(error)
  })
}

// Helper to capture messages
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  Sentry.captureMessage(message, level)
}

// Set user context when they log in
export function setUser(user: { id: string; email?: string; name?: string } | null) {
  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.name,
    })
  } else {
    Sentry.setUser(null)
  }
}
