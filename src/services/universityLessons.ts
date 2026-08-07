import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'

export type UniversityCategory =
  | 'getting_started'
  | 'onboarding'
  | 'clients'
  | 'podcast_finder'
  | 'podcast_database'
  | 'client_podcast_system'
  | 'prospects'
  | 'client_campaigns'
  | 'relationships'
  | 'master_inbox'
  | 'mailboxes'
  | 'billing'
  | 'settings'
  | 'other'

export interface UniversityLesson {
  id: string
  category: UniversityCategory
  title: string
  description: string
  /** The pasted watch URL, kept for editing. The player embeds via provider + video_id. */
  video_url: string
  provider: 'loom' | 'youtube'
  video_id: string
  sort_order: number
  published: boolean
  created_at: string
  updated_at: string
}

export interface UniversityLessonsResponse {
  lessons: UniversityLesson[]
  /** True for platform administrators — the audience that authors lessons. */
  can_manage: boolean
}

export interface UniversityLessonInput {
  id?: string | null
  category: UniversityCategory
  title: string
  description: string
  video_url: string
  published: boolean
}

async function invokeUniversity<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('platform-university', { body })
  if (error) throw await toFunctionError(error, fallback)
  return data as T
}

export async function getUniversityLessons(): Promise<UniversityLessonsResponse> {
  const data = await invokeUniversity<UniversityLessonsResponse>(
    { action: 'list' },
    'The University lessons could not be loaded.',
  )
  if (!data || typeof data !== 'object' || !Array.isArray(data.lessons)) {
    throw new Error('The University response could not be read. Try again.')
  }
  return { lessons: data.lessons, can_manage: data.can_manage === true }
}

export async function saveUniversityLesson(input: UniversityLessonInput): Promise<UniversityLesson> {
  const data = await invokeUniversity<{ lesson: UniversityLesson }>({
    action: 'upsert',
    ...(input.id ? { id: input.id } : {}),
    category: input.category,
    title: input.title,
    description: input.description,
    video_url: input.video_url,
    published: input.published,
  }, 'The lesson could not be saved.')
  return data.lesson
}

export async function deleteUniversityLesson(id: string): Promise<void> {
  await invokeUniversity<{ success: boolean }>(
    { action: 'delete', id },
    'The lesson could not be deleted.',
  )
}

export async function reorderUniversityLessons(
  category: UniversityCategory,
  orderedIds: string[],
): Promise<void> {
  await invokeUniversity<{ success: boolean }>(
    { action: 'reorder', category, ordered_ids: orderedIds },
    'The order could not be saved.',
  )
}

/** The embed source the player iframe uses; never the pasted URL. */
export function universityEmbedUrl(lesson: Pick<UniversityLesson, 'provider' | 'video_id'>): string {
  return lesson.provider === 'loom'
    ? `https://www.loom.com/embed/${encodeURIComponent(lesson.video_id)}`
    : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(lesson.video_id)}`
}

/** A thumbnail when the provider offers one for free; null renders a placeholder. */
export function universityThumbnailUrl(lesson: Pick<UniversityLesson, 'provider' | 'video_id'>): string | null {
  return lesson.provider === 'youtube'
    ? `https://i.ytimg.com/vi/${encodeURIComponent(lesson.video_id)}/hqdefault.jpg`
    : null
}
