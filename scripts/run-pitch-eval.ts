/**
 * Prints the golden-set report.
 *
 * `npm run test:pitch-eval` asserts the labels still hold, which is what CI
 * needs. This prints what actually happened per case, which is what a person
 * needs while tuning docs/pitch-research-prompts.json: which cases moved, what
 * fired, and where the score went.
 *
 *   npm run eval:pitch
 *
 * Optionally point it at a file of the same shape to score your own captured
 * generations before promoting any of them into the golden set:
 *
 *   npm run eval:pitch -- path/to/captured.json
 */

import { readFileSync } from 'node:fs'
import {
  evaluatePitchSequence,
  type PitchEvidence,
  type PitchFindingId,
  type PitchSequenceInput,
} from '../src/lib/pitchEval'

interface GoldenCase {
  id: string
  label: string
  expect_findings?: PitchFindingId[]
  evidence: PitchEvidence
  sequence: PitchSequenceInput
}

const source = process.argv[2] ?? 'docs/pitch-golden-set.json'
const cases = (JSON.parse(readFileSync(source, 'utf8')) as { cases: GoldenCase[] }).cases

let unexpected = 0
const scores: number[] = []

process.stdout.write(`Pitch eval — ${source}\n\n`)
for (const entry of cases) {
  const result = evaluatePitchSequence(entry.sequence, entry.evidence)
  scores.push(result.score)
  const actual = result.findings.map((finding) => finding.id).sort()
  const expected = [...(entry.expect_findings ?? [])].sort()
  const labelled = entry.expect_findings !== undefined
  const matches = !labelled || JSON.stringify(actual) === JSON.stringify(expected)
  if (!matches) unexpected += 1

  const mark = !labelled ? '·' : matches ? '✓' : '✗'
  process.stdout.write(`${mark} ${entry.id.padEnd(24)} score ${String(result.score).padStart(3)}  ${result.passes ? 'pass' : 'BLOCKED'}\n`)
  process.stdout.write(`   ${entry.label}\n`)
  for (const finding of result.findings) {
    process.stdout.write(`     ${finding.blocking ? '!' : '-'} ${finding.id}: ${finding.detail}\n`)
  }
  if (labelled && !matches) {
    const missing = expected.filter((id) => !actual.includes(id))
    const extra = actual.filter((id) => !expected.includes(id as PitchFindingId))
    if (missing.length) process.stdout.write(`     expected but not found: ${missing.join(', ')}\n`)
    if (extra.length) process.stdout.write(`     found but not expected: ${extra.join(', ')}\n`)
  }
  process.stdout.write('\n')
}

const mean = scores.reduce((total, score) => total + score, 0) / Math.max(1, scores.length)
process.stdout.write(`${cases.length} cases · mean score ${mean.toFixed(1)} · ${unexpected} unlabelled outcome(s)\n`)
// Exit non-zero only when a labelled case disagrees, so this can gate a change
// as well as describe one.
process.exitCode = unexpected > 0 ? 1 : 0
