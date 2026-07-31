import { assertEquals } from 'jsr:@std/assert@1'
import { splitStructuredAngles } from './pitchAngles.ts'

const block = (angles: unknown) => '```json\n' + JSON.stringify({ angles }) + '\n```'

Deno.test('reads the angles a topic proposal appended to itself', () => {
  const raw = `**PRIMARY TOPIC ANGLE:**\nThe $15M Sales Rule\n\n${block([
    { title: 'The $15M Sales Rule', description: 'Seven keys.', grounding: 'He said it at 12:04.' },
  ])}`
  const { prose, angles } = splitStructuredAngles(raw)
  assertEquals(angles.length, 1)
  assertEquals(angles[0].title, 'The $15M Sales Rule')
  assertEquals(angles[0].grounding, 'He said it at 12:04.')
  // The block is the machine's copy of what the prose already said, so what the
  // later stages read is the proposal, not the proposal plus its own appendix.
  assertEquals(prose.includes('```'), false)
  assertEquals(prose.includes('PRIMARY TOPIC ANGLE'), true)
})

Deno.test('keeps at most three, in the order proposed', () => {
  const { angles } = splitStructuredAngles(block(
    [1, 2, 3, 4].map((n) => ({ title: `T${n}`, description: `D${n}`, grounding: '' })),
  ))
  assertEquals(angles.map((angle) => angle.title), ['T1', 'T2', 'T3'])
})

// The whole point is that this cannot leave a podcast with no angles: the
// caller falls back to the structuring pass, and it can only do that if a
// failure to parse is reported as none rather than as some.
Deno.test('reports none when the block is absent, empty or malformed', () => {
  for (const raw of [
    'A proposal with no block at all.',
    '```json\n{ not json at all\n```',
    '```json\n{"angles": []}\n```',
    '```json\n{"angles": "three of them"}\n```',
    '```json\n{"something_else": [{"title": "T", "description": "D"}]}\n```',
  ]) {
    assertEquals(splitStructuredAngles(raw).angles, [], raw)
  }
})

// An entry missing either half is dropped rather than filled with an empty
// string: a titled angle with no hook renders as a blank option to the client.
Deno.test('drops an entry missing a title or a description', () => {
  const { angles } = splitStructuredAngles(block([
    { title: 'Kept', description: 'Has both.' },
    { title: 'No description' },
    { description: 'No title' },
    { title: '   ', description: 'Blank title' },
  ]))
  assertEquals(angles.map((angle) => angle.title), ['Kept'])
  // grounding is optional; absent becomes empty, never undefined.
  assertEquals(angles[0].grounding, '')
})

// A proposal may legitimately end on a fenced example of its own. Cutting the
// last fence unconditionally deleted whatever it held.
Deno.test('leaves the answer whole when the last fence is not the angles', () => {
  const raw = 'Here is a sample opener:\n```\nHey Dan, loved the bit on outbound.\n```'
  const { prose, angles } = splitStructuredAngles(raw)
  assertEquals(angles, [])
  assertEquals(prose, raw.trim())
})

// The block is asked for last, but a model that adds a sign-off after it must
// not cost us the angles.
Deno.test('allows a short sign-off after the block', () => {
  const raw = `${block([{ title: 'T', description: 'D', grounding: 'G' }])}\n\nLet me know which angle you prefer.`
  assertEquals(splitStructuredAngles(raw).angles.length, 1)
})

// A proposal that ignored the instruction but demonstrated the format earlier
// leaves exactly one fence that parses. Taking it would publish an
// illustration as the angles every pitch is written from, and delete the
// section it was sitting in.
Deno.test('refuses a block buried in the middle of the answer', () => {
  const raw = [
    'Here is the shape I will use:',
    block([{ title: 'Example title', description: 'Example hook', grounding: 'Example moment' }]),
    '**PRIMARY TOPIC ANGLE:**',
    'The real angle, proposed in prose, running well past the allowance so that',
    'the block above cannot pass as the last thing in the answer. This section',
    'continues for long enough to be unmistakably a section rather than a',
    'sign-off line after the block.',
  ].join('\n\n')
  const { prose, angles } = splitStructuredAngles(raw)
  assertEquals(angles, [])
  // Nothing is stripped when the block is rejected.
  assertEquals(prose, raw.trim())
})

// Long fields are capped rather than rejected: the column they land in renders
// to clients, and an unbounded description would break the layout.
Deno.test('caps a title, description and grounding', () => {
  const { angles } = splitStructuredAngles(block([{
    title: 'T'.repeat(400),
    description: 'D'.repeat(2_000),
    grounding: 'G'.repeat(2_000),
  }]))
  assertEquals(angles[0].title.length, 160)
  assertEquals(angles[0].description.length, 800)
  assertEquals(angles[0].grounding.length, 800)
})
