/**
 * The hostname a public page was opened on.
 *
 * Sent with every slug-authenticated read so the server can refuse a page that
 * belongs to a different workspace than the domain it was asked for on. On the
 * platform's own origin this resolves to no workspace and nothing changes,
 * which is what keeps every link that already exists working.
 */
export function currentHostname(): string | null {
  if (typeof window === 'undefined') return null
  const hostname = window.location?.hostname?.trim().toLowerCase()
  return hostname ? hostname : null
}
