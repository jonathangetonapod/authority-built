import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  describeMissingRequirements,
  isRequirementPromptId,
  missingRequiredVariables,
  normalizeRequiredVariables,
  resolveRequiredVariables,
} from './promptRequirements.ts'
import { buildPodcastVariables } from './promptVariables.ts'

Deno.test('a client row wins, including when it requires nothing', () => {
  const workspace = [{ prompt_id: 'write_email', required_variables: ['episode_transcript'] }]

  // No client opinion: inherit the workspace set.
  assertEquals(resolveRequiredVariables('write_email', [], workspace), ['episode_transcript'])

  // An empty client array is an opinion — this client pitches without one.
  const client = [{ prompt_id: 'write_email', required_variables: [] }]
  assertEquals(resolveRequiredVariables('write_email', client, workspace), [])

  // A different stage is untouched by either.
  assertEquals(resolveRequiredVariables('host_info', client, workspace), [])
})

Deno.test('nothing is required when neither scope has a row', () => {
  assertEquals(resolveRequiredVariables('write_email', [], []), [])
  assertEquals(resolveRequiredVariables('write_email', [{ prompt_id: 'host_info', required_variables: ['x'] }], []), [])
})

Deno.test('missing means the run could not fill it, not that it is falsy', () => {
  const variables = {
    episode_transcript: 'A long transcript',
    podcast_has_guests: 'No',
    audience_size: '0',
    episode_title: null,
    host_report: '   ',
  }

  assertEquals(missingRequiredVariables(['episode_transcript'], variables), [])
  // A false boolean and a zero are facts the podcast actually has.
  assertEquals(missingRequiredVariables(['podcast_has_guests', 'audience_size'], variables), [])
  assertEquals(missingRequiredVariables(['episode_title'], variables), ['episode_title'])
  // Blank is an absence, and so is a run field whose stage has not happened.
  assertEquals(missingRequiredVariables(['host_report'], variables), ['host_report'])
  assertEquals(missingRequiredVariables(['guest_report'], variables), ['guest_report'])
})

Deno.test('a podcast with no transcript fails the requirement its row implies', () => {
  // Built the same way the run builds it, so the check cannot drift from it.
  const variables = buildPodcastVariables({
    podcast_name: 'Operator Weekly',
    podcast_description: 'A show about operating',
    audience_size: 0,
  })
  assertEquals(missingRequiredVariables(['podcast_name'], variables), [])
  assertEquals(missingRequiredVariables(['audience_size'], variables), [])
  assertEquals(missingRequiredVariables(['brand_safety_recommendation'], variables), [
    'brand_safety_recommendation',
  ])
})

Deno.test('a submitted set is checked against the registry, not just its shape', () => {
  assertEquals(normalizeRequiredVariables(['episode_transcript']), ['episode_transcript'])
  // Duplicates collapse and registry order is restored.
  assertEquals(
    normalizeRequiredVariables(['episode_transcript', 'podcast_name', 'episode_transcript']),
    ['podcast_name', 'episode_transcript'],
  )
  assertEquals(normalizeRequiredVariables([]), [])

  assertThrows(() => normalizeRequiredVariables(['not_a_field']), Error, 'Unknown field')
  // clients.notes is deliberately outside the registry and must stay unreachable.
  assertThrows(() => normalizeRequiredVariables(['notes']), Error, 'Unknown field')
  assertThrows(() => normalizeRequiredVariables('episode_transcript'), Error, 'must be an array')
  assertThrows(() => normalizeRequiredVariables([7]), Error, 'must contain strings')
})

Deno.test('the stage list matches the tables', () => {
  assertEquals(isRequirementPromptId('write_email'), true)
  assertEquals(isRequirementPromptId('inbox_nudges'), true)
  assertEquals(isRequirementPromptId('email_unlock'), false)
  assertEquals(isRequirementPromptId(null), false)
})

Deno.test('the blocked reason names the field an operator would look for', () => {
  const one = describeMissingRequirements('write_email', ['episode_transcript'])
  assertEquals(one.includes('Latest episode transcript (episode_transcript)'), true)
  assertEquals(one.includes('no credit was spent'), true)

  const two = describeMissingRequirements('write_email', ['episode_transcript', 'podcast_name'])
  assertEquals(two.includes(' and '), true)
})
