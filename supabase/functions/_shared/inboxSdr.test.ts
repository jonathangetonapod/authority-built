import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'

import { detectDeterministicReply, resolveInboxModel, stripQuotedText, withinSendWindow } from './inboxSdr.ts'

Deno.test('the inbox runs on the workspace model chosen for the reply stage', () => {
  const shipped = 'claude-sonnet-4-6'

  // Nothing stored: the shipped default, not a pinned copy of it.
  assertEquals(resolveInboxModel([], shipped), shipped)
  assertEquals(resolveInboxModel(null, shipped), shipped)
  assertEquals(resolveInboxModel(undefined, shipped), shipped)

  // A row carrying only a model choice still governs the call — rows now exist
  // for a model with no instruction override.
  assertEquals(
    resolveInboxModel([{ prompt_id: 'inbox_reply', content: null, model: 'claude-opus-5' }], shipped),
    'claude-opus-5',
  )

  // A row with no choice falls back rather than sending null/'' upstream,
  // which would fail the whole request instead of running the default.
  assertEquals(
    resolveInboxModel([{ prompt_id: 'inbox_reply', content: 'custom', model: null }], shipped),
    shipped,
  )
  assertEquals(
    resolveInboxModel([{ prompt_id: 'inbox_reply', content: 'custom', model: '   ' }], shipped),
    shipped,
  )

  // The nudge prompt is appended to the reply's call and has no request of its
  // own, so a model stored against it must never pick the model. Rows like this
  // can exist from before the campaigns function refused them.
  assertEquals(
    resolveInboxModel([{ prompt_id: 'inbox_nudges', content: null, model: 'claude-opus-5' }], shipped),
    shipped,
  )
  // Both present: the reply stage wins regardless of row order.
  assertEquals(
    resolveInboxModel([
      { prompt_id: 'inbox_nudges', content: null, model: 'claude-haiku-4-5-20251001' },
      { prompt_id: 'inbox_reply', content: null, model: 'claude-opus-5' },
    ], shipped),
    'claude-opus-5',
  )
})

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

Deno.test('the send window follows the campaign schedule when one is known', () => {
  const RealDate = Date
  const at = (iso: string) => {
    const fixed = function () { return new RealDate(iso) }
    fixed.now = () => RealDate.parse(iso)
    // deno-lint-ignore no-explicit-any
    ;(globalThis as any).Date = fixed
  }
  // Sunday through Thursday, 09:00-17:00 — what the campaign body actually
  // configures under a Sunday-first reading.
  const sundayFirst = {
    from: '09:00',
    to: '17:00',
    timezone: 'America/New_York',
    days: [true, true, true, true, true, false, false],
  }
  try {
    // Sunday 14:00 New York. The old fixed weekday guard refused this outright,
    // while the campaign itself would have been sending.
    at('2026-08-02T18:00:00.000Z')
    assertEquals(withinSendWindow('America/New_York'), false)
    assertEquals(withinSendWindow('America/New_York', sundayFirst), true)

    // Friday 14:00 New York. The old guard allowed it; this schedule does not.
    at('2026-07-31T18:00:00.000Z')
    assertEquals(withinSendWindow('America/New_York'), true)
    assertEquals(withinSendWindow('America/New_York', sundayFirst), false)

    // Wednesday 08:30 New York sits inside the old 08:00 default but outside a
    // 09:00 campaign window.
    at('2026-07-29T12:30:00.000Z')
    assertEquals(withinSendWindow('America/New_York'), true)
    assertEquals(withinSendWindow('America/New_York', sundayFirst), false)

    // The schedule's own timezone wins over the campaign column.
    at('2026-07-29T18:00:00.000Z')
    assertEquals(
      withinSendWindow('Asia/Tokyo', { ...sundayFirst, timezone: 'America/New_York' }),
      true,
    )

    // Nonsense from the provider must not stop sending forever.
    assertEquals(
      withinSendWindow('America/New_York', { ...sundayFirst, from: '17:00', to: '09:00' }),
      true,
    )
    // A partial schedule falls back to the default hours rather than refusing.
    assertEquals(
      withinSendWindow('America/New_York', { from: null, to: null, timezone: null, days: [] }),
      true,
    )
  } finally {
    // deno-lint-ignore no-explicit-any
    ;(globalThis as any).Date = RealDate
  }
})

Deno.test('opt-out language quoted from our own thread never silences a willing host', () => {
  // The compliance footer travels in the quoted section of every reply. Only
  // what THIS sender wrote may trip the opt-out patterns.
  const enthusiastic = [
    'Yes, love it — let\u2019s book a time next week!',
    '',
    'On Tue, Aug 4, 2026 at 9:12 AM Outreach <us@agency.com> wrote:',
    '> Great to connect. Reply "opt out" to stop receiving these messages.',
  ].join('\n')
  if (detectDeterministicReply(enthusiastic) !== null) {
    throw new Error('a quoted compliance footer was treated as the host opting out')
  }

  const forwarded = [
    'Sounds great, send over the booking link.',
    '',
    '-----Original Message-----',
    'Please unsubscribe me from all future mailings.',
  ].join('\n')
  if (detectDeterministicReply(forwarded) !== null) {
    throw new Error('quoted text below a forward marker was matched')
  }
})

Deno.test('a top-posted opt-out still counts with a quoted thread below it', () => {
  const reply = [
    'Please remove me from your list.',
    '',
    'On Mon, Aug 3, 2026 at 4:02 PM Outreach <us@agency.com> wrote:',
    '> Would love to have your take on the show.',
  ].join('\n')
  if (detectDeterministicReply(reply) !== 'opt_out') {
    throw new Error('a real top-posted opt-out was missed')
  }
})

Deno.test('stripQuotedText keeps something to classify when the reply is all quote', () => {
  const allQuote = [
    '> the entire message is quoted',
    '> nothing top-posted at all',
  ].join('\n')
  if (stripQuotedText(allQuote).trim().length === 0) {
    throw new Error('an all-quote reply stripped to nothing')
  }
})
