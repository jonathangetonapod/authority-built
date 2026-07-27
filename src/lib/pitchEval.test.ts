import { describe, expect, it } from 'vitest'
import goldenSet from '../../docs/pitch-golden-set.json'
import {
  evaluatePitchSequence,
  type PitchEvidence,
  type PitchFindingId,
  type PitchSequenceInput,
} from '@/lib/pitchEval'

interface GoldenCase {
  id: string
  label: string
  expect_findings: PitchFindingId[]
  evidence: PitchEvidence
  sequence: PitchSequenceInput
}

const cases = (goldenSet as { cases: GoldenCase[] }).cases

describe('pitch eval golden set', () => {
  it('carries enough cases to be worth running', () => {
    expect(cases.length).toBeGreaterThanOrEqual(10)
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(cases.length)
    // A golden set of only failures would pass a scorer that flags everything.
    expect(cases.some((entry) => entry.expect_findings.length === 0)).toBe(true)
  })

  it.each(cases.map((entry) => [entry.id, entry] as const))(
    'scores %s exactly as labelled',
    (_id, entry) => {
      const result = evaluatePitchSequence(entry.sequence, entry.evidence)
      expect([...result.findings.map((finding) => finding.id)].sort())
        .toEqual([...entry.expect_findings].sort())
      expect(result.passes).toBe(
        !entry.expect_findings.some((id) => [
          'placeholder',
          'no_show_reference',
          'unsupported_name',
          'leaked_internal_material',
          'named_unaired_client',
        ].includes(id)),
      )
    },
  )

  it('scores a clean sequence higher than any failing one', () => {
    const scores = cases.map((entry) => ({
      id: entry.id,
      clean: entry.expect_findings.length === 0,
      score: evaluatePitchSequence(entry.sequence, entry.evidence).score,
    }))
    const worstClean = Math.min(...scores.filter((entry) => entry.clean).map((entry) => entry.score))
    const bestFailing = Math.max(...scores.filter((entry) => !entry.clean).map((entry) => entry.score))
    expect(worstClean).toBe(100)
    expect(bestFailing).toBeLessThan(worstClean)
  })
})

describe('evaluatePitchSequence', () => {
  const evidence: PitchEvidence = {
    research: 'Hosted by Michael Wagner. In "Buying at the top of the market" he spoke with Peter Smythe about overpaying.',
    episode_titles: ['Buying at the top of the market'],
    guest_names: ['Peter Smythe'],
    host_name: 'Michael Wagner',
    client_name: 'Dallas Fontaine',
  }

  it('accepts a quoted moment that the research actually contains', () => {
    const result = evaluatePitchSequence({
      subject: 'That line about overpaying',
      email_1: 'Hi Michael, the line "he spoke with Peter Smythe about overpaying" is the part I keep coming back to.',
    }, evidence)
    expect(result.findings.map((finding) => finding.id)).not.toContain('no_show_reference')
  })

  it('rejects a quoted moment the research does not contain', () => {
    const result = evaluatePitchSequence({
      subject: 'That line of yours',
      email_1: 'Hi Michael, when you said "the market always rewards patience" it stopped me cold.',
    }, evidence)
    expect(result.findings.map((finding) => finding.id)).toContain('no_show_reference')
  })

  it('does not mistake a sign-off or a greeting for an invented guest', () => {
    const result = evaluatePitchSequence({
      subject: 'Your Peter Smythe episode',
      email_1: 'Hi Michael, your Peter Smythe conversation stayed with me and Dallas Fontaine could continue it. Best Regards, Sam',
    }, evidence)
    expect(result.findings.map((finding) => finding.id)).not.toContain('unsupported_name')
  })

  it('treats a blank sequence as unscoreable rather than reporting it clean', () => {
    const result = evaluatePitchSequence({ subject: '', email_1: '' }, evidence)
    // No opener means no show reference; an empty draft must never read as a pass.
    expect(result.passes).toBe(false)
    expect(result.findings.map((finding) => finding.id)).toContain('no_show_reference')
  })
})
