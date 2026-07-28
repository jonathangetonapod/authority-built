// Turning a pasted booking link into something that can be shown inline.
//
// The link is typed by an operator and rendered on a public page, so it is not
// framed on trust. Only schedulers that publish an embed are inlined; anything
// else still works, as a button. That way a valid link is never refused and an
// arbitrary origin is never given a frame on a page a prospect opens.

/** Hosts whose booking pages are documented as embeddable. */
const EMBEDDABLE_HOSTS = new Set([
  'calendly.com',
  'cal.com',
  'app.cal.com',
  'savvycal.com',
  'tidycal.com',
  'meetings.hubspot.com',
  'meetings-eu1.hubspot.com',
  'zcal.co',
])

const HOST_LABELS: Record<string, string> = {
  'calendly.com': 'Calendly',
  'cal.com': 'Cal.com',
  'app.cal.com': 'Cal.com',
  'savvycal.com': 'SavvyCal',
  'tidycal.com': 'TidyCal',
  'meetings.hubspot.com': 'HubSpot',
  'meetings-eu1.hubspot.com': 'HubSpot',
  'zcal.co': 'Zcal',
}

function parsed(rawUrl: string | null | undefined): URL | null {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    return null
  }
  // https only. An http frame is blocked by the browser anyway, and the block
  // would land on the prospect rather than on whoever pasted the link.
  return url.protocol === 'https:' ? url : null
}

/** A safe https link, or null. Every scheduler link passes through this. */
export function bookingLinkUrl(rawUrl: string | null | undefined): string | null {
  return parsed(rawUrl)?.toString() ?? null
}

// Assets a scheduler's own snippet loads. The booking link is never one of
// these, and picking the first https URL out of the markup would grab them.
const EMBED_ASSET = /\.(?:js|css|png|svg|gif|jpe?g|woff2?)(?:$|[?#])/iu

/**
 * The booking link inside whatever was pasted.
 *
 * "Embed code" on a scheduler's site means a block of script, not a URL — so
 * that is what an operator copies. Rejecting it for not being a URL would be
 * technically correct and useless: the link they want is right there in it.
 *
 * A bare URL passes straight through.
 */
export function bookingLinkFromPaste(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const direct = bookingLinkUrl(value)
  if (direct) return direct

  // Cal.com carries the booking path rather than a URL.
  const calLink = /calLink\s*:\s*["']([^"']+)["']/u.exec(value)?.[1]?.trim()
  if (calLink) {
    const origin = /origin\s*:\s*["'](https:\/\/[^"']+)["']/u.exec(value)?.[1]?.trim()
    // app.cal.com is where the embed script lives; cal.com is where a person
    // books. Both are embeddable, and the second is the one to show.
    const base = origin && !origin.includes('app.cal.com') ? origin : 'https://cal.com'
    return bookingLinkUrl(`${base.replace(/\/+$/u, '')}/${calLink.replace(/^\/+/u, '')}`)
  }

  // Calendly and most others put the real link in an attribute.
  const attribute = /(?:data-url|src|href)\s*=\s*["'](https:\/\/[^"']+)["']/giu
  for (const match of value.matchAll(attribute)) {
    if (EMBED_ASSET.test(match[1])) continue
    const candidate = bookingLinkUrl(match[1])
    if (candidate) return candidate
  }

  // Last resort: a bare https URL sitting in the text.
  for (const match of value.matchAll(/https:\/\/[^\s"'<>)]+/gu)) {
    if (EMBED_ASSET.test(match[0])) continue
    const candidate = bookingLinkUrl(match[0])
    if (candidate) return candidate
  }
  return null
}

/**
 * The same link prepared for an iframe, or null when this host is not one we
 * inline. Calendly wants its chrome hidden; the rest embed as they are.
 */
export function schedulerEmbedUrl(rawUrl: string | null | undefined): string | null {
  const url = parsed(rawUrl)
  if (!url) return null
  const host = url.hostname.toLowerCase().replace(/^www\./u, '')
  if (!EMBEDDABLE_HOSTS.has(host)) return null
  if (host === 'calendly.com') {
    url.searchParams.set('embed_domain', 'getonapod.com')
    url.searchParams.set('embed_type', 'Inline')
    url.searchParams.set('hide_gdpr_banner', '1')
  }
  return url.toString()
}

/** The scheduler's name, for saying what is about to load. */
export function schedulerName(rawUrl: string | null | undefined): string | null {
  const url = parsed(rawUrl)
  if (!url) return null
  return HOST_LABELS[url.hostname.toLowerCase().replace(/^www\./u, '')] ?? null
}
