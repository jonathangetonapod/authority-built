import { describe, expect, it } from 'vitest'
import {
  clientSdrProfileReadiness,
  clientSdrProfilesEqual,
  isClientSdrProfile,
  normalizeClientSdrProfile,
} from '@/lib/clientSdrProfile'

describe('client AI SDR profile policy', () => {
  it('requires the four core fields while allowing recommended context later', () => {
    expect(clientSdrProfileReadiness({
      positioning: 'Position the client as a practical operator.',
      ideal_opportunities: 'Founder and operations podcasts.',
      voice_and_tone: 'Warm and concise.',
      reply_rules: 'Route pricing and uncertain scheduling to a human.',
    })).toEqual({
      ready: true,
      completed_fields: 4,
      total_fields: 6,
      missing_fields: ['qualification_signals', 'proof_points'],
      missing_core_fields: [],
    })
  })

  it('normalizes whitespace without treating unknown or non-string fields as approved context', () => {
    expect(normalizeClientSdrProfile({
      positioning: '  Approved positioning  ',
      ideal_opportunities: 42,
      unapproved_claims: 'Do not retain',
    })).toEqual({
      positioning: '',
      ideal_opportunities: '',
      qualification_signals: '',
      proof_points: '',
      voice_and_tone: '',
      reply_rules: '',
    })
    expect(isClientSdrProfile({ positioning: 42 })).toBe(false)
  })

  it('compares normalized profile values instead of object identity', () => {
    expect(clientSdrProfilesEqual(
      { positioning: 'Approved context' },
      { positioning: '  Approved context  ' },
    )).toBe(true)
  })

  it('accepts the documented maximum independently for every approved field', () => {
    const maximumField = 'x'.repeat(4_000)
    const profile = {
      positioning: maximumField,
      ideal_opportunities: maximumField,
      qualification_signals: maximumField,
      proof_points: maximumField,
      voice_and_tone: maximumField,
      reply_rules: maximumField,
    }

    expect(isClientSdrProfile(profile)).toBe(true)
    expect(clientSdrProfileReadiness(profile)).toMatchObject({
      ready: true,
      completed_fields: 6,
      missing_fields: [],
    })
  })
})
