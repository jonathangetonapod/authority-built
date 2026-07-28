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
