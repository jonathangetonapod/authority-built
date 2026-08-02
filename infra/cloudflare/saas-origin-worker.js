/**
 * Custom-hostname origin shim for Cloudflare for SaaS.
 *
 * Railway routes by Host and serves its own certificate for an SNI it does not
 * recognise, so a tenant hostname sent straight through is refused before it
 * is even routed. Cloudflare can override the origin but not the SNI outside
 * Enterprise, so the rewrite happens here.
 *
 * TENANCY WARNING: every tenant hostname is rewritten to the SAME origin URL,
 * so Cloudflare's fetch cache is keyed identically for all of them. That is
 * only safe while the origin serves one static bundle and branding is resolved
 * in the browser from window.location. If anything ever renders per-tenant
 * content server-side, one agency's page can be served to another agency's
 * client — add the incoming hostname to the cache key before that day.
 */
const ORIGIN = 'authority-lab-website-production.up.railway.app'

export default {
  async fetch(request) {
    const incoming = new URL(request.url)
    try {
      const url = new URL(request.url)
      url.hostname = ORIGIN
      const proxied = new Request(url, request)
      // Kept so anything downstream can still tell which agency domain was
      // asked for, since the Host no longer says.
      proxied.headers.set('X-Forwarded-Host', incoming.hostname)
      return await fetch(proxied)
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
