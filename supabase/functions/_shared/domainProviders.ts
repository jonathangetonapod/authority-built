import { HttpError } from './httpError.ts'
import {
  cloudflareHostnameProgress,
  createCloudflareHostname,
  deleteCloudflareHostname,
  type ProviderDomain,
  type ProviderProgress,
} from './cloudflareSaas.ts'

/**
 * Where a custom domain actually lives, behind one shape.
 *
 * Extracted from the management function so a scheduled check can reach it
 * too. Nothing here changed in the move: a domain that has never been looked
 * at since it started serving is the gap this exists to close, and the check
 * that closes it must be the same check the operator's button runs, not a
 * second copy that drifts.
 */

export type { ProviderDomain, ProviderProgress }

const RAILWAY_API = 'https://backboard.railway.com/graphql/v2'

interface RailwayDomain {
  id: string
  domain: string
  status: string | null
  dnsRecordType: string | null
  dnsRecordName: string | null
  dnsRecordValue: string | null
}

// Railway returns several DNS records per domain. Only one of them routes
// traffic; the other is the ACME DNS-01 challenge, and handing an agency that
// one instead would have them create a TXT record that never serves the site.
const TRAFFIC_ROUTE = 'DNS_RECORD_PURPOSE_TRAFFIC_ROUTE'
// The certificate enum is prefixed. There is no bare 'ISSUED'.
const CERTIFICATE_VALID = 'CERTIFICATE_STATUS_TYPE_VALID'
// The provider's own word that the record is live. Only this promotes a domain
// out of "waiting for DNS" — every other value, including one Railway adds
// later that we have never seen, leaves it waiting rather than claiming
// progress we cannot back up.
const DNS_RECORD_PROPAGATED = 'DNS_RECORD_STATUS_PROPAGATED'

function trafficRecord(records: unknown): Record<string, unknown> | null {
  if (!Array.isArray(records)) return null
  const rows = records.filter((row): row is Record<string, unknown> =>
    Boolean(row) && typeof row === 'object')
  return rows.find((row) => row.purpose === TRAFFIC_ROUTE) ?? null
}

// DNS_RECORD_TYPE_CNAME -> CNAME. An apex domain gets an A record from
// Railway, so this cannot be assumed.
function dnsRecordType(value: unknown): string {
  const raw = typeof value === 'string' ? value.replace(/^DNS_RECORD_TYPE_/u, '') : ''
  return /^[A-Z]+$/u.test(raw) ? raw : 'CNAME'
}

function railwayToken(): string {
  const token = Deno.env.get('RAILWAY_API_TOKEN')?.trim()
  if (!token) {
    throw new HttpError(
      503,
      'RAILWAY_NOT_CONFIGURED',
      'RAILWAY_API_TOKEN is not set, so custom domains cannot be provisioned',
    )
  }
  return token
}

function railwayTarget(): { serviceId: string; environmentId: string; projectId: string } {
  const serviceId = Deno.env.get('RAILWAY_SERVICE_ID')?.trim()
  const environmentId = Deno.env.get('RAILWAY_ENVIRONMENT_ID')?.trim()
  const projectId = Deno.env.get('RAILWAY_PROJECT_ID')?.trim()
  if (!serviceId || !environmentId || !projectId) {
    throw new HttpError(
      503,
      'RAILWAY_NOT_CONFIGURED',
      'RAILWAY_SERVICE_ID, RAILWAY_ENVIRONMENT_ID and RAILWAY_PROJECT_ID must all be set',
    )
  }
  return { serviceId, environmentId, projectId }
}

async function railwayGraphql(
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(RAILWAY_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${railwayToken()}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (_error) {
    throw new HttpError(504, 'RAILWAY_UNREACHABLE', 'Railway did not respond')
  }

  const text = await response.text()
  if (!response.ok) {
    // Railway's status and body are the only thing that explains a refusal, so
    // they are carried through rather than replaced with a generic message.
    throw new HttpError(
      502,
      'RAILWAY_REJECTED',
      `Railway returned ${response.status}: ${text.slice(0, 300)}`,
    )
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new HttpError(502, 'RAILWAY_REJECTED', 'Railway returned a response that was not JSON')
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const first = payload.errors[0] as { message?: unknown }
    throw new HttpError(
      502,
      'RAILWAY_REJECTED',
      `Railway refused the request: ${String(first?.message ?? 'unknown error').slice(0, 300)}`,
    )
  }
  return (payload.data ?? {}) as Record<string, unknown>
}

function railwayDomain(value: unknown): RailwayDomain {
  const row = (value ?? {}) as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id : ''
  const domain = typeof row.domain === 'string' ? row.domain.toLowerCase() : ''
  if (!id || !domain) {
    throw new HttpError(502, 'RAILWAY_REJECTED', 'Railway did not return the created domain')
  }
  return {
    id,
    domain,
    status: typeof row.status === 'string' ? row.status : null,
    dnsRecordType: typeof row.dnsRecordType === 'string' ? row.dnsRecordType : null,
    dnsRecordName: typeof row.dnsRecordName === 'string' ? row.dnsRecordName : null,
    dnsRecordValue: typeof row.dnsRecordValue === 'string' ? row.dnsRecordValue : null,
  }
}

async function createRailwayDomain(hostname: string): Promise<RailwayDomain> {
  const { serviceId, environmentId, projectId } = railwayTarget()
  const data = await railwayGraphql(
    `mutation CreateCustomDomain($input: CustomDomainCreateInput!) {
       customDomainCreate(input: $input) {
         id
         domain
         status {
           certificateStatus
           dnsRecords { purpose recordType fqdn requiredValue status }
         }
       }
     }`,
    { input: { domain: hostname, serviceId, environmentId, projectId } },
  )
  const created = (data.customDomainCreate ?? {}) as Record<string, unknown>
  const status = (created.status ?? {}) as Record<string, unknown>
  const record = trafficRecord(status.dnsRecords)
  return railwayDomain({
    id: created.id,
    domain: created.domain,
    status: 'awaiting_dns',
    dnsRecordType: dnsRecordType(record?.recordType),
    // fqdn, not hostlabel: hostlabel is just the sub-label ("podcasts"), and an
    // agency pasting that into their DNS host would create the wrong record.
    dnsRecordName: typeof record?.fqdn === 'string' ? record.fqdn : hostname,
    dnsRecordValue: typeof record?.requiredValue === 'string' ? record.requiredValue : null,
  })
}

async function deleteRailwayDomain(providerDomainId: string): Promise<void> {
  await railwayGraphql(
    'mutation DeleteCustomDomain($id: String!) { customDomainDelete(id: $id) }',
    { id: providerDomainId },
  )
}

/**
 * Where the domain has actually got to, in three states rather than two.
 *
 * This used to answer serving or not-serving, and everything that was not
 * serving got written down as awaiting_dns. So a domain whose record had
 * propagated and was only waiting on a certificate reported "Waiting for DNS"
 * with a reason that told the operator to go and fix a DNS record that was
 * already correct. The provisioning state existed in the UI the whole time
 * and nothing ever set it.
 *
 * Only PROPAGATED promotes to provisioning. Anything else — requires-update,
 * an unrecognized status, or no record at all — stays awaiting_dns, because
 * the honest answer when the provider has not confirmed the record is that we
 * are still waiting on the record.
 */
async function railwayDomainProgress(
  providerDomainId: string,
): Promise<ProviderProgress> {
  const { projectId } = railwayTarget()
  const data = await railwayGraphql(
    `query CustomDomain($id: String!, $projectId: String!) {
       customDomain(id: $id, projectId: $projectId) {
         id
         status {
           certificateStatus
           certificateErrorMessage
           dnsRecords { purpose status }
         }
       }
     }`,
    { id: providerDomainId, projectId },
  )
  // Railway answers a deleted domain with a null customDomain rather than an
  // error, which read as "no certificate yet" and parked the row on waiting for
  // DNS forever — an agency chased for a record that could never help. The
  // absence is the answer.
  if (!data.customDomain) {
    return {
      status: 'failed',
      error: 'This domain no longer exists at Railway. Remove it here and add it again.',
    }
  }
  const domain = (data.customDomain ?? {}) as Record<string, unknown>
  const status = (domain.status ?? {}) as Record<string, unknown>
  if (status.certificateStatus === CERTIFICATE_VALID) return { status: 'active', error: null }
  // Railway's own message says whether DNS is missing or the certificate is
  // still issuing. That is the difference between "wait" and "fix your DNS",
  // and guessing it here would be worse than saying nothing.
  const providerMessage = typeof status.certificateErrorMessage === 'string'
    ? status.certificateErrorMessage
    : null
  const record = trafficRecord(status.dnsRecords)
  const dnsPropagated = record?.status === DNS_RECORD_PROPAGATED
  // Railway says nothing at all while a certificate is merely slow — the
  // hostname that stalled for three hours reported a null message throughout.
  // So a message here is the provider naming something wrong, which waiting
  // will not fix, rather than narrating progress.
  if (providerMessage) return { status: 'failed', error: providerMessage }
  return {
    status: dnsPropagated ? 'provisioning' : 'awaiting_dns',
    error: dnsPropagated
      // Named as done so nobody is sent back to DNS to fix what is correct.
      ? 'The DNS record is in place. Waiting for the certificate to be issued'
      : 'The DNS record has not been created yet, or has not propagated',
  }
}

/**
 * Which provider handles a domain, and which handles the next one added.
 *
 * Read per row, not globally: a workspace already serving on a Railway domain
 * must keep being refreshed and removed through Railway after the platform
 * switches, or flipping the env var would strand every live domain behind an
 * API that has never heard of it. Only new domains follow the setting.
 */
export type DomainProvider = 'railway' | 'cloudflare'

export function providerForNewDomains(): DomainProvider {
  return Deno.env.get('CUSTOM_DOMAIN_PROVIDER')?.trim() === 'cloudflare' ? 'cloudflare' : 'railway'
}

export function providerOfRow(value: unknown): DomainProvider {
  return value === 'cloudflare' ? 'cloudflare' : 'railway'
}

export function createProviderDomain(provider: DomainProvider, hostname: string): Promise<ProviderDomain> {
  if (provider === 'cloudflare') return createCloudflareHostname(hostname)
  return createRailwayDomain(hostname).then((created) => ({
    id: created.id,
    dnsRecordType: created.dnsRecordType ?? 'CNAME',
    dnsRecordName: created.dnsRecordName ?? hostname,
    dnsRecordValue: created.dnsRecordValue,
  }))
}

export function providerDomainProgress(provider: DomainProvider, providerDomainId: string): Promise<ProviderProgress> {
  if (provider === 'cloudflare') return cloudflareHostnameProgress(providerDomainId)
  return railwayDomainProgress(providerDomainId)
}

export function deleteProviderDomain(provider: DomainProvider, providerDomainId: string): Promise<void> {
  if (provider === 'cloudflare') return deleteCloudflareHostname(providerDomainId)
  return deleteRailwayDomain(providerDomainId)
}

