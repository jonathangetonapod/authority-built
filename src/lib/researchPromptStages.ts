import { RESEARCH_PROMPT_DEFAULTS, type ResearchPromptDefault, type ResearchPromptId } from '@/lib/researchPromptDefaults'

/**
 * The nine prompts as the three things they actually are.
 *
 * Listed flat they read as nine unrelated settings, which is the opposite of
 * true: the first seven are one run, each stage consuming what the one before
 * produced, and the last two fire on their own trigger when a host replies.
 * Numbering only the sequence keeps that honest — numbering the inbox prompts
 * would invent an order they do not have.
 *
 * The grouping lives here rather than in researchPromptDefaults, which is
 * generated from docs/pitch-research-prompts.json and must not be hand-edited.
 */
export interface ResearchPromptPhase {
  id: 'run' | 'pitch' | 'inbox'
  label: string
  hint: string
  /** Whether these stages happen in the order shown. */
  ordered: boolean
  prompts: ResearchPromptDefault[]
}

const PHASE_MEMBERS: Record<ResearchPromptPhase['id'], ResearchPromptId[]> = {
  run: ['podcast_research', 'host_info', 'guest_info', 'host_name_extractor', 'find_topics'],
  pitch: ['write_email', 'clean_email'],
  inbox: ['inbox_reply', 'inbox_nudges'],
}

const PHASE_COPY: Record<ResearchPromptPhase['id'], { label: string; hint: string; ordered: boolean }> = {
  run: { label: 'Research run', hint: 'In order — each stage reads what the last one produced', ordered: true },
  pitch: { label: 'Writing the pitch', hint: 'Runs on the finished research', ordered: true },
  inbox: { label: 'After a reply', hint: 'Each fires on its own trigger, not in sequence', ordered: false },
}

export function researchPromptPhases(
  prompts: ResearchPromptDefault[] = RESEARCH_PROMPT_DEFAULTS,
): ResearchPromptPhase[] {
  const byId = new Map(prompts.map((prompt) => [prompt.id, prompt]))
  const phases = (Object.keys(PHASE_MEMBERS) as Array<ResearchPromptPhase['id']>).map((id) => ({
    id,
    ...PHASE_COPY[id],
    prompts: PHASE_MEMBERS[id].map((promptId) => byId.get(promptId)).filter(Boolean) as ResearchPromptDefault[],
  }))
  // A prompt added to the registry and not to a phase would vanish from the
  // screen rather than fail loudly, so it lands at the end instead.
  const grouped = new Set(Object.values(PHASE_MEMBERS).flat())
  const ungrouped = prompts.filter((prompt) => !grouped.has(prompt.id))
  if (ungrouped.length > 0) {
    phases.push({ id: 'inbox', label: 'Other', hint: 'Not yet grouped', ordered: false, prompts: ungrouped })
  }
  return phases.filter((phase) => phase.prompts.length > 0)
}

/** The step number a stage shows, counting across the ordered phases only. */
export function researchPromptStepNumbers(
  phases: ResearchPromptPhase[],
): Map<ResearchPromptId, number> {
  const numbers = new Map<ResearchPromptId, number>()
  let step = 0
  for (const phase of phases) {
    if (!phase.ordered) continue
    for (const prompt of phase.prompts) {
      step += 1
      numbers.set(prompt.id, step)
    }
  }
  return numbers
}
