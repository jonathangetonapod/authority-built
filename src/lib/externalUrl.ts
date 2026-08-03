export function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

export function openExternalUrl(value: string): boolean {
  try {
    const url = safeExternalUrl(value)
    if (!url) return false

    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (opened) opened.opener = null
    return true
  } catch {
    return false
  }
}

/**
 * The same thing, but willing to repair a bare hostname.
 *
 * The shared podcast catalogue carries values like `simplecast.com` and
 * `www.AngelInvestorsNetwork.com` — a website somebody typed without a scheme.
 * `new URL` rejects those outright, so anywhere that validates a URL sees junk
 * where a usable address was meant, and refuses the whole payload over it.
 *
 * Only a value that already looks like a hostname is repaired: one segment of
 * dot-separated labels, no whitespace, no scheme of its own. Anything else is
 * null rather than guessed at — prefixing a scheme onto arbitrary text invents
 * a link to somewhere nobody named.
 */
export function repairableExternalUrl(value: string | null | undefined): string | null {
  const candidate = (value ?? '').trim()
  if (!candidate) return null

  const direct = safeExternalUrl(candidate)
  if (direct) return direct

  // A scheme it already has and we rejected is a refusal, not a typo.
  if (/^[a-z][a-z0-9+.-]*:/iu.test(candidate)) return null
  if (!/^[^\s/?#@]+\.[^\s/?#@]{2,}(?:[/?#]\S*)?$/u.test(candidate)) return null

  return safeExternalUrl(`https://${candidate}`)
}
