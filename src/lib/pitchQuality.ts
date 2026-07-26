/**
 * Client-side mirror of the pitch trust checks that run in
 * supabase/functions/workspace-client-shortlist (pitchSequenceChecks).
 *
 * The server runs them at generation time; this copy runs on every keystroke
 * while an operator edits, so the same standard applies to hand-written copy.
 * Edge functions cannot import from src/, so the duplication is deliberate —
 * change both sides together.
 *
 * Word targets come from podcast-host research: openers over ~150 words and
 * follow-ups that only bump are the two most-cited reasons pitches get
 * deleted.
 */

export type PitchEmailId = 'opening' | 'follow_up_one' | 'follow_up_two'

export interface PitchWordTarget {
  min: number
  max: number
}

export const PITCH_WORD_TARGETS: Record<PitchEmailId, PitchWordTarget> = {
  opening: { min: 100, max: 130 },
  follow_up_one: { min: 50, max: 80 },
  follow_up_two: { min: 40, max: 60 },
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

export function countWords(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length
}

export type PitchCopyStatus = 'short' | 'ideal' | 'long' | 'over'

export function wordCountStatus(count: number, target: PitchWordTarget): PitchCopyStatus {
  if (count === 0 || count < target.min) return 'short'
  if (count <= target.max) return 'ideal'
  // A modest overrun is worth flagging softly; well past the cap is the
  // failure mode hosts actually complain about.
  return count <= Math.round(target.max * 1.2) ? 'long' : 'over'
}

/**
 * Style issues an operator can fix while editing. Deliberately excludes the
 * claim audit — whether a fact is supported can only be judged against the
 * research evidence, which lives server-side.
 */
export function checkPitchCopy(text: string): string[] {
  const issues: string[] = []
  if (!text.trim()) return issues
  const lower = text.toLowerCase()
  const banned = BANNED_PHRASES.filter((phrase) => lower.includes(phrase))
  if (banned.length > 0) {
    issues.push(`Reads as AI-written: ${banned.slice(0, 3).map((phrase) => `“${phrase}”`).join(', ')}`)
  }
  if (text.includes('—')) issues.push('Contains an em dash')
  if (/\{\{|\bNot available\b/iu.test(text)) issues.push('Contains an unfilled placeholder')
  if ((text.match(/https?:\/\//gu) ?? []).length > 1) issues.push('More than one link')
  return issues
}
