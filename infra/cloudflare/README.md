# Cloudflare for SaaS — custom domain infrastructure

The pieces a tenant hostname needs that do not live in an edge function. Kept
here because they were configured once by hand and would otherwise exist only
in the Cloudflare dashboard, where nothing reviews them and nothing can
recreate them.

## Why the worker exists

Railway routes by `Host` and serves its own certificate for an SNI it does not
recognise. A tenant hostname sent to it unchanged is refused with a 526 before
it is even routed — a hostname that resolves, issues a certificate, reports
healthy on every status, and serves nothing.

Cloudflare can override the origin per custom hostname (`custom_origin_server`)
but overriding the SNI (`custom_origin_sni`) is Enterprise-only, and was
refused on this account. So the rewrite happens in `saas-origin-worker.js`,
which every custom hostname is routed through.

Verified by hand: without the route the hostname 526s, with it the app is
served.

## What is configured

- **Fallback origin** `ssl.getonapod.com` — a proxied CNAME on the
  `getonapod.com` zone pointing at the Railway service. Custom hostnames route
  here by default.
- **Worker** `saas-origin` — the source in this directory.
- **Worker route per hostname** — `<hostname>/*`, created and deleted alongside
  the custom hostname by `_shared/cloudflareSaas.ts`. A hostname without its
  route 526s, so the two are managed together.

## Deploying a change to the worker

The script is uploaded as an ES module:

```
curl -X PUT \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/saas-origin" \
  -F 'metadata={"main_module":"worker.js","compatibility_date":"2026-06-01"};type=application/json' \
  -F "worker.js=@infra/cloudflare/saas-origin-worker.js;type=application/javascript+module"
```

After deploying, load a live tenant hostname and confirm a 200. Every agency
domain runs through this script, so a broken deploy takes all of them down at
once.

## Known limits

- **Workers free tier is 100,000 requests/day, account-wide.** Every asset on
  every tenant page load passes through the worker, so this is a shared ceiling
  across all agency domains — exceeding it fails them all together.
- **Orange-to-orange**: an agency whose own domain is on Cloudflare *and*
  proxied needs Cloudflare to enable that. DNS-only works normally.
- **One cache key for every tenant.** See the warning in the worker source —
  safe only while the origin serves one static bundle.
