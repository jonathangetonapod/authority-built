// Pins the frontend credit-pack display (src/lib/creditPacks.ts) to the
// server's authoritative catalog (supabase/functions/_shared/creditPacks.ts),
// so a price shown in the UI can never drift from the price the checkout
// charges. If they legitimately change, change both and the values here move
// together.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const server = readFileSync('supabase/functions/_shared/creditPacks.ts', 'utf8')
const client = readFileSync('src/lib/creditPacks.ts', 'utf8')

// Parse the server CREDIT_PACKS object: key -> { credits, amount_cents }.
const serverBody = server.match(/export const CREDIT_PACKS = \{([\s\S]*?)\n\}/u)
assert.ok(serverBody, 'server CREDIT_PACKS object not found')
const serverPacks = {}
for (const line of serverBody[1].split('\n')) {
  const match = /(\w+):\s*\{\s*credits:\s*([\d_]+),\s*amount_cents:\s*([\d_]+)/u.exec(line)
  if (match) {
    serverPacks[match[1]] = {
      credits: Number(match[2].replace(/_/gu, '')),
      amountCents: Number(match[3].replace(/_/gu, '')),
    }
  }
}
assert.ok(Object.keys(serverPacks).length >= 3, 'expected at least 3 server packs')

// Parse the client CREDIT_PACKS array: { key, credits, amountCents }.
const clientBody = client.match(/export const CREDIT_PACKS: CreditPackDisplay\[\] = \[([\s\S]*?)\n\]/u)
assert.ok(clientBody, 'client CREDIT_PACKS array not found')
const clientPacks = {}
for (const entry of clientBody[1].matchAll(/key:\s*'(\w+)',\s*credits:\s*([\d_]+),\s*amountCents:\s*([\d_]+)/gu)) {
  clientPacks[entry[1]] = {
    credits: Number(entry[2].replace(/_/gu, '')),
    amountCents: Number(entry[3].replace(/_/gu, '')),
  }
}

assert.deepEqual(
  clientPacks,
  serverPacks,
  'src/lib/creditPacks.ts must match supabase/functions/_shared/creditPacks.ts (credits + amount_cents per key) — the UI would otherwise show a price the checkout does not charge',
)

console.log('Credit-pack frontend/server sync check passed')
