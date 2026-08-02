/**
 * Custom-hostname origin shim for Cloudflare for SaaS.
 *
 * Two jobs, both of which have to happen at the edge.
 *
 * 1. Railway routes by Host and serves its own certificate for an SNI it does
 *    not recognise, so a tenant hostname sent straight through is refused
 *    before it is even routed. Cloudflare can override the origin but not the
 *    SNI outside Enterprise, so the rewrite happens here.
 *
 * 2. index.html is one static bundle for every hostname, and its head is the
 *    platform's: og:url pointed at getonapod.com, og:image was our artwork on
 *    our domain, og:site_name and the title said Get On A Pod. The app fixes
 *    the visible page in the browser, but a link preview crawler — iMessage,
 *    Slack, WhatsApp — never runs JavaScript. So an agency's client pasting
 *    their own dashboard link got a card branded by us, pointing at us. The
 *    white label held everywhere except the moment it is most seen.
 *
 * TENANCY WARNING: every tenant hostname is rewritten to the SAME origin URL,
 * so Cloudflare's fetch cache is keyed identically for all of them. That is
 * only safe while the origin serves one static bundle. If anything ever
 * renders per-tenant content server-side, one agency's page can be served to
 * another agency's client — add the incoming hostname to the cache key first.
 */
const ORIGIN = 'authority-lab-website-production.up.railway.app'
const BRAND_TTL_MS = 5 * 60 * 1000

// Per-isolate, because the same hostname is asked for many times in a row and
// the answer changes about never.
const brandCache = new Map()

async function brandFor(hostname, env) {
  const cached = brandCache.get(hostname)
  if (cached && cached.at > Date.now() - BRAND_TTL_MS) return cached.brand

  let brand = null
  try {
    const response = await fetch(`${env.SUPABASE_URL}/functions/v1/resolve-workspace-domain`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ hostname }),
    })
    if (response.ok) {
      const payload = await response.json()
      const workspace = payload && payload.workspace
      if (workspace) {
        brand = (workspace.client_brand_name || '').trim()
          || (workspace.workspace_name || '').trim()
          || null
      }
    }
  } catch (_error) {
    // A failed lookup must not take the page down. Null means "strip ours",
    // which is still correct — showing the platform's brand on an agency's
    // domain is the bug, and showing nothing is not.
    brand = null
  }
  brandCache.set(hostname, { brand, at: Date.now() })
  return brand
}

/**
 * Replace what names us, drop what points at us.
 *
 * Falling back to a neutral name rather than the platform's is deliberate: the
 * failure mode of a lookup is an unbranded preview, never someone else's brand.
 */
function headRewriter(hostname, brand) {
  const name = brand || 'Client Portal'
  const origin = `https://${hostname}`
  return new HTMLRewriter()
    .on('title', {
      element(el) { el.setInnerContent(name) },
    })
    .on('meta[name="application-name"], meta[name="apple-mobile-web-app-title"], meta[property="og:site_name"]', {
      element(el) { el.setAttribute('content', name) },
    })
    .on('meta[property="og:title"], meta[name="twitter:title"]', {
      element(el) { el.setAttribute('content', name) },
    })
    .on('meta[property="og:url"], meta[name="twitter:url"]', {
      element(el) { el.setAttribute('content', origin) },
    })
    // The description and artwork sell the platform to a founder. On an
    // agency's domain they are someone else's marketing, so they go rather
    // than get rewritten into a claim we cannot make on their behalf.
    .on('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]', {
      element(el) { el.remove() },
    })
    .on('meta[property^="og:image"], meta[name^="twitter:image"], meta[name="twitter:card"]', {
      element(el) { el.remove() },
    })
    .on('link[rel="canonical"]', {
      element(el) { el.remove() },
    })
}

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url)
    try {
      const url = new URL(request.url)
      url.hostname = ORIGIN
      const proxied = new Request(url, request)
      // Kept so anything downstream can still tell which agency domain was
      // asked for, since the Host no longer says.
      proxied.headers.set('X-Forwarded-Host', incoming.hostname)
      const response = await fetch(proxied)

      // Only the document carries the head. Assets are the same bytes for
      // everyone and must not pay for a lookup.
      const type = response.headers.get('content-type') || ''
      if (!type.includes('text/html')) return response

      const brand = await brandFor(incoming.hostname, env)
      return headRewriter(incoming.hostname, brand).transform(response)
    } catch (_error) {
      // An uncaught throw here is Cloudflare's raw 1101 on an agency's own
      // domain, which is the worst page their client could be shown. Say the
      // dull true thing instead.
      return new Response(
        'This site is temporarily unavailable. Please try again in a moment.',
        { status: 502, headers: { 'content-type': 'text/plain; charset=utf-8' } },
      )
    }
  },
}
