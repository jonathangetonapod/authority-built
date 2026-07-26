import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'

import { withinSendWindow } from './inboxSdr.ts'

Deno.test('the send window is weekday business hours in the campaign timezone', () => {
  // Fix "now" so the assertion does not depend on when the suite runs.
  const RealDate = Date
  const at = (iso: string) => {
    // A bare-minimum stand-in: withinSendWindow only ever calls `new Date()`
    // with no arguments and hands the result to Intl.
    const fixed = function () { return new RealDate(iso) }
    fixed.now = () => RealDate.parse(iso)
    // deno-lint-ignore no-explicit-any
    ;(globalThis as any).Date = fixed
  }
  try {
    // Wednesday 14:00 New York.
    at('2026-07-29T18:00:00.000Z')
    assertEquals(withinSendWindow('America/New_York'), true)

    // Same instant is 03:00 Thursday in Tokyo — outside business hours there.
    assertEquals(withinSendWindow('Asia/Tokyo'), false)

    // Wednesday 06:00 New York, before the window opens.
    at('2026-07-29T10:00:00.000Z')
    assertEquals(withinSendWindow('America/New_York'), false)

    // Saturday afternoon.
    at('2026-08-01T18:00:00.000Z')
    assertEquals(withinSendWindow('America/New_York'), false)

    // An unusable timezone must not strand a thread forever.
    at('2026-07-29T18:00:00.000Z')
    assertEquals(withinSendWindow('Not/AZone'), true)
  } finally {
    // deno-lint-ignore no-explicit-any
    ;(globalThis as any).Date = RealDate
  }
})
