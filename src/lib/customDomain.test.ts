import { describe, expect, it } from 'vitest'
import { checkDomainInput, describeDomainStatus, isRootDomain, normalizeDomainInput } from '@/lib/customDomain'

describe('normalizeDomainInput', () => {
  // What a person actually pastes: the address bar, with everything in it.
  it('strips what a browser adds around a hostname', () => {
    expect(normalizeDomainInput('  HTTPS://Podcasts.TheirAgency.com/dashboard?x=1  ')).toBe('podcasts.theiragency.com')
    expect(normalizeDomainInput('http://podcasts.theiragency.com:8080')).toBe('podcasts.theiragency.com')
    expect(normalizeDomainInput('podcasts.theiragency.com.')).toBe('podcasts.theiragency.com')
  })
})

describe('checkDomainInput', () => {
  it('says nothing before anything is typed', () => {
    expect(checkDomainInput('')).toMatchObject({ ready: false, problem: null, warning: null })
    expect(checkDomainInput('   ')).toMatchObject({ ready: false, problem: null })
  })

  it('accepts a subdomain and reports what it will send', () => {
    const check = checkDomainInput('podcasts.theiragency.com')
    expect(check).toMatchObject({ hostname: 'podcasts.theiragency.com', ready: true, problem: null, warning: null })
  })

  it('flags that it cleaned a pasted URL, so the field can show what will be used', () => {
    const check = checkDomainInput('https://podcasts.theiragency.com/app')
    expect(check.hostname).toBe('podcasts.theiragency.com')
    expect(check.cleaned).toBe(true)
    expect(check.ready).toBe(true)
  })

  it('refuses a bare name, naming the fix rather than the rule', () => {
    const check = checkDomainInput('podcasts')
    expect(check.ready).toBe(false)
    expect(check.problem).toMatch(/needs a dot/i)
  })

  it('refuses characters a domain cannot contain', () => {
    expect(checkDomainInput('their_agency.com').problem).toMatch(/letters, numbers, and hyphens/i)
    expect(checkDomainInput('their agency.com').problem).toBeTruthy()
  })

  // The same refusal the database constraint makes, before a real domain is
  // registered at the provider and rolled back.
  it('refuses our own address', () => {
    expect(checkDomainInput('getonapod.com').problem).toMatch(/our address/i)
    expect(checkDomainInput('app.getonapod.com').problem).toMatch(/our address/i)
    expect(checkDomainInput('APP.GETONAPOD.COM').ready).toBe(false)
  })

  // Allowed, because an unused domain is a real case — but never silently.
  it('warns on a root domain and offers a subdomain instead', () => {
    const check = checkDomainInput('theiragency.com')
    expect(check.ready).toBe(true)
    expect(check.warning).toMatch(/takes their website down/i)
    expect(check.suggestion).toBe('podcasts.theiragency.com')
  })

  it('treats a multi-part registry suffix as a root domain too', () => {
    expect(checkDomainInput('theiragency.co.uk').warning).toMatch(/root domain/i)
    // Not a registry suffix, so this one is an ordinary subdomain.
    expect(checkDomainInput('podcasts.theiragency.com').warning).toBeNull()
  })

  it('offers the subdomain under the registry suffix, not under the country code', () => {
    expect(checkDomainInput('theiragency.co.uk').suggestion).toBe('podcasts.theiragency.co.uk')
  })

  it('warns that www is usually the marketing site', () => {
    const check = checkDomainInput('www.theiragency.com')
    expect(check.ready).toBe(true)
    expect(check.warning).toMatch(/marketing site/i)
    expect(check.suggestion).toBe('podcasts.theiragency.com')
  })
})

describe('describeDomainStatus', () => {
  it('names the next move, including when there is nothing to do', () => {
    expect(describeDomainStatus('awaiting_dns')).toMatch(/nothing to do/i)
    expect(describeDomainStatus('provisioning')).toMatch(/automatic/i)
    expect(describeDomainStatus('active')).toMatch(/live/i)
    expect(describeDomainStatus('failed')).toMatch(/press Check/i)
  })
})

describe('isRootDomain', () => {
  it('separates a root domain from a subdomain', () => {
    expect(isRootDomain('theiragency.com')).toBe(true)
    expect(isRootDomain('theiragency.co.uk')).toBe(true)
    expect(isRootDomain('podcasts.theiragency.com')).toBe(false)
    expect(isRootDomain('podcasts.theiragency.co.uk')).toBe(false)
  })

  // The suffixes the first version's length-and-label rule split both ways.
  it('covers registry suffixes whose second label is not co/com/org', () => {
    for (const hostname of ['theiragency.ne.jp', 'theiragency.me.uk', 'theiragency.go.id', 'theiragency.in.th']) {
      expect(isRootDomain(hostname)).toBe(true)
    }
  })

  it('does not call an ordinary subdomain a root domain', () => {
    // Three labels ending in a real TLD, but co.com is not a registry suffix.
    expect(isRootDomain('blog.co.com')).toBe(false)
    expect(isRootDomain('podcasts.theiragency.ne.jp')).toBe(false)
    // An unlisted suffix falls through to subdomain: a missed warning is the
    // safe direction, a wrong one is not.
    expect(isRootDomain('theiragency.unknownsuffix.zz')).toBe(false)
  })
})
