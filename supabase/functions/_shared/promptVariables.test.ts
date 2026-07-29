import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  formatPromptValue,
  PODCAST_VARIABLE_COLUMNS,
  PROMPT_VARIABLES,
} from './promptVariables.ts'

// The filler renders null as "Not available". Everything below is about which
// values are a genuine absence and which are facts that merely look like one.
Deno.test('a false boolean is a fact, not an absence', () => {
  assertEquals(formatPromptValue('podcast_has_guests', false), 'No')
  assertEquals(formatPromptValue('podcast_has_guests', true), 'Yes')
  assertEquals(formatPromptValue('podcast_has_sponsors', false), 'No')
  // Only a real absence may reach the prompt as "Not available".
  assertEquals(formatPromptValue('podcast_has_guests', null), null)
  assertEquals(formatPromptValue('podcast_has_guests', undefined), null)
})

Deno.test('zero is a value, and numbers are grouped', () => {
  assertEquals(formatPromptValue('audience_size', 0), '0')
  assertEquals(formatPromptValue('audience_size', 1250000), '1,250,000')
  assertEquals(formatPromptValue('episode_count', 312), '312')
  assertEquals(formatPromptValue('podcast_reach_score', 94), '94')
  assertEquals(formatPromptValue('audience_size', null), null)
  assertEquals(formatPromptValue('audience_size', 'not a number'), null)
})

Deno.test('ratings keep one decimal place', () => {
  assertEquals(formatPromptValue('itunes_rating', 4.7), '4.7')
  assertEquals(formatPromptValue('itunes_rating', 4.72), '4.7')
  assertEquals(formatPromptValue('itunes_rating', 5), '5.0')
  assertEquals(formatPromptValue('itunes_rating', 0), '0.0')
})

Deno.test('dates render as a plain day', () => {
  assertEquals(formatPromptValue('last_posted_at', '2026-07-22T11:56:42.481926+00:00'), '2026-07-22')
  assertEquals(formatPromptValue('last_posted_at', 'nonsense'), null)
})

Deno.test('a category array becomes a readable list, never raw JSON', () => {
  assertEquals(
    formatPromptValue('podcast_categories', ['Business', 'Marketing']),
    'Business, Marketing',
  )
  assertEquals(
    formatPromptValue('podcast_categories', [{ name: 'Business' }, { name: 'Careers' }]),
    'Business, Careers',
  )
  // An empty array carries no information, so it is an absence.
  assertEquals(formatPromptValue('podcast_categories', []), null)
})

Deno.test('demographics render as readable lines', () => {
  assertEquals(
    formatPromptValue('demographics', { age_range: '25-44', gender_split: '60/40', empty: '' }),
    'age range: 25-44\ngender split: 60/40',
  )
  assertEquals(formatPromptValue('demographics', {}), null)
})

Deno.test('blank text is an absence', () => {
  assertEquals(formatPromptValue('podcast_name', '   '), null)
  assertEquals(formatPromptValue('podcast_name', 'The Digital Agency Growth Podcast'),
    'The Digital Agency Growth Podcast')
})

Deno.test('every podcast variable names a column, and only those are selected', () => {
  for (const variable of PROMPT_VARIABLES) {
    if (variable.group === 'podcast') {
      assertEquals(typeof variable.column, 'string', `${variable.id} needs a column`)
    } else {
      assertEquals(variable.column, undefined, `${variable.id} must not name a column`)
    }
  }
  assertEquals(new Set(PODCAST_VARIABLE_COLUMNS).size, PODCAST_VARIABLE_COLUMNS.length)
})

Deno.test('variable ids are unique', () => {
  const ids = PROMPT_VARIABLES.map((variable) => variable.id)
  assertEquals(new Set(ids).size, ids.length)
})
