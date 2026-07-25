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
      positioning: 'Taylor is a practical operations leader for growth-stage founders.',
      topics_and_angles: 'Sustainable scale, operator leverage, and durable systems.',
      listener_takeaways: 'A framework for finding and fixing the bottleneck behind stalled growth.',
      booking_details: 'Remote interviews preferred. Use the approved calendar link.',
    })).toEqual({
      ready: true,
      completed_fields: 4,
      total_fields: 6,
      missing_fields: ['proof_points', 'ideal_opportunities'],
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
      topics_and_angles: '',
      listener_takeaways: '',
      proof_points: '',
      ideal_opportunities: '',
      booking_details: '',
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
      topics_and_angles: maximumField,
      listener_takeaways: maximumField,
      proof_points: maximumField,
      ideal_opportunities: maximumField,
      booking_details: maximumField,
    }

    expect(isClientSdrProfile(profile)).toBe(true)
    expect(clientSdrProfileReadiness(profile)).toMatchObject({
      ready: true,
      completed_fields: 6,
      missing_fields: [],
    })
  })
})
