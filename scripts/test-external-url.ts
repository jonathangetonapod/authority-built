import assert from 'node:assert/strict'

import { repairableExternalUrl, safeExternalUrl } from '../src/lib/externalUrl'

assert.equal(safeExternalUrl('https://example.test/path?q=1'), 'https://example.test/path?q=1')
assert.equal(safeExternalUrl('http://example.test'), 'http://example.test/')
assert.equal(safeExternalUrl('javascript:alert(1)'), null)
assert.equal(safeExternalUrl('data:text/html,<script>alert(1)</script>'), null)
assert.equal(safeExternalUrl('/relative/path'), null)
assert.equal(safeExternalUrl('https://user:password@example.test/private'), null)
assert.equal(safeExternalUrl('not a URL'), null)

console.log('External URL allowlist checks passed')

// The catalogue is full of websites typed without a scheme. Dropping them lost
// a real address; refusing the whole payload over one lost the whole batch.
assert.equal(repairableExternalUrl('simplecast.com'), 'https://simplecast.com/')
assert.equal(repairableExternalUrl('www.AngelInvestorsNetwork.com'), 'https://www.angelinvestorsnetwork.com/')
assert.equal(repairableExternalUrl('blockworks.co/podcasts'), 'https://blockworks.co/podcasts')
assert.equal(repairableExternalUrl('https://example.test/path'), 'https://example.test/path')

// Repaired, not guessed: a scheme we already refused stays refused, and prose
// does not become a link to somewhere nobody named.
assert.equal(repairableExternalUrl('javascript:alert(1)'), null)
assert.equal(repairableExternalUrl('data:text/html,<b>hi</b>'), null)
assert.equal(repairableExternalUrl('not a URL'), null)
assert.equal(repairableExternalUrl('Coming soon'), null)
assert.equal(repairableExternalUrl('/relative/path'), null)
assert.equal(repairableExternalUrl(''), null)
assert.equal(repairableExternalUrl(null), null)
assert.equal(repairableExternalUrl('https://user:password@example.test'), null)
