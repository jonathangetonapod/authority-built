import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  buildOutputInstruction,
  normalizeOutputFields,
  parseOutputFields,
  resolveOutputFields,
} from './promptOutputs.ts'

const fields = [
  { id: 'host_style', label: 'Host style', description: 'How the host runs an interview', type: 'text' as const },
  { id: 'best_quotes', label: 'Best quotes', description: '', type: 'list' as const },
]

Deno.test('a declared field may not impersonate one the run already provides', () => {
  // Otherwise a model answer could overwrite podcast_name and every later
  // prompt would read the invention instead of the catalogue.
  assertThrows(() => normalizeOutputFields([{ id: 'podcast_name' }]), Error, 'already a field')
  assertThrows(() => normalizeOutputFields([{ id: 'episode_transcript' }]), Error, 'already a field')
  assertThrows(() => normalizeOutputFields([{ id: 'research_report' }]), Error, 'already a field')
})

Deno.test('field names are constrained, deduplicated and defaulted', () => {
  assertEquals(normalizeOutputFields([{ id: 'host_style' }]), [
    { id: 'host_style', label: 'host_style', description: '', type: 'text' },
  ])
  assertThrows(() => normalizeOutputFields([{ id: 'Host Style' }]), Error, 'not a valid field name')
  assertThrows(() => normalizeOutputFields([{ id: '9lives' }]), Error, 'not a valid field name')
  assertThrows(
    () => normalizeOutputFields([{ id: 'host_style' }, { id: 'host_style' }]),
    Error,
    'declared twice',
  )
  assertThrows(() => normalizeOutputFields('nope'), Error, 'must be an array')
})

Deno.test('the instruction names every key and forbids inventing one', () => {
  const instruction = buildOutputInstruction(fields)
  assertEquals(instruction.includes('"host_style": string // How the host runs an interview'), true)
  assertEquals(instruction.includes('"best_quotes": string[]'), true)
  assertEquals(instruction.includes('Never invent a value'), true)
  // A stage with nothing declared keeps its prompt exactly as written.
  assertEquals(buildOutputInstruction([]), '')
})

Deno.test('a declared answer becomes named variables', () => {
  const parsed = parseOutputFields(
    '{"host_style": "Warm, long questions", "best_quotes": ["one", "two"]}',
    fields,
  )
  assertEquals(parsed, { host_style: 'Warm, long questions', best_quotes: 'one\ntwo' })
})

Deno.test('a fenced or padded answer still parses', () => {
  const parsed = parseOutputFields(
    'Here you go:\n```json\n{"host_style": "Brisk", "best_quotes": []}\n```\nHope that helps.',
    fields,
  )
  // An empty list is an absence, not an empty string handed to the filler.
  assertEquals(parsed, { host_style: 'Brisk', best_quotes: null })
})

Deno.test('prose, or unrelated JSON, is not read as structure', () => {
  assertEquals(parseOutputFields('The host is warm and asks long questions.', fields), null)
  assertEquals(parseOutputFields('{"something_else": 1}', fields), null)
  // Nothing declared means nothing to parse; the stage keeps its blob.
  assertEquals(parseOutputFields('{"host_style": "Warm"}', []), null)
})

Deno.test('a client row wins, and a row that no longer validates falls back', () => {
  const workspace = [{ prompt_id: 'podcast_research', output_fields: [{ id: 'host_style' }] }]
  const client = [{ prompt_id: 'podcast_research', output_fields: [{ id: 'audience_fit' }] }]
  assertEquals(resolveOutputFields('podcast_research', client, workspace)[0].id, 'audience_fit')
  assertEquals(resolveOutputFields('podcast_research', [], workspace)[0].id, 'host_style')
  assertEquals(resolveOutputFields('host_info', client, workspace), [])
  // A stored id that a later registry addition took over must not break a run.
  assertEquals(resolveOutputFields('podcast_research', [], [
    { prompt_id: 'podcast_research', output_fields: [{ id: 'podcast_name' }] },
  ]), [])
})
