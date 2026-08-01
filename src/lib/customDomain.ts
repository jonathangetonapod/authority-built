/**
 * What the custom-domain field will actually do with what was typed.
 *
 * The server normalizes and validates a hostname before it registers anything,
 * and the only thing a person saw when they got it wrong was a 400 after a
 * round trip — with the typed value still in the box, looking correct. The
 * rules below mirror normalizeHostname in supabase/functions/workspace-domains
 * exactly so the field can refuse the same things in advance and say why in
 * words that name the fix.
 *
 * The mistakes worth catching are not exotic. Someone copies the address out
 * of a browser and brings https:// and a path with it; someone types the root
 * domain, which repoints the agency's marketing site; someone types our
 * address instead of theirs.
 */

const MAX_HOSTNAME_LENGTH = 253
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/u
const PLATFORM_HOSTNAME = 'getonapod.com'

/**
 * Registry suffixes that take a name under them, listed rather than guessed.
 *
 * theiragency.co.uk is as much a root domain as theiragency.com, and the shape
 * alone cannot tell you: podcasts.theiragency.com and theiragency.co.uk both
 * have three labels. The first version matched a handful of second-level
 * labels against a length rule, which quietly split both ways — it missed
 * ne.jp and me.uk, and it would have called blog.co.com a root domain.
 *
 * The full public suffix list is thousands of entries and a dependency; this
 * is the reachable part of it for an agency's domain. Anything not listed
 * falls through to being treated as a subdomain, which is the safe direction:
 * a missed warning, not a wrong one.
 */
const MULTI_PART_SUFFIXES = new Set((
  'co.uk org.uk me.uk ltd.uk plc.uk net.uk sch.uk ac.uk gov.uk nhs.uk '
  + 'com.au net.au org.au edu.au gov.au asn.au id.au '
  + 'co.nz net.nz org.nz ac.nz govt.nz school.nz '
  + 'co.za org.za net.za web.za ac.za gov.za '
  + 'com.br net.br org.br edu.br gov.br '
  + 'co.jp ne.jp or.jp ac.jp go.jp lg.jp '
  + 'co.in net.in org.in firm.in gen.in ind.in ac.in res.in gov.in '
  + 'com.cn net.cn org.cn edu.cn ac.cn gov.cn '
  + 'co.kr ne.kr or.kr re.kr pe.kr ac.kr go.kr '
  + 'com.sg net.sg org.sg edu.sg gov.sg '
  + 'com.hk net.hk org.hk edu.hk gov.hk '
  + 'com.tw net.tw org.tw edu.tw gov.tw '
  + 'com.mx net.mx org.mx edu.mx gob.mx '
  + 'com.ar net.ar org.ar edu.ar gob.ar '
  + 'com.co net.co org.co edu.co gov.co '
  + 'com.tr net.tr org.tr edu.tr gov.tr '
  + 'co.il net.il org.il ac.il gov.il '
  + 'com.pl net.pl org.pl edu.pl gov.pl '
  + 'com.ua net.ua org.ua in.ua kiev.ua '
  + 'com.es org.es edu.es gob.es '
  + 'com.ph net.ph org.ph edu.ph gov.ph '
  + 'com.my net.my org.my edu.my gov.my '
  + 'co.id or.id ac.id go.id web.id '
  + 'co.th in.th ac.th go.th or.th '
  + 'com.vn net.vn org.vn edu.vn gov.vn '
  + 'com.pk net.pk org.pk edu.pk gov.pk '
  + 'com.ng net.ng org.ng edu.ng gov.ng '
  + 'co.ke or.ke ne.ke ac.ke go.ke '
  + 'com.eg net.eg org.eg edu.eg gov.eg '
  + 'com.sa net.sa org.sa edu.sa gov.sa '
  + 'co.ae net.ae org.ae ac.ae gov.ae'
).split(' '))

export interface DomainInputCheck {
  /** The hostname that will be sent, once the obvious noise is stripped. */
  hostname: string
  /** True when the field is safe to submit. */
  ready: boolean
  /** Why it cannot be submitted, in plain language. Blocking. */
  problem: string | null
  /** Worth reading before submitting, but not wrong. Non-blocking. */
  warning: string | null
  /** A better hostname to use instead, when there is an obvious one. */
  suggestion: string | null
  /** Set when normalizing changed what was typed, so the field can show it. */
  cleaned: boolean
}

const empty: DomainInputCheck = {
  hostname: '',
  ready: false,
  problem: null,
  warning: null,
  suggestion: null,
  cleaned: false,
}

/** Mirrors the server's normalizeHostname, minus the throwing. */
export function normalizeDomainInput(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//u, '')
    .split('/')[0]
    .split('?')[0]
    .split(':')[0]
    .replace(/^\.+/u, '')
    .replace(/\.+$/u, '')
}

/** True for a root domain — theiragency.com, theiragency.co.uk. */
export function isRootDomain(hostname: string): boolean {
  const labels = hostname.split('.')
  if (labels.length === 2) return true
  if (labels.length === 3 && MULTI_PART_SUFFIXES.has(`${labels[1]}.${labels[2]}`)) return true
  return false
}

export function checkDomainInput(value: string): DomainInputCheck {
  const raw = value.trim()
  if (!raw) return empty

  const hostname = normalizeDomainInput(value)
  const cleaned = hostname !== raw.toLowerCase()
  const base: DomainInputCheck = { ...empty, hostname, cleaned }

  if (!hostname) {
    return { ...base, problem: 'Enter the address their clients will see, like podcasts.theiragency.com.' }
  }
  if (/\s/u.test(hostname)) {
    return { ...base, problem: 'A domain cannot contain spaces. Check for a stray space in what was pasted.' }
  }
  if (!hostname.includes('.')) {
    return {
      ...base,
      problem: `A domain needs a dot in it. "${hostname}" is a name on its own — the full address looks like podcasts.theiragency.com.`,
    }
  }
  if (hostname.length > MAX_HOSTNAME_LENGTH) {
    return { ...base, problem: 'That is too long to be a domain. Check for anything extra pasted onto the end.' }
  }
  if (!HOSTNAME_PATTERN.test(hostname)) {
    return {
      ...base,
      problem: 'Domains use letters, numbers, and hyphens only — no underscores, accents, or symbols.',
    }
  }
  // Refused for the same reason the database constraint refuses it, but before
  // a real domain gets registered at the provider and rolled back.
  if (hostname === PLATFORM_HOSTNAME || hostname.endsWith(`.${PLATFORM_HOSTNAME}`)) {
    return {
      ...base,
      problem: 'That is our address, not theirs. A custom domain has to be one the agency owns and can edit the DNS for.',
    }
  }

  if (isRootDomain(hostname)) {
    return {
      ...base,
      ready: true,
      suggestion: `podcasts.${hostname}`,
      warning: `${hostname} is their root domain — the one their website and email already run on. Pointing it here takes their website down with it. Use a subdomain instead unless you know this domain is unused.`,
    }
  }
  if (hostname.startsWith('www.')) {
    return {
      ...base,
      ready: true,
      suggestion: `podcasts.${hostname.slice(4)}`,
      warning: `${hostname} is almost always their marketing site. Pointing it here replaces that site with the client dashboard.`,
    }
  }

  return { ...base, ready: true }
}

export type DomainStatus = 'awaiting_dns' | 'provisioning' | 'active' | 'failed' | 'disabled'

/**
 * What is happening and whose turn it is, for someone who does not know what
 * a certificate is. The status badge names a state; this names the next move,
 * including when the next move is to do nothing.
 */
export function describeDomainStatus(status: DomainStatus): string {
  switch (status) {
    case 'awaiting_dns':
      // Never "just wait": the most common way this stalls is a record that
      // exists and is proxied, which looks exactly like one that does not
      // exist yet and never resolves itself no matter how long it sits.
      return 'Waiting on the agency. Either they have not added the record yet, or they just did and it is still spreading across the internet, which can take a few hours. If it has been sitting here longer than that, the usual cause is a Cloudflare record left on Proxied — it has to be set to DNS only, or the certificate can never issue.'
    case 'provisioning':
      return 'The record arrived. The https certificate is being issued now, which is automatic and usually takes a few minutes.'
    case 'active':
      return 'Live. Their clients see this address on dashboards, the onboarding form, and every link the platform emails.'
    case 'failed':
      return 'This one did not work. The reason is above. Once the record is fixed at their DNS host, press Check — if it keeps failing, remove the domain and add it again to start with a fresh record.'
    case 'disabled':
      return 'Turned off. It is not serving and client links do not use it.'
    default:
      return ''
  }
}
