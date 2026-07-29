import { describe, expect, it } from 'vitest'
import {
  applyVariableTrigger,
  detectVariableTrigger,
  filterPromptVariables,
  spliceAtCaret,
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
