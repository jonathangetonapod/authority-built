import { describe, expect, it } from 'vitest'
import {
  selectedWorkspaceBaseHref,
  workspaceModuleFromPath,
  workspaceModuleHref,
} from '@/lib/workspaceRoutes'

describe('workspace routes', () => {
  it('builds the same module address for a selected workspace', () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    expect(workspaceModuleHref(selectedWorkspaceBaseHref(workspaceId), 'onboarding')).toBe(
      `/app/workspaces/${workspaceId}/onboarding`,
    )
  })

  it('preserves podcast research without carrying a client across workspaces', () => {
    expect(workspaceModuleFromPath(
      '/app/workspaces/11111111-1111-4111-8111-111111111111/clients/22222222-2222-4222-8222-222222222222/podcast-finder',
    )).toBe('podcast-finder')
  })

  it.each(['client-campaigns', 'master-inbox', 'mailboxes'] as const)(
    'preserves the %s module while switching workspaces',
    (module) => {
      expect(workspaceModuleFromPath(`/app/workspaces/11111111-1111-4111-8111-111111111111/${module}`)).toBe(module)
      expect(workspaceModuleHref('/app', module)).toBe(`/app/${module}`)
    },
  )

  it('preserves Prospect Studio while switching workspaces', () => {
    expect(workspaceModuleFromPath('/app/prospects')).toBe('prospects')
    expect(workspaceModuleHref('/app', 'prospects')).toBe('/app/prospects')
    expect(workspaceModuleFromPath('/app/prospect-dashboards')).toBe('prospects')
  })

  it('returns a client campaign detail to the campaign index when switching workspaces', () => {
    expect(workspaceModuleFromPath(
      '/app/workspaces/11111111-1111-4111-8111-111111111111/client-campaigns/22222222-2222-4222-8222-222222222222',
    )).toBe('client-campaigns')
  })

  it('keeps nested billing inside Settings navigation', () => {
    expect(workspaceModuleFromPath('/app/settings/billing')).toBe('settings')
  })

  it('falls back to overview outside a workspace module', () => {
    expect(workspaceModuleFromPath('/app/manage-workspaces')).toBe('overview')
    expect(workspaceModuleFromPath('/admin/dashboard')).toBe('overview')
  })

  it('keeps the retired admin prospect address in Prospect Studio', () => {
    expect(workspaceModuleFromPath('/admin/prospect-dashboards')).toBe('prospects')
  })
})
