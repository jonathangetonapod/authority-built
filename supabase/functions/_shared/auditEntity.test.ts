import { normalizeAuditEntity } from './auditEntity.ts'

function assertEquals(actual: unknown, expected: unknown, note = ''): void {
  const left = JSON.stringify(actual)
  const right = JSON.stringify(expected)
  if (left !== right) throw new Error(`${note} expected ${right}, received ${left}`)
}

const UUID = '11111111-1111-4111-8111-111111111111'

Deno.test('passes a real UUID through, lowercased', () => {
  assertEquals(normalizeAuditEntity(UUID, { pack: 'starter' }), {
    entityId: UUID,
    metadata: { pack: 'starter' },
  })
  assertEquals(normalizeAuditEntity(UUID.toUpperCase(), {}).entityId, UUID)
})

// The failure this exists for: a Stripe session id reaching a uuid column made
// Postgres reject the insert, and the audit is written after the payment
// provider has been called, so the request failed with the work already done.
Deno.test('moves a foreign id into metadata instead of failing the insert', () => {
  assertEquals(normalizeAuditEntity('cs_live_a1B2c3', { pack: 'starter' }), {
    entityId: null,
    metadata: { pack: 'starter', external_entity_id: 'cs_live_a1B2c3' },
  })
})

Deno.test('never overwrites a key the caller set deliberately', () => {
  const metadata = { external_entity_id: 'mine' }
  assertEquals(normalizeAuditEntity('cs_live_a1B2c3', metadata), {
    entityId: null,
    metadata: { external_entity_id: 'mine' },
  })
})

Deno.test('treats absent, empty, and non-string ids as no entity', () => {
  assertEquals(normalizeAuditEntity(null, undefined), { entityId: null, metadata: {} })
  assertEquals(normalizeAuditEntity(undefined, { a: 1 }), { entityId: null, metadata: { a: 1 } })
  assertEquals(normalizeAuditEntity('', { a: 1 }), { entityId: null, metadata: { a: 1 } })
  assertEquals(normalizeAuditEntity(42, {}), { entityId: null, metadata: {} })
})

// A near-miss must not slip through: the column would reject it just the same.
Deno.test('rejects strings that only look like a UUID', () => {
  for (const value of [
    '11111111-1111-4111-8111-11111111111',
    '11111111-1111-4111-8111-1111111111111',
    '11111111111141118111111111111111',
    '11111111-1111-6111-8111-111111111111',
    '11111111-1111-4111-c111-111111111111',
  ]) {
    assertEquals(normalizeAuditEntity(value, {}).entityId, null, value)
  }
})
