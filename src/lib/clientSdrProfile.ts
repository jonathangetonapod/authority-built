export const CLIENT_SDR_PROFILE_FIELD_DEFINITIONS = [
  {
    id: 'positioning',
    label: 'Offer & outcome',
    shortLabel: 'Offer',
    description: 'What this client is known for, what GOAP is pitching, and the next step a positive reply should take.',
    placeholder: 'Example: Position Dallas as a practical AI implementation leader. Move interested hosts toward a 30-minute guest-fit call.',
    core: true,
  },
  {
    id: 'ideal_opportunities',
    label: 'Ideal podcasts & audience',
    shortLabel: 'Ideal opportunities',
    description: 'The shows, hosts, listeners, industries, and conversation types that are a strong fit.',
    placeholder: 'Example: Founder, B2B SaaS, AI operations, and revenue podcasts serving operators at growing companies.',
    core: true,
  },
  {
    id: 'qualification_signals',
    label: 'Qualification signals',
    shortLabel: 'Qualification',
    description: 'Signals that make a reply worth pursuing, plus clear reasons to deprioritize or decline.',
    placeholder: 'Example: Prioritize active interview shows with relevant business audiences. Deprioritize pay-to-play requests and inactive feeds.',
    core: false,
  },
  {
    id: 'proof_points',
    label: 'Approved proof & assets',
    shortLabel: 'Proof',
    description: 'Claims, results, case studies, credentials, and links the AI may safely reference. If it is not here, it should not invent it.',
    placeholder: 'Example: $15M+ in B2B sales; built ScaleLabs; The Perk acquisition. Media kit: …',
    core: false,
  },
  {
    id: 'voice_and_tone',
    label: 'Voice & response style',
    shortLabel: 'Voice',
    description: 'How replies should sound, including length, warmth, directness, and language to avoid.',
    placeholder: 'Example: Warm, concise, practical, and confident. Use short paragraphs. Never sound pushy or overstate results.',
    core: true,
  },
  {
    id: 'reply_rules',
    label: 'Objections, scheduling & handoff',
    shortLabel: 'Reply rules',
    description: 'Approved answers, calendar behavior, boundaries, and situations that must stop for human review.',
    placeholder: 'Example: Route pricing, sponsorship, sensitive claims, and unclear scheduling to a person. Never commit to fees or dates without approval.',
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
  ideal_opportunities: '',
  qualification_signals: '',
  proof_points: '',
  voice_and_tone: '',
  reply_rules: '',
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
