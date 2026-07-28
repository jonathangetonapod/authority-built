import { describe, expect, it } from 'vitest'
import { bookingLinkUrl, schedulerEmbedUrl, schedulerName } from '@/lib/schedulerEmbed'

describe('bookingLinkUrl', () => {
  it('accepts an https scheduler link', () => {
    expect(bookingLinkUrl('https://calendly.com/agency/intro'))
      .toBe('https://calendly.com/agency/intro')
    expect(bookingLinkUrl('  https://cal.com/agency  '))
      .toBe('https://cal.com/agency')
  })

  it('refuses anything that is not a full https address', () => {
    // http would be blocked by the browser on the prospect's screen rather
    // than on the operator who pasted it.
    expect(bookingLinkUrl('http://calendly.com/agency')).toBeNull()
    expect(bookingLinkUrl('javascript:alert(1)')).toBeNull()
    expect(bookingLinkUrl('calendly.com/agency')).toBeNull()
    expect(bookingLinkUrl('')).toBeNull()
    expect(bookingLinkUrl(null)).toBeNull()
  })
})

describe('schedulerEmbedUrl', () => {
  it('inlines the schedulers that publish an embed', () => {
    expect(schedulerEmbedUrl('https://cal.com/agency/30min'))
      .toBe('https://cal.com/agency/30min')
    expect(schedulerEmbedUrl('https://savvycal.com/agency/chat'))
      .toBe('https://savvycal.com/agency/chat')
    expect(schedulerEmbedUrl('https://meetings.hubspot.com/agency'))
      .toBe('https://meetings.hubspot.com/agency')
    // www is the same host.
    expect(schedulerEmbedUrl('https://www.tidycal.com/agency/intro'))
      .toBe('https://www.tidycal.com/agency/intro')
  })

  it('asks Calendly to drop its own chrome', () => {
    const embed = new URL(schedulerEmbedUrl('https://calendly.com/agency/intro') as string)
    expect(embed.searchParams.get('embed_type')).toBe('Inline')
    expect(embed.searchParams.get('embed_domain')).toBe('getonapod.com')
    expect(embed.searchParams.get('hide_gdpr_banner')).toBe('1')
  })

  it('refuses to frame a host it does not know', () => {
    // The link is typed by an operator and rendered on a public page, so an
    // unknown origin gets a button rather than a frame.
    expect(schedulerEmbedUrl('https://example.com/book')).toBeNull()
    expect(schedulerEmbedUrl('https://calendly.com.evil.test/agency')).toBeNull()
    expect(schedulerEmbedUrl('http://calendly.com/agency')).toBeNull()
  })
})

describe('schedulerName', () => {
  it('names the scheduler so the page can say what is loading', () => {
    expect(schedulerName('https://calendly.com/agency')).toBe('Calendly')
    expect(schedulerName('https://app.cal.com/agency')).toBe('Cal.com')
    expect(schedulerName('https://example.com/book')).toBeNull()
  })
})
