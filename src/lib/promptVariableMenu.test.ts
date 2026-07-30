import { describe, expect, it } from 'vitest'
import {
  applyVariableTrigger,
  detectVariableTrigger,
  filterPromptVariables,
  referencedPromptVariables,
  splitPromptTokens,
  strayTriggerHints,
  spliceAtCaret,
  splitOnMatch,
  unavailableVariableIds,
} from '@/lib/promptVariableMenu'
import { PROMPT_VARIABLES } from '@/lib/promptVariables'

describe('detectVariableTrigger', () => {
  it('opens on a slash at the start of a word', () => {
    const value = 'Ground this in /host'
    expect(detectVariableTrigger(value, value.length)).toEqual({
      start: 15,
      query: 'host',
      kind: 'slash',
    })
  })

  it('opens on a slash at the very start of the field', () => {
    expect(detectVariableTrigger('/pod', 4)).toEqual({ start: 0, query: 'pod', kind: 'slash' })
  })

  // The shipped prompts are full of these. None of them may summon the menu.
  it.each([
    'Bio/Expertise:',
    'Answer [Yes/No',
    'Give the role/title/company',
    'Rate it [High/Medium/Low',
    'See https://example.com/show',
  ])('stays closed inside prose: %s', (value) => {
    expect(detectVariableTrigger(value, value.length)).toBeNull()
  })

  it('opens on the token syntax itself, anywhere', () => {
    const value = 'Quote {{episode'
    expect(detectVariableTrigger(value, value.length)).toEqual({
      start: 6,
      query: 'episode',
      kind: 'braces',
    })
  })

  it('stays closed once the token is closed', () => {
    const value = 'Quote {{episode_title}}'
    expect(detectVariableTrigger(value, value.length)).toBeNull()
  })

  it('reads the text behind the caret, not the end of the field', () => {
    const value = 'Open /host and then some trailing prose'
    expect(detectVariableTrigger(value, 10)).toEqual({ start: 5, query: 'host', kind: 'slash' })
  })
})

describe('filterPromptVariables', () => {
  it('ranks an id prefix above an id substring above a label match', () => {
    const matches = filterPromptVariables('host').map((variable) => variable.id)
    expect(matches[0]).toBe('host_report')
    expect(matches).toContain('podcast_host_name')
  })

  it('finds a field by its label when the id does not say it', () => {
    expect(filterPromptVariables('media kit').map((v) => v.id)).toEqual(['client_media_kit_url'])
  })

  it('lists the registry in order when nothing is typed', () => {
    expect(filterPromptVariables('', 3).map((v) => v.id))
      .toEqual(PROMPT_VARIABLES.slice(0, 3).map((v) => v.id))
  })
})

describe('referencedPromptVariables', () => {
  it('lists the registry fields a prompt names, in registry order', () => {
    expect(referencedPromptVariables('Pitch {{client_name}} using {{podcast_name}}.'))
      .toEqual(['podcast_name', 'client_name'])
  })

  it('collapses repeats and tolerates whitespace inside the braces', () => {
    expect(referencedPromptVariables('{{ podcast_name }} and {{podcast_name}}'))
      .toEqual(['podcast_name'])
  })

  it('ignores a token that names no registry field', () => {
    // The prompts talk about placeholders as prose; the filler leaves those
    // alone, and so must the required-field list.
    expect(referencedPromptVariables('unfilled {{placeholders}} must never appear')).toEqual([])
  })
})

describe('unavailableVariableIds', () => {
  const STAGES = [
    'podcast_research', 'host_info', 'guest_info', 'host_name_extractor',
    'find_topics', 'write_email', 'clean_email',
  ]

  it('hides the field the stage being edited writes itself', () => {
    // Editing podcast_research must not offer {{research_report}} — that is
    // the thing this stage is in the middle of producing.
    expect(unavailableVariableIds('podcast_research', STAGES)).toContain('research_report')
    expect(unavailableVariableIds('host_info', STAGES)).toContain('host_report')
    expect(unavailableVariableIds('guest_info', STAGES)).toContain('guest_report')
  })

  it('hides fields written by later stages, and keeps earlier ones', () => {
    const forHostInfo = unavailableVariableIds('host_info', STAGES)
    // Written later, so it cannot exist when host_info runs.
    expect(forHostInfo).toContain('topic_proposal')
    expect(forHostInfo).toContain('sequence_json')
    // Written by the stage before it, so it is available.
    expect(forHostInfo).not.toContain('research_report')
  })

  it('leaves producers that are not stages in this order alone', () => {
    const hidden = unavailableVariableIds('write_email', STAGES)
    // The inbox, the email unlock and the relationship layer are not stages of
    // this run; their values are there before it starts.
    expect(hidden).not.toContain('verified_email')
    expect(hidden).not.toContain('reply_body')
    expect(hidden).not.toContain('agency_relationship')
  })

  it('hides nothing for a prompt outside the run order', () => {
    expect(unavailableVariableIds('inbox_reply', STAGES)).toEqual([])
  })
})

describe('splitOnMatch', () => {
  it('marks every occurrence, case-insensitively', () => {
    expect(splitOnMatch('Host identification result', 'host')).toEqual([
      { text: 'Host', match: true },
      { text: ' identification result', match: false },
    ])
    expect(splitOnMatch('host_report host', 'host')).toEqual([
      { text: 'host', match: true },
      { text: '_report ', match: false },
      { text: 'host', match: true },
    ])
  })

  it('marks nothing when the query is empty or absent', () => {
    expect(splitOnMatch('podcast_name', '')).toEqual([{ text: 'podcast_name', match: false }])
    expect(splitOnMatch('podcast_name', 'zzz')).toEqual([{ text: 'podcast_name', match: false }])
  })

  it('explains a row that matched on its description alone', () => {
    // reply_subject has no "host" in its id; this is why it is in the menu.
    expect(splitOnMatch('reply_subject', 'host').some((s) => s.match)).toBe(false)
    expect(splitOnMatch('Subject of the host reply', 'host').filter((s) => s.match))
      .toEqual([{ text: 'host', match: true }])
  })
})

describe('applyVariableTrigger', () => {
  it('replaces the slash and its query with the token', () => {
    const value = 'Ground this in /aud'
    const trigger = detectVariableTrigger(value, value.length)!
    expect(applyVariableTrigger(value, trigger, value.length, 'audience_size')).toEqual({
      next: 'Ground this in {{audience_size}}',
      caret: 'Ground this in {{audience_size}}'.length,
    })
  })

  it('replaces the opening braces rather than doubling them', () => {
    const value = 'Quote {{ep'
    const trigger = detectVariableTrigger(value, value.length)!
    expect(applyVariableTrigger(value, trigger, value.length, 'episode_title').next)
      .toBe('Quote {{episode_title}}')
  })

  it('keeps the text after the caret', () => {
    const value = 'Open /host and close'
    const trigger = detectVariableTrigger(value, 10)!
    expect(applyVariableTrigger(value, trigger, 10, 'host_name').next)
      .toBe('Open {{host_name}} and close')
  })
})

describe('spliceAtCaret', () => {
  it('pads only where the neighbour is not already whitespace', () => {
    expect(spliceAtCaret('Ground this in', 14, 14, '{{audience_size}}').next)
      .toBe('Ground this in {{audience_size}}')
    expect(spliceAtCaret('Use for the show', 4, 4, '{{podcast_name}}').next)
      .toBe('Use {{podcast_name}} for the show')
  })

  it('replaces a selection', () => {
    expect(spliceAtCaret('Use TOKEN here', 4, 9, '{{podcast_name}}').next)
      .toBe('Use {{podcast_name}} here')
  })
})

describe('splitPromptTokens', () => {
  const known = (id: string) => ['podcast_name', 'itunes_rating'].includes(id)

  it('separates the tokens the run will fill from the prose around them', () => {
    expect(splitPromptTokens('Open on {{podcast_name}} today.', known)).toEqual([
      { text: 'Open on ', variableId: null },
      { text: '{{podcast_name}}', variableId: 'podcast_name' },
      { text: ' today.', variableId: null },
    ])
  })

  // The filler substitutes registered tokens only, so prose written in
  // placeholder syntax stays prose here too.
  it('leaves an unregistered token in the surrounding prose', () => {
    expect(splitPromptTokens('No {{placeholders}} allowed.', known)).toEqual([
      { text: 'No {{placeholders}} allowed.', variableId: null },
    ])
  })

  it('reassembles into exactly the original content', () => {
    const content = '{{podcast_name}} then {{itunes_rating}}, and {{unknown}} at the end'
    expect(splitPromptTokens(content, known).map((s) => s.text).join('')).toBe(content)
  })

  it('handles a token at each edge and padded braces', () => {
    expect(splitPromptTokens('{{ podcast_name }}', known)).toEqual([
      { text: '{{ podcast_name }}', variableId: 'podcast_name' },
    ])
    expect(splitPromptTokens('', known)).toEqual([])
  })
})

describe('strayTriggerHints', () => {
  // Both of these were sitting in a saved workspace prompt: typing "/" opened
  // the field menu, dismissing it left the character behind.
  it('finds a slash left behind by the field menu', () => {
    const content = '- Name: {{client_name}} /\n- Website: {{client_website}}\n/\n'
    expect(strayTriggerHints(content)[0]).toContain('lines 1, 3')
  })

  it('leaves a slash that is part of a word alone', () => {
    expect(strayTriggerHints('Use and/or, 24/7, http://example.com')).toEqual([])
  })

  it('finds an unfinished token but not a complete one', () => {
    expect(strayTriggerHints('Open on {{podcast_name}}.')).toEqual([])
    expect(strayTriggerHints('Open on {{podcast_name and stop')[0]).toContain('unfinished')
  })

  // The prompts talk about placeholders in placeholder syntax; that is prose,
  // and closed, so it must not be reported.
  it('says nothing about prose written in placeholder syntax', () => {
    expect(strayTriggerHints('No unfilled {{placeholders}} may appear.')).toEqual([])
  })
})
