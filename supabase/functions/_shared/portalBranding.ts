// Client-facing workspace branding presentation, shared by the public
// dashboard and the portal auth endpoints. Extracted from
// public-client-dashboard so every client surface renders the same identity.

import { createAdminClient, HttpError } from './workspaceAuth.ts'

export interface BrandableWorkspace {
  id?: unknown
  name?: unknown
  logo_path?: unknown
  logo_updated_at?: unknown
}

export interface WorkspaceBranding {
  name: string
  logo_url: string | null
  primary_color: string
  accent_color: string
}

interface DatabaseError {
  code?: string
  message?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function brandSchemaUnavailable(error: DatabaseError): boolean {
  const message = (error.message ?? '').toLowerCase()
  return error.code === 'PGRST204'
    || ((message.includes('schema cache') || message.includes('does not exist')) && message.includes('client_brand_'))
}

export function presentedWorkspaceName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) {
    throw new HttpError(500, 'INVALID_WORKSPACE_BRAND', 'Dashboard branding could not be loaded')
  }
  return value.trim()
}

export function presentedWorkspaceColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9A-F]{6}$/u.test(value)
    ? value
    : fallback
}

export function presentedWorkspaceLogo(
  workspaceIdValue: unknown,
  logoPathValue: unknown,
  logoUpdatedAtValue: unknown,
): string | null {
  if (logoPathValue === null || logoPathValue === undefined) return null
  if (
    typeof workspaceIdValue !== 'string'
    || typeof logoPathValue !== 'string'
    || logoPathValue.length > 500
    || logoPathValue.includes('..')
  ) {
    throw new HttpError(500, 'INVALID_WORKSPACE_BRAND', 'Dashboard branding could not be loaded')
  }
  const [pathWorkspaceId, objectName, ...extra] = logoPathValue.split('/')
  if (
    extra.length > 0
    || pathWorkspaceId !== workspaceIdValue
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg|webp)$/iu.test(objectName || '')
  ) {
    throw new HttpError(500, 'INVALID_WORKSPACE_BRAND', 'Dashboard branding could not be loaded')
  }
  const base = Deno.env.get('SUPABASE_URL')?.trim()
  if (!base) return null
  const encodedPath = logoPathValue.split('/').map(encodeURIComponent).join('/')
  const logoUrl = new URL(`/storage/v1/object/public/workspace-logos/${encodedPath}`, base)
  if (
    typeof logoUpdatedAtValue === 'string'
    && Number.isFinite(Date.parse(logoUpdatedAtValue))
  ) {
    logoUrl.searchParams.set('v', String(Date.parse(logoUpdatedAtValue)))
  }
  return logoUrl.toString()
}

export async function loadWorkspacePresentation(
  admin: ReturnType<typeof createAdminClient>,
  workspace: BrandableWorkspace,
): Promise<WorkspaceBranding> {
  const workspaceId = workspace.id
  if (typeof workspaceId !== 'string') {
    throw new HttpError(500, 'INVALID_WORKSPACE_BRAND', 'Dashboard branding could not be loaded')
  }

  const { data: canonicalBrand, error: canonicalBrandError } = await admin
    .from('workspaces')
    .select('client_brand_name,client_brand_primary_color,client_brand_accent_color')
    .eq('id', workspaceId)
    .maybeSingle()
  if (!canonicalBrandError && canonicalBrand?.client_brand_name) {
    return {
      name: presentedWorkspaceName(canonicalBrand.client_brand_name),
      logo_url: presentedWorkspaceLogo(workspaceId, workspace.logo_path, workspace.logo_updated_at),
      primary_color: presentedWorkspaceColor(canonicalBrand.client_brand_primary_color, '#0D1B2A'),
      accent_color: presentedWorkspaceColor(canonicalBrand.client_brand_accent_color, '#C7794F'),
    }
  }
  if (canonicalBrandError && !brandSchemaUnavailable(canonicalBrandError)) {
    throw new HttpError(500, 'INVALID_WORKSPACE_BRAND', 'Dashboard branding could not be loaded')
  }

  const { data: brandEvent, error: brandEventError } = await admin
    .from('workspace_audit_log')
    .select('metadata')
    .eq('workspace_id', workspaceId)
    .eq('action', 'workspace.branding.client_identity_updated')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (brandEventError) {
    throw new HttpError(500, 'INVALID_WORKSPACE_BRAND', 'Dashboard branding could not be loaded')
  }
  const metadata = brandEvent && isRecord(brandEvent.metadata) ? brandEvent.metadata : null
  return {
    name: presentedWorkspaceName(metadata?.client_brand_name ?? workspace.name),
    logo_url: presentedWorkspaceLogo(workspaceId, workspace.logo_path, workspace.logo_updated_at),
    primary_color: presentedWorkspaceColor(metadata?.primary_color, '#0D1B2A'),
    accent_color: presentedWorkspaceColor(metadata?.accent_color, '#C7794F'),
  }
}

// Auth endpoints must never fail a valid login because branding data is
// malformed; they degrade to null and the frontend renders a neutral shell.
export async function safeWorkspaceBranding(
  admin: ReturnType<typeof createAdminClient>,
  workspace: BrandableWorkspace,
): Promise<WorkspaceBranding | null> {
  try {
    return await loadWorkspacePresentation(admin, workspace)
  } catch (_error) {
    console.error('[Portal Branding] Branding unavailable; serving neutral portal shell')
    return null
  }
}
