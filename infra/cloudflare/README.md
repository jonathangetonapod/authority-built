# Cloudflare for SaaS — custom domain infrastructure

The pieces a tenant hostname needs that do not live in an edge function. Kept
here because they were configured once by hand and would otherwise exist only
in the Cloudflare dashboard, where nothing reviews them and nothing can
recreate them.

## Why the worker exists

Two reasons. The second is the one that is easy to miss.

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

Second, `index.html` is one static bundle for every hostname and its head is
the platform's — `og:url` pointed at getonapod.com, `og:image` was our artwork
on our domain, `og:site_name` and the title said Get On A Pod. The app corrects
the visible page in the browser, but link preview crawlers (iMessage, Slack,
WhatsApp) never run JavaScript, so an agency's client pasting their own
dashboard link got a card branded by us and pointing at us. The worker rewrites
the head per hostname using the brand from `resolve-workspace-domain`, and
falls back to a neutral "Client Portal" rather than the platform's name when a
lookup fails or the hostname has no workspace.

`getonapod.com` is not routed through the worker, so the marketing site keeps
its own SEO untouched.

## What is configured

- **Fallback origin** `ssl.getonapod.com` — a proxied CNAME on the
  `getonapod.com` zone pointing at the Railway service. Custom hostnames route
  here by default.
- **Worker** `saas-origin` — the source in this directory.
- **Worker route per hostname** — `<hostname>/*`, created and deleted alongside
  the custom hostname by `_shared/cloudflareSaas.ts`. A hostname without its
  route 526s, so the two are managed together.

## Deploying a change to the worker

The script is uploaded as an ES module. Note `filename=worker.js`: Cloudflare
matches the module against the part's *filename*, not its field name, and
without it the upload is refused with "No such module: worker.js".

```
curl -X PUT \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/saas-origin" \
  -F 'metadata={"main_module":"worker.js","compatibility_date":"2026-06-01"};type=application/json' \
  -F "worker.js=@infra/cloudflare/saas-origin-worker.js;type=application/javascript+module;filename=worker.js"
```

After deploying, load a live tenant hostname and confirm a 200 **and** that the
head carries the agency's name rather than the platform's:

```
curl -s https://<tenant-host>/ | grep -E '<title>|og:site_name|og:url'
```

Every agency domain runs through this script, so a broken deploy takes all of
them down at once.

## Secrets

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are set as worker secrets and used only
to call `resolve-workspace-domain`, which is public and unauthenticated. The
anon key is the same value the browser bundle already ships.

## Known limits

- **Workers free tier is 100,000 requests/day, account-wide.** Every asset on
  every tenant page load passes through the worker, so this is a shared ceiling
  across all agency domains — exceeding it fails them all together.
- **Orange-to-orange**: an agency whose own domain is on Cloudflare *and*
  proxied needs Cloudflare to enable that. DNS-only works normally.
- **One cache key for every tenant.** See the warning in the worker source —
  safe only while the origin serves one static bundle.
