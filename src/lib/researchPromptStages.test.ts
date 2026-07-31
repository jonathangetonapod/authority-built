import { describe, expect, it } from 'vitest'
import { RESEARCH_PROMPT_DEFAULTS } from '@/lib/researchPromptDefaults'
import { researchPromptPhases, researchPromptStepNumbers } from '@/lib/researchPromptStages'

describe('researchPromptPhases', () => {
  it('groups every prompt exactly once', () => {
    const grouped = researchPromptPhases().flatMap((phase) => phase.prompts.map((prompt) => prompt.id))
    expect([...grouped].sort()).toEqual([...RESEARCH_PROMPT_DEFAULTS.map((p) => p.id)].sort())
    expect(new Set(grouped).size).toBe(grouped.length)
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

  // The inbox prompts fire when a host replies, independently of each other.
  // Numbering them would claim a sequence that does not exist.
  it('marks the inbox prompts as unordered', () => {
    const phases = researchPromptPhases()
    expect(phases.find((phase) => phase.id === 'inbox')?.ordered).toBe(false)
    expect(phases.find((phase) => phase.id === 'run')?.ordered).toBe(true)
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
