import { describe, expect, it } from 'vitest'
import { bookingLinkFromPaste, bookingLinkUrl, schedulerEmbedUrl, schedulerName } from '@/lib/schedulerEmbed'

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
    // The host serving the page, so an agency's own domain frames its own embed.
    expect(embed.searchParams.get('embed_domain')).toBe(window.location.hostname)
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

describe('bookingLinkFromPaste', () => {
  // What Cal.com's "embed code" button actually puts on the clipboard.
  const calSnippet = `<!-- Cal inline embed code begins -->
<div style="width:100%;height:100%;overflow:scroll" id="my-cal-inline-30min"></div>
<script type="text/javascript">
  (function (C, A, L) { let p = function (a, ar) { a.q.push(ar); }; })(window, "https://app.cal.com/embed/embed.js", "init");
Cal("init", "30min", {origin:"https://app.cal.com"});
  Cal.ns["30min"]("inline", {
    elementOrSelector:"#my-cal-inline-30min",
    config: {"layout":"month_view"},
    calLink: "jonathan-garces-x5v8tl/30min",
  });
  </script>
  <!-- Cal inline embed code ends -->`

  it('takes the booking link out of a Cal.com embed block', () => {
    // Not app.cal.com/embed/embed.js, which is the first https URL in it.
    expect(bookingLinkFromPaste(calSnippet)).toBe('https://cal.com/jonathan-garces-x5v8tl/30min')
    expect(schedulerEmbedUrl(bookingLinkFromPaste(calSnippet))).toBe('https://cal.com/jonathan-garces-x5v8tl/30min')
  })

  it('takes it out of a Calendly widget too', () => {
    const calendly = '<div class="calendly-inline-widget" data-url="https://calendly.com/agency/intro" style="min-width:320px"></div>'
      + '<script src="https://assets.calendly.com/assets/external/widget.js"></script>'
    expect(bookingLinkFromPaste(calendly)).toBe('https://calendly.com/agency/intro')
  })

  it('passes a plain URL straight through', () => {
    expect(bookingLinkFromPaste('https://cal.com/agency/30min')).toBe('https://cal.com/agency/30min')
    expect(bookingLinkFromPaste('  https://savvycal.com/agency/chat ')).toBe('https://savvycal.com/agency/chat')
  })

  it('finds nothing in text that has no booking link', () => {
    expect(bookingLinkFromPaste('book a call with me')).toBeNull()
    expect(bookingLinkFromPaste('<script src="https://example.com/widget.js"></script>')).toBeNull()
    expect(bookingLinkFromPaste('')).toBeNull()
    expect(bookingLinkFromPaste(null)).toBeNull()
  })
})
