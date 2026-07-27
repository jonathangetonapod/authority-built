/**
 * Offline scorer for a generated pitch sequence, judged against the evidence it
 * was supposed to be built from.
 *
 * The prompt chain is tuned by editing docs/pitch-research-prompts.json, and
 * until now the only way to tell whether an edit helped was to read a few
 * pitches and form an impression. This gives that judgement a fixed shape: a
 * labelled golden set (docs/pitch-golden-set.json) of known-good and
 * known-bad sequences, each scored here, so a prompt or policy change shows up
 * as specific cases flipping rather than as a vibe.
 *
 * It is deliberately deterministic and offline — no model call, no network — so
 * it runs in CI on every change. It cannot replace the server-side claim audit,
 * which asks a model whether a claim is *supported*; what it can do is catch the
 * failures that have actually shipped: an opener that references nothing from
 * the show, a hallucinated guest name, an em dash, and internal material
 * reaching a host.
 *
 * The style rules mirror supabase/functions/workspace-client-shortlist
 * (pitchSequenceChecks) and src/lib/pitchQuality.ts. Edge functions cannot
 * import from src/, so the duplication is deliberate — change all three
 * together, and the golden set will tell you if you missed one.
 */

import { PITCH_WORD_TARGETS, countWords } from '@/lib/pitchQuality'

export interface PitchSequenceInput {
  subject: string
  email_1: string
  follow_up_1?: string
  follow_up_2?: string
}

export interface PitchEvidence {
  /** The research document the pitch was written from — the only permitted source of claims. */
  research: string
  /** Episode titles the show actually published. */
  episode_titles?: string[]
  /** Guests the show actually had, from Podscan speaker analysis. */
  guest_names?: string[]
  host_name?: string | null
  /** The client being pitched. Their own name is never a hallucination. */
  client_name?: string | null
  /**
   * Operator-curated notes and strategy material. Internal by definition: none
   * of this may appear in a host-facing email.
   */
  internal_notes?: string[]
  /**
   * A previously placed client may be named only when the episode is public.
   * Anything else — a decline, a no-reply — stays generic.
   */
  prior_client_name?: string | null
  prior_episode_is_public?: boolean
}

export type PitchFindingId =
  | 'subject_too_long'
  | 'opening_too_short'
  | 'opening_too_long'
  | 'follow_up_one_too_long'
  | 'follow_up_two_too_long'
  | 'banned_phrase'
  | 'em_dash'
  | 'placeholder'
  | 'multiple_links'
  | 'no_show_reference'
  | 'unsupported_name'
  | 'leaked_internal_material'
  | 'named_unaired_client'

export interface PitchFinding {
  id: PitchFindingId
  /** Blocking findings are the ones that must never reach a host. */
  blocking: boolean
  detail: string
}

export interface PitchEvaluation {
  findings: PitchFinding[]
  /** 100 minus the weight of what went wrong. Comparable across runs. */
  score: number
  /** False when any blocking finding fired. */
  passes: boolean
}

/** Phrases podcast hosts name as instant "this is AI" tells. */
const BANNED_PHRASES = [
  'revolutioniz',
  'game-chang',
  'transformative',
  'journey',
  'dive into',
  'unlock',
  'unleash',
  'thrilled',
  'passionate about',
  'compelling guest',
  'valuable insights',
  'hope this finds you well',
  'hope this email finds you well',
]

/**
 * Capitalized words that start sentences, name months, or belong to the
 * agency's own vocabulary are not claims about the show. Without this the
 * hallucinated-name check would flag most of the English language.
 */
const NON_NAME_WORDS = new Set([
  'A', 'An', 'And', 'As', 'At', 'But', 'By', 'For', 'From', 'Hi', 'How', 'I',
  'If', 'In', 'It', 'My', 'No', 'Not', 'Of', 'On', 'Or', 'So', 'The', 'Then',
  'There', 'This', 'To', 'We', 'What', 'When', 'Where', 'Why', 'With', 'You',
  'Your', 'Best', 'Thanks', 'Cheers', 'Regards', 'Monday', 'Tuesday',
  'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January',
  'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December',
])

/** Blocking findings cost more because they are the ones that reach a host. */
const FINDING_WEIGHTS: Record<PitchFindingId, number> = {
  subject_too_long: 4,
  opening_too_short: 6,
  opening_too_long: 8,
  follow_up_one_too_long: 4,
  follow_up_two_too_long: 4,
  banned_phrase: 10,
  em_dash: 6,
  placeholder: 20,
  multiple_links: 6,
  no_show_reference: 25,
  unsupported_name: 25,
  leaked_internal_material: 30,
  named_unaired_client: 20,
}

const BLOCKING: ReadonlySet<PitchFindingId> = new Set<PitchFindingId>([
  'placeholder',
  'no_show_reference',
  'unsupported_name',
  'leaked_internal_material',
  'named_unaired_client',
])

const normalize = (value: string): string => value.toLowerCase().replace(/\s+/gu, ' ').trim()

/**
 * Proper-name candidates: two or more adjacent capitalized words that are not
 * sentence scaffolding.
 *
 * The edges matter more than the middle. "Hi Michael" and "Best Regards" are
 * capitalized pairs, but stripping the scaffolding word leaves a single name —
 * and one name is a greeting, not a claim about who appeared on the show. Only
 * what survives the trim with two words intact is treated as a person.
 */
function properNames(text: string): string[] {
  const matches = text.match(/\b[A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+)+/gu) ?? []
  const names: string[] = []
  for (const candidate of matches) {
    const words = candidate.split(/\s+/u)
    while (words.length > 0 && NON_NAME_WORDS.has(words[0])) words.shift()
    while (words.length > 0 && NON_NAME_WORDS.has(words[words.length - 1])) words.pop()
    if (words.length >= 2) names.push(words.join(' '))
  }
  return names
}

/**
 * Did the opener show evidence of having heard the show? A title, a guest, or a
 * quoted phrase that actually appears in the research all count; nothing else
 * distinguishes this email from one that could have been sent to any podcast.
 */
function referencesTheShow(opening: string, evidence: PitchEvidence): boolean {
  const haystack = normalize(opening)
  const research = normalize(evidence.research)
  const anchors = [
    ...(evidence.episode_titles ?? []),
    ...(evidence.guest_names ?? []),
  ].map(normalize).filter((anchor) => anchor.length >= 4)
  if (anchors.some((anchor) => haystack.includes(anchor))) return true
  // A quoted phrase counts only when the research actually contains it.
  const quoted = opening.match(/["“]([^"”]{8,200})["”]/gu) ?? []
  return quoted.some((raw) => research.includes(normalize(raw.replace(/["“”]/gu, ''))))
}

export function evaluatePitchSequence(
  sequence: PitchSequenceInput,
  evidence: PitchEvidence,
): PitchEvaluation {
  const findings: PitchFinding[] = []
  const add = (id: PitchFindingId, detail: string) => {
    if (findings.some((finding) => finding.id === id)) return
    findings.push({ id, blocking: BLOCKING.has(id), detail })
  }

  const emails: Array<[string, string]> = [
    ['subject', sequence.subject],
    ['email_1', sequence.email_1],
    ['follow_up_1', sequence.follow_up_1 ?? ''],
    ['follow_up_2', sequence.follow_up_2 ?? ''],
  ]
  const filled = emails.filter(([, value]) => value.trim())

  if (countWords(sequence.subject) > 8) {
    add('subject_too_long', `subject runs ${countWords(sequence.subject)} words (cap 8)`)
  }
  const openingWords = countWords(sequence.email_1)
  // No floor exemption for an empty opener. A missing email is the shortest
  // one there is, and a broken generation must never score as clean copy.
  if (openingWords < PITCH_WORD_TARGETS.opening.min) {
    add('opening_too_short', `opening runs ${openingWords} words (floor ${PITCH_WORD_TARGETS.opening.min})`)
  }
  if (openingWords > PITCH_WORD_TARGETS.opening.max) {
    add('opening_too_long', `opening runs ${openingWords} words (cap ${PITCH_WORD_TARGETS.opening.max})`)
  }
  const followOneWords = countWords(sequence.follow_up_1 ?? '')
  if (followOneWords > PITCH_WORD_TARGETS.follow_up_one.max) {
    add('follow_up_one_too_long', `follow-up one runs ${followOneWords} words (cap ${PITCH_WORD_TARGETS.follow_up_one.max})`)
  }
  const followTwoWords = countWords(sequence.follow_up_2 ?? '')
  if (followTwoWords > PITCH_WORD_TARGETS.follow_up_two.max) {
    add('follow_up_two_too_long', `follow-up two runs ${followTwoWords} words (cap ${PITCH_WORD_TARGETS.follow_up_two.max})`)
  }
  if ((sequence.email_1.match(/https?:\/\//gu) ?? []).length > 1) {
    add('multiple_links', 'more than one link in the opening')
  }

  for (const [key, value] of filled) {
    const lower = value.toLowerCase()
    const banned = BANNED_PHRASES.find((phrase) => lower.includes(phrase))
    if (banned) add('banned_phrase', `${key} contains “${banned}”`)
    if (value.includes('—')) add('em_dash', `${key} contains an em dash`)
    if (/\{\{|\bNot available\b/iu.test(value)) add('placeholder', `${key} leaks an unfilled placeholder`)
  }

  if (!referencesTheShow(sequence.email_1, evidence)) {
    add(
      'no_show_reference',
      'the opening names no episode, guest, or quoted moment from the research',
    )
  }

  // A name in the email that is nowhere in the evidence is invented. This is
  // the failure a host notices instantly and never forgives.
  const research = normalize(evidence.research)
  const known = new Set(
    [
      ...(evidence.guest_names ?? []),
      ...(evidence.episode_titles ?? []),
      evidence.host_name ?? '',
      evidence.client_name ?? '',
      evidence.prior_client_name ?? '',
    ].map(normalize).filter(Boolean),
  )
  for (const [key, value] of filled) {
    for (const candidate of properNames(value)) {
      const needle = normalize(candidate)
      const supported = research.includes(needle)
        || [...known].some((entry) => entry.includes(needle) || needle.includes(entry))
      if (!supported) {
        add('unsupported_name', `${key} names “${candidate}”, which appears nowhere in the research`)
      }
    }
  }

  // Operator notes and strategy material are internal by definition. A legacy
  // template once pasted a client's strategy doc straight into a pitch.
  for (const note of evidence.internal_notes ?? []) {
    const fragments = note
      .split(/[.;\n]/u)
      .map((fragment) => normalize(fragment))
      .filter((fragment) => fragment.split(' ').length >= 5)
    for (const [key, value] of filled) {
      const haystack = normalize(value)
      const leaked = fragments.find((fragment) => haystack.includes(fragment))
      if (leaked) {
        add('leaked_internal_material', `${key} reproduces internal note text: “${leaked.slice(0, 80)}”`)
      }
    }
  }

  // Naming a prior client is a warm-relationship move that only works when the
  // episode is public. A decline or a no-reply stays generic.
  if (evidence.prior_client_name && !evidence.prior_episode_is_public) {
    const needle = normalize(evidence.prior_client_name)
    const named = filled.find(([, value]) => normalize(value).includes(needle))
    if (named) {
      add(
        'named_unaired_client',
        `${named[0]} names ${evidence.prior_client_name}, whose episode with this host never aired`,
      )
    }
  }

  const penalty = findings.reduce((total, finding) => total + FINDING_WEIGHTS[finding.id], 0)
  return {
    findings,
    score: Math.max(0, 100 - penalty),
    passes: !findings.some((finding) => finding.blocking),
  }
}
