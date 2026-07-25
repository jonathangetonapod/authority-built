# Pricing Model — Workspace Billing

Status: **decided 2026-07-25, pre-launch.** Founding-member (invite-only) phase
runs on manual invoicing over the credit ledger; Stripe self-serve comes later.

## The model

Three parts. Base fee filters tire-kickers, per-client fee is the predictable
floor that scales with the agency, credits are the margin engine.

| Component | Founding member | Planned public launch |
|---|---|---|
| Base (platform, unlimited seats, first active client, starter credits) | $39/mo | ~$79/mo |
| Each additional **active** client | $39/mo | ~$49–59/mo |
| Credits | usage-priced, see below | same |

Founding-member pricing is **locked for life** per workspace and is the
urgency lever for the invite-only phase ("this price disappears at public
launch"). Prices are denormalized onto `workspace_billing_profiles` so
grandfathered deals survive public price changes.

## Rules

- **Active client** = `clients.status = 'active'`. Paused and churned clients
  are free. Status changes are billing-bearing and must go through
  `record_client_status_change_v1` (audited in `workspace_client_status_events`).
- **Proration**: monthly high-water mark of active clients. A client active
  for any part of the month bills for the month. Anti-gaming: activating and
  pausing repeatedly doesn't reduce the bill.
- **Seats are never billed.** Value scales with clients, not logins.
- **Instantly stays BYO.** Sending infrastructure costs remain on the agency's
  own Instantly account; do not absorb them into platform pricing.

## Credits

- One currency across all metered operations. Prices live in
  `operation_credit_costs` (data, not code — repriceable without deploy).
- Initial prices (placeholder until Phase-0 COGS data says otherwise):
  research run 2, email unlock identify/find/verify 1/2/3, dashboard build 5,
  query generation 1.
- Target margin: **5–10× raw COGS** per operation, measured from
  `workspace_operation_costs`.
- Monthly allowance (default 25 credits, per billing profile) is granted as an
  **expiring lot**; purchased credits never expire. Lots are consumed
  oldest-expiry-first, so free credits always burn before paid ones.
- Charge only at decision moments (unlock, run research, build). Never for
  browsing or viewing. First-client workflow must be coverable by the starter
  allowance without hitting a paywall.
- Verified contact emails stay behind credits at **every** tier — this is what
  protects the shared catalog from free-riders.

## Revenue-shape guardrails

- Watch **blended monthly revenue per active workspace** (floor + credits).
  Healthy founding-member target: $150–200 blended for a 3–5 client agency.
- When a workspace's credit spend is consistently high, offer a flat plan at
  ~its P75 monthly spend (converts volatile usage into MRR).
- Dunning: `past_due` gets a read-only grace period, not a hard lockout.

## Build phases

1. **Phase 0 — instrumentation** (`workspace_operation_costs`): log real COGS
   per operation. Shipped with the core schema; edge-function hooks next.
2. **Phase 1 — ledger + enforcement** (`workspace_billing_profiles`,
   `workspace_credit_lots`, `workspace_credit_ledger`,
   `operation_credit_costs`, `workspace_billing_periods`,
   `workspace_client_status_events`; RPCs `grant_workspace_credits_v1`,
   `spend_workspace_credits_v1`, `record_client_status_change_v1`).
   Schema shipped; metering hooks in edge functions + `INSUFFICIENT_CREDITS`
   handling in the UI are the remaining work. Founding members run on manual
   invoices in this phase.
3. **Phase 2 — Stripe self-serve**: customer + subscription (base item +
   quantity-priced client item), credit packs, auto-refill, webhook claims
   table, dunning. Requires un-retiring billing functions through the release
   manifest process.
4. **Phase 3 — billing UI**: the stubbed `WorkspaceBilling` page — plan,
   client count math, credit balance and history, top-ups, invoices.
