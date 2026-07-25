export const CLIENT_SDR_PROFILE_FIELD_DEFINITIONS = [
  {
    id: 'positioning',
    label: 'Guest positioning',
    shortLabel: 'Positioning',
    description: 'A concise, host-ready introduction: who this guest is, what they are known for, and why their perspective matters now.',
    placeholder: 'Example: Dallas Fontaine is an AI implementation and B2B sales operator who helps growth-stage teams turn practical AI into repeatable revenue systems.',
    core: true,
  },
  {
    id: 'topics_and_angles',
    label: 'Topics & signature angles',
    shortLabel: 'Topics',
    description: 'The specific conversations, points of view, stories, and contrarian angles this guest can lead on-air.',
    placeholder: 'Example: Why most AI rollouts stall; building an operator-led adoption plan; where AI creates leverage across sales and operations.',
    core: true,
  },
  {
    id: 'listener_takeaways',
    label: 'Listener value & takeaways',
    shortLabel: 'Listener value',
    description: 'What a host can promise their audience will learn, understand, or be able to do after the conversation.',
    placeholder: 'Example: Listeners leave with a practical framework for choosing an AI use case, earning team adoption, and measuring business impact.',
    core: true,
  },
  {
    id: 'proof_points',
    label: 'Credentials, proof & media assets',
    shortLabel: 'Proof',
    description: 'Approved results, companies, books, awards, prior appearances, case studies, and links a host may safely reference.',
    placeholder: 'Example: $15M+ in B2B sales; built ScaleLabs; The Perk acquisition. Media kit and prior interviews: …',
    core: false,
  },
  {
    id: 'ideal_opportunities',
    label: 'Ideal shows & audiences',
    shortLabel: 'Ideal shows',
    description: 'The podcast categories, hosts, listeners, industries, and conversation formats where this guest is the strongest fit.',
    placeholder: 'Example: Founder, B2B SaaS, AI operations, and revenue shows serving operators at growing companies.',
    core: false,
  },
  {
    id: 'booking_details',
    label: 'Booking details & boundaries',
    shortLabel: 'Booking',
    description: 'Calendar links, availability, formats, media requirements, fee policy, and situations that require a human handoff.',
    placeholder: 'Example: Remote interviews preferred. Use the approved calendar link. Route sponsorships, pay-to-play requests, sensitive claims, and unclear dates to a person.',
    core: true,
  },
] as const

export type ClientSdrProfileField = typeof CLIENT_SDR_PROFILE_FIELD_DEFINITIONS[number]['id']

export type ClientSdrProfile = Record<ClientSdrProfileField, string>

export interface ClientSdrProfileReadiness {
  ready: boolean
  completed_fields: number
  total_fields: number
  missing_fields: ClientSdrProfileField[]
  missing_core_fields: ClientSdrProfileField[]
}

export const EMPTY_CLIENT_SDR_PROFILE: ClientSdrProfile = {
  positioning: '',
  topics_and_angles: '',
  listener_takeaways: '',
  proof_points: '',
  ideal_opportunities: '',
  booking_details: '',
}

export const CLIENT_SDR_PROFILE_MAX_FIELD_LENGTH = 4_000

const fieldIds = new Set<string>(CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.map((field) => field.id))

export function isClientSdrProfile(value: unknown): value is Partial<ClientSdrProfile> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entries = Object.entries(value as Record<string, unknown>)
  return entries.every(([key, fieldValue]) => (
    fieldIds.has(key)
    && typeof fieldValue === 'string'
    && fieldValue.length <= CLIENT_SDR_PROFILE_MAX_FIELD_LENGTH
  ))
}

export function normalizeClientSdrProfile(value: unknown): ClientSdrProfile {
  const source = isClientSdrProfile(value) ? value : {}
  return CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.reduce<ClientSdrProfile>((profile, field) => {
    profile[field.id] = typeof source[field.id] === 'string' ? source[field.id]!.trim() : ''
    return profile
  }, { ...EMPTY_CLIENT_SDR_PROFILE })
}

export function clientSdrProfileReadiness(value: unknown): ClientSdrProfileReadiness {
  const profile = normalizeClientSdrProfile(value)
  const missingFields = CLIENT_SDR_PROFILE_FIELD_DEFINITIONS
    .filter((field) => !profile[field.id])
    .map((field) => field.id)
  const missingCoreFields = CLIENT_SDR_PROFILE_FIELD_DEFINITIONS
    .filter((field) => field.core && !profile[field.id])
    .map((field) => field.id)

  return {
    ready: missingCoreFields.length === 0,
    completed_fields: CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.length - missingFields.length,
    total_fields: CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.length,
    missing_fields: missingFields,
    missing_core_fields: missingCoreFields,
  }
}

export function clientSdrProfilesEqual(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeClientSdrProfile(left)
  const normalizedRight = normalizeClientSdrProfile(right)
  return CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.every((field) => (
    normalizedLeft[field.id] === normalizedRight[field.id]
  ))
}
