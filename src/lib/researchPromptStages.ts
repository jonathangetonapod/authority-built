import { RESEARCH_PROMPT_DEFAULTS, type ResearchPromptDefault, type ResearchPromptId } from '@/lib/researchPromptDefaults'

/**
 * The campaign's prompts as the two things they actually are.
 *
 * Listed flat they read as unrelated settings, which is the opposite of true:
 * these seven are one run, each stage consuming what the one before produced.
 * Numbering the sequence keeps that honest.
 *
 * The grouping lives here rather than in researchPromptDefaults, which is
 * generated from docs/pitch-research-prompts.json and must not be hand-edited.
 */
export interface ResearchPromptPhase {
  id: 'run' | 'pitch' | 'other'
  label: string
  hint: string
  /** Whether these stages happen in the order shown. */
  ordered: boolean
  prompts: ResearchPromptDefault[]
}

const PHASE_MEMBERS: Record<'run' | 'pitch', ResearchPromptId[]> = {
  run: ['podcast_research', 'host_info', 'guest_info', 'host_name_extractor', 'find_topics'],
  pitch: ['write_email', 'clean_email'],
}

const PHASE_COPY: Record<'run' | 'pitch', { label: string; hint: string; ordered: boolean }> = {
  run: { label: 'Research run', hint: 'In order — each stage reads what the last one produced', ordered: true },
  pitch: { label: 'Writing the pitch', hint: 'Runs on the finished research', ordered: true },
}

/**
 * Prompts this screen deliberately leaves out.
 *
 * The inbox prompts are edited on the client's AI SDR profile, beside the
 * profile fields they are written from. They fire when a host replies, which is
 * not part of the run this screen prepares. Named here rather than simply
 * omitted from PHASE_MEMBERS, because an ungrouped prompt deliberately falls
 * through to the catch-all phase below — that fallback exists to surface a
 * prompt somebody forgot, and a prompt shown on another screen is not one.
 */
const EDITED_ELSEWHERE = new Set<ResearchPromptId>(['inbox_reply', 'inbox_nudges'])

export function researchPromptPhases(
  prompts: ResearchPromptDefault[] = RESEARCH_PROMPT_DEFAULTS,
): ResearchPromptPhase[] {
  const byId = new Map(prompts.map((prompt) => [prompt.id, prompt]))
  const phases: ResearchPromptPhase[] = (Object.keys(PHASE_MEMBERS) as Array<'run' | 'pitch'>).map((id) => ({
    id,
    ...PHASE_COPY[id],
    prompts: PHASE_MEMBERS[id].map((promptId) => byId.get(promptId)).filter(Boolean) as ResearchPromptDefault[],
  }))
  // A prompt added to the registry and not to a phase would vanish from the
  // screen rather than fail loudly, so it lands at the end instead. The prompts
  // edited on another screen are excluded first, so leaving them out here reads
  // as a decision rather than as the oversight this fallback is watching for.
  const grouped = new Set(Object.values(PHASE_MEMBERS).flat())
  const ungrouped = prompts.filter((prompt) => !grouped.has(prompt.id) && !EDITED_ELSEWHERE.has(prompt.id))
  if (ungrouped.length > 0) {
    phases.push({ id: 'other', label: 'Other', hint: 'Not yet grouped', ordered: false, prompts: ungrouped })
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
