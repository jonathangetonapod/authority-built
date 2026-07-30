import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  buildClientVariables,
  buildPodcastVariables,
  CLIENT_VARIABLE_COLUMNS,
  formatPromptValue,
  isPromptVariable,
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
      assertEquals(variable.profile, undefined, `${variable.id} is not a profile field`)
    } else if (variable.group !== 'client') {
      assertEquals(variable.column, undefined, `${variable.id} must not name a column`)
    }
  }
  assertEquals(new Set(PODCAST_VARIABLE_COLUMNS).size, PODCAST_VARIABLE_COLUMNS.length)
})

Deno.test('every client variable reads a column or a profile key, never both', () => {
  const clientVariables = PROMPT_VARIABLES.filter((variable) => variable.group === 'client')
  assertEquals(clientVariables.length > 0, true)
  for (const variable of clientVariables) {
    const sources = [variable.column, variable.profile].filter(Boolean).length
    assertEquals(sources, 1, `${variable.id} needs exactly one source`)
  }
  assertEquals(new Set(CLIENT_VARIABLE_COLUMNS).size, CLIENT_VARIABLE_COLUMNS.length)
})

Deno.test('the client AI SDR profile fills the fields prompts already referenced', () => {
  const filled = buildClientVariables({
    name: 'Dallas Fontaine',
    bio: '  ',
    calendar_link: 'https://cal.example/dallas',
    ai_sdr_profile: {
      positioning: 'Operator who scaled three self-storage funds.',
      proof_points: '',
    },
  })
  assertEquals(filled.client_name, 'Dallas Fontaine')
  assertEquals(filled.client_calendar_link, 'https://cal.example/dallas')
  assertEquals(filled.positioning, 'Operator who scaled three self-storage funds.')
  // Blank is an absence; the filler renders it "Not available" rather than
  // sending the model an empty heading.
  assertEquals(filled.client_bio, null)
  assertEquals(filled.proof_points, null)
  assertEquals(filled.booking_details, null)
})

Deno.test('a catalogue row fills every podcast variable it has', () => {
  const filled = buildPodcastVariables({
    podcast_name: 'The Good, Bad & the Ugly of Self Storage',
    podcast_has_guests: false,
    audience_size: 0,
    is_active: true,
    host_name: 'Michael',
  })
  // The reason typing exists: false and zero are facts about a show.
  assertEquals(filled.podcast_has_guests, 'No')
  assertEquals(filled.audience_size, '0')
  assertEquals(filled.podcast_is_active, 'Yes')
  assertEquals(filled.podcast_host_name, 'Michael')
  assertEquals(filled.brand_safety_risk_level, null)
})

Deno.test('an unregistered token is not a variable', () => {
  assertEquals(isPromptVariable('podcast_name'), true)
  assertEquals(isPromptVariable('positioning'), true)
  // clean_email writes ABOUT placeholders; filling that token turned its rule
  // into "unfilled Not available must never appear".
  assertEquals(isPromptVariable('placeholders'), false)
})

Deno.test('stored episodes render newest first, dated', () => {
  assertEquals(
    formatPromptValue('recent_episodes', [
      { title: 'Storage in a downturn', posted_at: '2026-07-20T10:00:00Z' },
      { title: 'Buying at auction' },
      { title: '' },
    ]),
    '- 2026-07-20: Storage in a downturn\n- Buying at auction',
  )
  assertEquals(formatPromptValue('recent_episodes', []), null)
})

Deno.test('variable ids are unique', () => {
  const ids = PROMPT_VARIABLES.map((variable) => variable.id)
  assertEquals(new Set(ids).size, ids.length)
})

// Feed markup must not reach the model. The opener quotes the show name back
// to the host, so an entity that survives is read as broken automation.
Deno.test('feed entities and tags are decoded before a prompt sees them', () => {
  assertEquals(
    formatPromptValue('podcast_name', 'The Good, Bad, &amp; the Ugly of Self Storage'),
    'The Good, Bad, & the Ugly of Self Storage',
  )
  assertEquals(
    formatPromptValue('podcast_description', '<p>Peter&#39;s show.</p><p>Second para.</p>'),
    "Peter's show.\n\nSecond para.",
  )
  // Block tags become breaks, not nothing: sentences must not run together.
  assertEquals(formatPromptValue('podcast_description', 'One.<br>Two.'), 'One.\nTwo.')
  // An escaped entity decodes once, never twice.
  assertEquals(
    formatPromptValue('podcast_name', 'Tags &amp;lt;p&amp;gt; explained'),
    'Tags &lt;p&gt; explained',
  )
  // Smart punctuation arrives as itself rather than as a numeric reference.
  assertEquals(formatPromptValue('podcast_name', 'It&#8217;s Storage &#8212; Weekly'), 'It’s Storage — Weekly')
  // Text that was already clean is untouched.
  assertEquals(formatPromptValue('podcast_name', 'Operator Weekly'), 'Operator Weekly')
  // Markup that leaves nothing behind is an absence, not an empty string.
  assertEquals(formatPromptValue('podcast_description', '<p></p>'), null)
})

// Episode titles are quoted back to a host as often as the show name is, and
// they arrive from the same feeds. One line per episode has to survive it.
Deno.test('feed markup in list entries and episode titles stays on one line', () => {
  assertEquals(
    formatPromptValue('podcast_categories', ['Business &amp; Finance', 'Self&#8211;Storage']),
    'Business & Finance, Self–Storage',
  )
  assertEquals(
    formatPromptValue('recent_episodes', [
      { title: 'Ep 12: Rates &amp; Returns<br>Part One', posted_at: '2026-06-02T10:00:00Z' },
    ]),
    '- 2026-06-02: Ep 12: Rates & Returns Part One',
  )
})
