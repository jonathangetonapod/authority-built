// Per-workspace bring-your-own AI provider keys. Reuses the Instantly
// credential AES-GCM machinery (same encryption secret) so there is exactly
// one credential-storage pattern in the codebase. Operations that run on a
// workspace key are not charged platform credits.

import { createAdminClient, HttpError } from './workspaceAuth.ts'
import { decryptInstantlyApiKey, encryptInstantlyApiKey } from './instantly.ts'

export type AiProvider = 'anthropic' | 'openai' | 'winnr'

export interface ResolvedAiKey {
  apiKey: string
  source: 'workspace' | 'platform'
}

const PLATFORM_ENV: Record<AiProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  winnr: 'WINNR_API_TOKEN',
}

export function requireProvider(value: unknown): AiProvider {
  if (value === 'anthropic' || value === 'openai' || value === 'winnr') return value
  throw new HttpError(400, 'INVALID_PROVIDER', 'provider must be anthropic, openai, or winnr')
}

export async function storeWorkspaceAiKey(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  provider: AiProvider,
  apiKey: string,
  actorUserId: string,
): Promise<void> {
  const encrypted = await encryptInstantlyApiKey(apiKey)
  const { error } = await admin
    .from('workspace_ai_credentials')
    .upsert({
      workspace_id: workspaceId,
      provider,
      api_key_ciphertext: encrypted.ciphertext,
      api_key_iv: encrypted.iv,
      api_key_last_four: apiKey.slice(-4),
      created_by: actorUserId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,provider' })
  if (error) {
    throw new HttpError(503, 'AI_KEY_STORAGE_UNAVAILABLE', 'The API key could not be stored')
  }
}

export async function clearWorkspaceAiKey(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  provider: AiProvider,
): Promise<void> {
  const { error } = await admin
    .from('workspace_ai_credentials')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
  if (error) {
    throw new HttpError(503, 'AI_KEY_STORAGE_UNAVAILABLE', 'The API key could not be removed')
  }
}

export async function workspaceAiKeyStatus(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
): Promise<Record<AiProvider, { configured: boolean; last_four: string | null; updated_at: string | null }>> {
  const { data, error } = await admin
    .from('workspace_ai_credentials')
    .select('provider, api_key_last_four, updated_at')
    .eq('workspace_id', workspaceId)
  if (error) {
    throw new HttpError(503, 'AI_KEY_STORAGE_UNAVAILABLE', 'API key status is unavailable')
  }
  const status: Record<AiProvider, { configured: boolean; last_four: string | null; updated_at: string | null }> = {
    anthropic: { configured: false, last_four: null, updated_at: null },
    openai: { configured: false, last_four: null, updated_at: null },
    winnr: { configured: false, last_four: null, updated_at: null },
  }
  for (const row of (data ?? []) as Array<{ provider?: unknown; api_key_last_four?: unknown; updated_at?: unknown }>) {
    const provider = row.provider
    if (provider === 'anthropic' || provider === 'openai' || provider === 'winnr') {
      status[provider] = {
        configured: true,
        last_four: typeof row.api_key_last_four === 'string' ? row.api_key_last_four : null,
        updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
      }
    }
  }
  return status
}

// Workspace key when configured and decryptable, platform env key otherwise.
// A corrupt stored credential degrades to the platform key rather than
// breaking the product feature.
export async function resolveAiKey(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string | null,
  provider: AiProvider,
): Promise<ResolvedAiKey | null> {
  if (workspaceId) {
    const { data, error } = await admin
      .from('workspace_ai_credentials')
      .select('api_key_ciphertext, api_key_iv')
      .eq('workspace_id', workspaceId)
      .eq('provider', provider)
      .maybeSingle()
    if (!error && data?.api_key_ciphertext && data?.api_key_iv) {
      try {
        const apiKey = await decryptInstantlyApiKey({
          ciphertext: data.api_key_ciphertext,
          iv: data.api_key_iv,
        })
        if (apiKey.trim()) return { apiKey: apiKey.trim(), source: 'workspace' }
      } catch (_error) {
        console.error('[Workspace AI Keys] Stored key undecryptable; using platform key')
      }
    }
  }
  const platformKey = Deno.env.get(PLATFORM_ENV[provider])?.trim()
  if (platformKey) return { apiKey: platformKey, source: 'platform' }
  return null
}

// Cheap live validation before storing a key: both providers expose a models
// listing that authenticates without incurring generation cost.
export async function probeAiKey(provider: AiProvider, apiKey: string): Promise<boolean> {
  try {
    const response = provider === 'anthropic'
      ? await fetch('https://api.anthropic.com/v1/models?limit=1', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      })
      : await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    return response.ok
  } catch (_error) {
    return false
  }
}
