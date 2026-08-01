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

// Second-level registry labels common enough to matter here. theiragency.co.uk
// is as much a root domain as theiragency.com, and warning about one but not
// the other is the kind of gap that only shows up as a downed website.
const REGISTRY_LABELS = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu'])

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
  if (labels.length === 3 && labels[2].length <= 3 && REGISTRY_LABELS.has(labels[1])) return true
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
      return 'Waiting on the agency. Either they have not added the record yet, or they just did and it is still spreading across the internet — that part is out of everyone\'s hands and can take a few hours. Nothing to do here but leave it.'
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
