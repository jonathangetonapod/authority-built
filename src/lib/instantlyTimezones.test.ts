import { describe, expect, it } from 'vitest'
import {
  INSTANTLY_TIMEZONES,
  defaultInstantlyTimezone,
  isInstantlyTimezone,
  toInstantlyTimezone,
} from '@/lib/instantlyTimezones'

describe('instantlyTimezones', () => {
  // The two most likely browser zones in this business, and Instantly carries
  // neither. Sending them produced a campaign scheduled somewhere else with
  // nothing on screen saying so.
  it('does not offer the zones Instantly refuses', () => {
    expect(isInstantlyTimezone('America/New_York')).toBe(false)
    expect(isInstantlyTimezone('America/Los_Angeles')).toBe(false)
  })

  it('substitutes a zone on the same clock', () => {
    expect(toInstantlyTimezone('America/New_York')).toBe('America/Detroit')
    expect(toInstantlyTimezone('America/Los_Angeles')).toBe('America/Dawson')
    expect(toInstantlyTimezone('Europe/London')).toBe('Europe/Isle_of_Man')
  })

  it('keeps a zone Instantly already accepts', () => {
    expect(toInstantlyTimezone('America/Bogota')).toBe('America/Bogota')
    expect(toInstantlyTimezone('America/Chicago')).toBe('America/Chicago')
  })

  // US Eastern, not the viewer's clock: a campaign in the wrong zone emails
  // hosts at the wrong hour and the screen would look fine.
  it('falls back to a supported zone for anything unknown', () => {
    expect(toInstantlyTimezone('Mars/Olympus_Mons')).toBe('America/Detroit')
    expect(toInstantlyTimezone(null)).toBe('America/Detroit')
    expect(toInstantlyTimezone('')).toBe('America/Detroit')
  })

  it('always defaults to something Instantly will take', () => {
    expect(isInstantlyTimezone(defaultInstantlyTimezone())).toBe(true)
  })

  it('every offered zone is one Instantly accepts', () => {
    for (const zone of INSTANTLY_TIMEZONES) {
      expect(isInstantlyTimezone(zone), zone).toBe(true)
    }
  })
})
