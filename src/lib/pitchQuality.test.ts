import { describe, expect, it } from 'vitest'
import {
  checkPitchCopy,
  countWords,
  PITCH_WORD_TARGETS,
  wordCountStatus,
} from '@/lib/pitchQuality'

describe('pitchQuality', () => {
  it('keeps the research-backed length targets that keep pitches out of the bin', () => {
    // Host surveys: openers past ~150 words and padded follow-ups are the
    // most-cited deletion triggers. Changing these is a product decision.
    expect(PITCH_WORD_TARGETS.opening).toEqual({ min: 100, max: 130 })
    expect(PITCH_WORD_TARGETS.follow_up_one).toEqual({ min: 50, max: 80 })
    expect(PITCH_WORD_TARGETS.follow_up_two).toEqual({ min: 40, max: 60 })
  })

  it('grades length against the target with a tolerance band before failing it', () => {
    const target = PITCH_WORD_TARGETS.opening
    expect(wordCountStatus(0, target)).toBe('short')
    expect(wordCountStatus(80, target)).toBe('short')
    expect(wordCountStatus(115, target)).toBe('ideal')
    expect(wordCountStatus(130, target)).toBe('ideal')
    expect(wordCountStatus(145, target)).toBe('long')
    expect(wordCountStatus(200, target)).toBe('over')
  })

  it('counts words without being fooled by extra whitespace', () => {
    expect(countWords('  Hey Michael,\n\n  two   thoughts  ')).toBe(4)
    expect(countWords('   ')).toBe(0)
  })

  it('flags the phrasing podcast hosts read as machine-written', () => {
    const issues = checkPitchCopy('I am thrilled to share this transformative journey with your audience.')
    expect(issues.some((issue) => issue.startsWith('Reads as AI-written'))).toBe(true)
  })

  it('flags em dashes, leaked placeholders, and link stuffing', () => {
    expect(checkPitchCopy('A clean line — with an em dash.')).toContain('Contains an em dash')
    expect(checkPitchCopy('Hey {{host_name}}, quick idea.')).toContain('Contains an unfilled placeholder')
    expect(checkPitchCopy('Bio Not available for this guest.')).toContain('Contains an unfilled placeholder')
    expect(checkPitchCopy('See https://a.com and https://b.com for more.')).toContain('More than one link')
  })

  it('passes copy that follows the rules, including a single link', () => {
    expect(checkPitchCopy('Hey Michael, your conversation with Peter Smythe on remote management stuck with me. Details: https://scalelabs.dev')).toEqual([])
    expect(checkPitchCopy('')).toEqual([])
  })
})
