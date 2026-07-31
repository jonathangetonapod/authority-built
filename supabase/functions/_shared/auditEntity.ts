// workspace_audit_log.entity_id is a UUID column, for ids of our own rows.
// Twice now a caller has passed a foreign identifier — a Stripe Checkout
// Session id — and Postgres rejected the whole insert. Because the audit is
// written last, after the payment provider has already been called, that
// rejection failed the request after the work was done, and credit purchases
// were unusable for everyone until someone noticed.
//
// Nothing between a TypeScript `string` and a `uuid` column catches that, so it
// is caught here instead: an id that is not a UUID is recorded in metadata,
// where the column is JSONB and takes it as it comes, rather than discarded and
// rather than allowed to fail the insert.

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface NormalizedAuditEntity {
  entityId: string | null
  metadata: Record<string, unknown>
}

export function normalizeAuditEntity(
  entityId: unknown,
  metadata: Record<string, unknown> | undefined,
): NormalizedAuditEntity {
  const base = metadata ?? {}
  if (typeof entityId !== 'string' || entityId === '') {
    return { entityId: null, metadata: base }
  }
  if (UUID_PATTERN.test(entityId)) {
    return { entityId: entityId.toLowerCase(), metadata: base }
  }
  // Kept under a name that says what it is, and never overwriting a key the
  // caller set deliberately.
  return {
    entityId: null,
    metadata: 'external_entity_id' in base ? base : { ...base, external_entity_id: entityId },
  }
}
