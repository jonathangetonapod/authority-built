import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'

export type ProspectLifecycleStatus =
  | 'draft'
  | 'researching'
  | 'matching'
  | 'analyzing'
  | 'review'
  | 'ready'
  | 'sent'
  | 'viewed'
  | 'engaged'
  | 'converted'
  | 'failed'
  | 'archived'

export type ProspectCtaType = 'reply' | 'book_call' | 'learn_more' | 'none'

export interface ProspectReadiness {
  profile_ready: boolean
  visible_count: number
  analyzed_count: number
  featured_count: number
  cta_ready: boolean
  publishable: boolean
}

export interface WorkspaceProspect {
  id: string
  workspace_id: string
  slug: string
  prospect_name: string
  first_name: string | null
  prospect_email: string | null
  prospect_company: string | null
  prospect_title: string | null
  prospect_bio: string | null
  prospect_image_url: string | null
  prospect_linkedin_url: string | null
  prospect_website: string | null
  prospect_industry: string | null
  prospect_expertise: string[] | null
  prospect_topics: string[] | null
  prospect_target_audience: string | null
  lifecycle_status: ProspectLifecycleStatus
  build_error: string | null
  build_started_at: string | null
  build_completed_at: string | null
  published_at: string | null
  sent_at: string | null
  first_engaged_at: string | null
  converted_at: string | null
  cta_type: ProspectCtaType
  cta_label: string
  cta_url: string | null
  show_pricing_section: boolean
  is_active: boolean
  content_ready: boolean
  view_count: number
  last_viewed_at: string | null
  created_at: string
  updated_at: string
  readiness: ProspectReadiness
}

export interface ProspectShortlistPodcast {
  id: string
  prospect_dashboard_id: string
  podcast_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  itunes_rating: number | null
  episode_count: number | null
  audience_size: number | null
  podcast_categories: Array<{ category_id?: string; category_name?: string }> | null
  last_posted_at: string | null
  ai_clean_description: string | null
  ai_fit_reasons: string[] | null
  ai_pitch_angles: Array<{ title: string; description: string }> | null
  ai_analyzed_at: string | null
  visibility: 'visible' | 'archived'
  display_order: number
  is_featured: boolean
  featured_order: number | null
  operator_notes: string | null
  relevance_score: number | null
  relevance_reason: string | null
  match_source: 'legacy' | 'sheet' | 'manual' | 'semantic' | 'ai_ranked'
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface ProspectShortlistPodcastInput {
  podcast_id: string
  podcast_name: string
  podcast_description?: string | null
  podcast_image_url?: string | null
  podcast_url?: string | null
  publisher_name?: string | null
  itunes_rating?: number | null
  episode_count?: number | null
  audience_size?: number | null
  last_posted_at?: string | null
  podcast_categories?: Array<{ category_id: string; category_name: string }> | null
  relevance_score?: number | null
  relevance_reason?: string | null
}

export interface ProspectShortlistAddResult {
  added: number
  skipped: number
  podcast_ids: string[]
  unpublished_for_review: boolean
}

export interface ProspectWorkspaceSummary {
  id: string
  name: string
  status: string
  is_default: boolean
  logo_path: string | null
  logo_updated_at: string | null
  client_brand_name: string | null
  client_brand_primary_color: string | null
  client_brand_accent_color: string | null
}

export interface WorkspaceProspectList {
  workspace: ProspectWorkspaceSummary
  viewer_role: 'owner' | 'admin' | 'member' | 'platform_admin'
  can_manage: boolean
  dashboards: WorkspaceProspect[]
}

export interface WorkspaceProspectDetail {
  workspace?: ProspectWorkspaceSummary
  viewer_role?: 'owner' | 'admin' | 'member' | 'platform_admin'
  can_manage?: boolean
  dashboard: WorkspaceProspect
  podcasts: ProspectShortlistPodcast[]
}

export interface WorkspaceProspectProfileInput {
  name: string
  email?: string | null
  company?: string | null
  title?: string | null
  bio?: string | null
  image_url?: string | null
  linkedin_url?: string | null
  website?: string | null
  industry?: string | null
  expertise?: string[] | null
  topics?: string[] | null
  target_audience?: string | null
  cta_type: ProspectCtaType
  cta_label?: string | null
  cta_url?: string | null
}

type ProspectActionBody = Record<string, unknown> & {
  action: string
  workspace_id: string
}

async function invokeProspectStudio<T>(body: ProspectActionBody, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('workspace-prospect-dashboards', { body })
  if (error) throw await toFunctionError(error, fallback)
  return data as T
}

function cleanProfile(input: WorkspaceProspectProfileInput): WorkspaceProspectProfileInput {
  const nullable = (value: string | null | undefined) => value?.trim() || null
  const unique = (values: string[] | null | undefined) => values
    ? Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
    : null
  return {
    name: input.name.trim(),
    email: nullable(input.email),
    company: nullable(input.company),
    title: nullable(input.title),
    bio: nullable(input.bio),
    image_url: nullable(input.image_url),
    linkedin_url: nullable(input.linkedin_url),
    website: nullable(input.website),
    industry: nullable(input.industry),
    expertise: unique(input.expertise),
    topics: unique(input.topics),
    target_audience: nullable(input.target_audience),
    cta_type: input.cta_type,
    cta_label: nullable(input.cta_label),
    cta_url: nullable(input.cta_url),
  }
}

export function getWorkspaceProspects(workspaceId: string): Promise<WorkspaceProspectList> {
  return invokeProspectStudio({
    action: 'list',
    workspace_id: workspaceId.toLowerCase(),
  }, 'Failed to load prospect dashboards.')
}

export function getWorkspaceProspect(
  workspaceId: string,
  dashboardId: string,
): Promise<WorkspaceProspectDetail> {
  return invokeProspectStudio({
    action: 'detail-get',
    workspace_id: workspaceId.toLowerCase(),
    dashboard_id: dashboardId.toLowerCase(),
  }, 'Failed to load the prospect dashboard.')
}

export async function createWorkspaceProspect(
  workspaceId: string,
  profile: WorkspaceProspectProfileInput,
): Promise<WorkspaceProspect> {
  const response = await invokeProspectStudio<{ dashboard: WorkspaceProspect }>({
    action: 'create',
    workspace_id: workspaceId.toLowerCase(),
    profile: cleanProfile(profile),
  }, 'Failed to create the prospect dashboard.')
  return response.dashboard
}

export function updateWorkspaceProspect(
  workspaceId: string,
  dashboardId: string,
  profile: WorkspaceProspectProfileInput,
  expectedUpdatedAt: string,
): Promise<WorkspaceProspectDetail> {
  return invokeProspectStudio({
    action: 'update',
    workspace_id: workspaceId.toLowerCase(),
    dashboard_id: dashboardId.toLowerCase(),
    profile: cleanProfile(profile),
    expected_updated_at: expectedUpdatedAt,
  }, 'Failed to update the prospect profile.')
}

export function buildWorkspaceProspect(
  workspaceId: string,
  dashboardId: string,
): Promise<WorkspaceProspectDetail> {
  return invokeProspectStudio({
    action: 'build',
    workspace_id: workspaceId.toLowerCase(),
    dashboard_id: dashboardId.toLowerCase(),
  }, 'Failed to build the podcast shortlist.')
}

export function setWorkspaceProspectPublished(
  workspaceId: string,
  dashboardId: string,
  published: boolean,
): Promise<WorkspaceProspectDetail> {
  return invokeProspectStudio({
    action: published ? 'publish' : 'unpublish',
    workspace_id: workspaceId.toLowerCase(),
    dashboard_id: dashboardId.toLowerCase(),
  }, `Failed to ${published ? 'publish' : 'unpublish'} the prospect dashboard.`)
}

export function updateWorkspaceProspectPodcast(
  workspaceId: string,
  dashboardId: string,
  podcastId: string,
  changes: {
    visibility?: 'visible' | 'archived'
    is_featured?: boolean
    operator_notes?: string | null
  },
): Promise<WorkspaceProspectDetail> {
  return invokeProspectStudio({
    action: 'podcast-update',
    workspace_id: workspaceId.toLowerCase(),
    dashboard_id: dashboardId.toLowerCase(),
    podcast_id: podcastId,
    changes,
  }, 'Failed to update the shortlist.')
}

export async function addWorkspaceProspectPodcasts(
  workspaceId: string,
  dashboardId: string,
  podcasts: ProspectShortlistPodcastInput[],
): Promise<ProspectShortlistAddResult> {
  const combined: ProspectShortlistAddResult = {
    added: 0,
    skipped: 0,
    podcast_ids: [],
    unpublished_for_review: false,
  }
  for (let offset = 0; offset < podcasts.length; offset += 50) {
    const result = await invokeProspectStudio<ProspectShortlistAddResult>({
      action: 'podcast-add',
      workspace_id: workspaceId.toLowerCase(),
      dashboard_id: dashboardId.toLowerCase(),
      podcasts: podcasts.slice(offset, offset + 50),
    }, 'Failed to add podcasts to the prospect shortlist.')
    combined.added += result.added
    combined.skipped += result.skipped
    combined.podcast_ids.push(...result.podcast_ids)
    combined.unpublished_for_review ||= result.unpublished_for_review
  }
  return combined
}

export async function uploadWorkspaceProspectPhoto(
  workspaceId: string,
  dashboardId: string,
  photo: File,
): Promise<WorkspaceProspectDetail> {
  const body = new FormData()
  body.set('action', 'photo-upload')
  body.set('workspace_id', workspaceId.toLowerCase())
  body.set('dashboard_id', dashboardId.toLowerCase())
  body.set('photo', photo)
  const { data, error } = await supabase.functions.invoke('workspace-prospect-dashboards', { body })
  if (error) throw await toFunctionError(error, 'Failed to upload the prospect photo.')
  return data as WorkspaceProspectDetail
}

export function removeWorkspaceProspectPhoto(
  workspaceId: string,
  dashboardId: string,
): Promise<WorkspaceProspectDetail> {
  return invokeProspectStudio({
    action: 'photo-remove',
    workspace_id: workspaceId.toLowerCase(),
    dashboard_id: dashboardId.toLowerCase(),
  }, 'Failed to remove the prospect photo.')
}

export async function archiveWorkspaceProspect(
  workspaceId: string,
  dashboardId: string,
): Promise<void> {
  await invokeProspectStudio({
    action: 'archive',
    workspace_id: workspaceId.toLowerCase(),
    dashboard_id: dashboardId.toLowerCase(),
  }, 'Failed to archive the prospect dashboard.')
}
