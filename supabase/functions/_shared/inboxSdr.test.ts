import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'

import { detectDeterministicReply, withinSendWindow } from './inboxSdr.ts'

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

Deno.test('opt-out detection covers how people actually decline', () => {
  // The reply that went undetected in production: the request is aimed at the
  // address rather than at the sender, and never says "again".
  assertEquals(
    detectDeterministicReply('Do not send correspondence to this email address, please.'),
    'opt_out',
  )
  for (
    const message of [
      'Please unsubscribe me from this list.',
      'Opt out.',
      'Take me off your list.',
      'Please stop emailing about this.',
      'Do not email me.',
      'Do not contact me again.',
      'Please remove my email address from your records.',
      'I no longer wish to receive these.',
      'Please remove me.',
      'Do not reply to this email account.',
    ]
  ) {
    assertEquals(detectDeterministicReply(message), 'opt_out', message)
  }
})

Deno.test('opt-out detection leaves ordinary replies alone', () => {
  // Each of these contains language near a pattern. Silencing a host for every
  // client in the workspace is the cost of getting one of them wrong.
  //
  // The bare word "unsubscribe" is deliberately not defended against here: on
  // its own it is an opt-out often enough that treating it as one is the right
  // trade, and that rule predates the widening below.
  for (
    const message of [
      'Happy to chat. Do not send it to my assistant, send it straight to me.',
      'I do not email guests before a pre-call, so let us book one.',
      'Remove the second topic and this works for me.',
      'Please stop by the booth at the conference.',
      'I want to receive the media kit before deciding.',
      'Do not worry about the deadline, we can be flexible.',
      'This address is the best one for scheduling.',
    ]
  ) {
    const verdict = detectDeterministicReply(message)
    assertEquals(verdict === 'opt_out', false, `${message} -> ${verdict}`)
  }
})
