import { describe, expect, it } from 'vitest'
import { RESEARCH_PROMPT_DEFAULTS } from '@/lib/researchPromptDefaults'
import { researchPromptPhases, researchPromptStepNumbers } from '@/lib/researchPromptStages'

describe('researchPromptPhases', () => {
  it('groups every prompt this screen owns exactly once', () => {
    const grouped = researchPromptPhases().flatMap((phase) => phase.prompts.map((prompt) => prompt.id))
    const owned = RESEARCH_PROMPT_DEFAULTS
      .map((prompt) => prompt.id)
      .filter((id) => id !== 'inbox_reply' && id !== 'inbox_nudges')
    expect([...grouped].sort()).toEqual([...owned].sort())
    expect(new Set(grouped).size).toBe(grouped.length)
  })

  // The inbox prompts are edited on the client's AI SDR profile, beside the
  // profile fields they are written from. Showing them here as well was a
  // second place to change the same prompt.
  it('leaves the inbox prompts to the AI SDR profile', () => {
    const shown = researchPromptPhases().flatMap((phase) => phase.prompts.map((prompt) => prompt.id))
    expect(shown).not.toContain('inbox_reply')
    expect(shown).not.toContain('inbox_nudges')
    // Excluded on purpose, so they must not reappear via the catch-all that
    // exists to surface a prompt nobody grouped.
    expect(researchPromptPhases().some((phase) => phase.id === 'other')).toBe(false)
  })

  it('keeps the run in the order the stages actually execute', () => {
    const run = researchPromptPhases().find((phase) => phase.id === 'run')
    expect(run?.prompts.map((prompt) => prompt.id)).toEqual([
      'podcast_research',
      'host_info',
      'guest_info',
      'host_name_extractor',
      'find_topics',
    ])
  })

  it('marks the run and the pitch as ordered', () => {
    const phases = researchPromptPhases()
    expect(phases.find((phase) => phase.id === 'run')?.ordered).toBe(true)
    expect(phases.find((phase) => phase.id === 'pitch')?.ordered).toBe(true)
  })

  // A prompt added to the registry but not to a phase would disappear from the
  // screen. It is shown at the end instead, where somebody will notice it.
  it('still shows a prompt nobody has grouped yet', () => {
    const stray = { ...RESEARCH_PROMPT_DEFAULTS[0], id: 'brand_new' as never, label: 'Brand new' }
    const phases = researchPromptPhases([...RESEARCH_PROMPT_DEFAULTS, stray])
    const shown = phases.flatMap((phase) => phase.prompts.map((prompt) => prompt.id))
    expect(shown).toContain('brand_new')
  })
})

describe('researchPromptStepNumbers', () => {
  it('numbers the run and the pitch as one sequence', () => {
    const numbers = researchPromptStepNumbers(researchPromptPhases())
    expect(numbers.get('podcast_research')).toBe(1)
    expect(numbers.get('find_topics')).toBe(5)
    // The pitch continues the same run rather than restarting at one.
    expect(numbers.get('write_email')).toBe(6)
    expect(numbers.get('clean_email')).toBe(7)
  })

  it('gives the inbox prompts no number at all', () => {
    const numbers = researchPromptStepNumbers(researchPromptPhases())
    expect(numbers.has('inbox_reply')).toBe(false)
    expect(numbers.has('inbox_nudges')).toBe(false)
  })
})
