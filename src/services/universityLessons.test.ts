import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteUniversityLesson,
  setUniversityLessonWatched,
  getUniversityLessons,
  reorderUniversityLessons,
  saveUniversityLesson,
  universityEmbedUrl,
  universityThumbnailUrl,
  type UniversityLesson,
} from '@/services/universityLessons'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }))

const lessonId = '33333333-3333-4333-8333-333333333333'

const lesson: UniversityLesson = {
  id: lessonId,
  category: 'getting_started',
  title: 'Add your first client',
  description: 'From empty workspace to a client with a shortlist.',
  video_url: 'https://www.loom.com/share/abc123def456',
  provider: 'loom',
  video_id: 'abc123def456',
  sort_order: 0,
  published: true,
  created_at: '2026-08-07T00:00:00.000Z',
  updated_at: '2026-08-07T00:00:00.000Z',
}

describe('universityLessons service', () => {
  beforeEach(() => {
    invoke.mockReset()
  })

  it('lists lessons and carries the authoring flag and watches through', async () => {
    invoke.mockResolvedValue({
      data: { lessons: [lesson], watched_lesson_ids: [lessonId], can_manage: true },
      error: null,
    })
    const result = await getUniversityLessons()
    expect(invoke).toHaveBeenCalledWith('platform-university', { body: { action: 'list' } })
    expect(result.lessons).toEqual([lesson])
    expect(result.watched_lesson_ids).toEqual([lessonId])
    expect(result.can_manage).toBe(true)
  })

  it('treats a response with no watch list as nothing watched', async () => {
    invoke.mockResolvedValue({ data: { lessons: [lesson], can_manage: false }, error: null })
    const result = await getUniversityLessons()
    expect(result.watched_lesson_ids).toEqual([])
  })

  it('sends the watched toggle exactly as asked', async () => {
    invoke.mockResolvedValue({ data: { success: true, watched: false }, error: null })
    await setUniversityLessonWatched(lessonId, false)
    expect(invoke).toHaveBeenCalledWith('platform-university', {
      body: { action: 'set-watched', lesson_id: lessonId, watched: false },
    })
  })

  it('refuses an unreadable list payload instead of rendering an empty page', async () => {
    invoke.mockResolvedValue({ data: { nonsense: true }, error: null })
    await expect(getUniversityLessons()).rejects.toThrow(/could not be read/i)
  })

  it('never claims authoring when the server does not', async () => {
    invoke.mockResolvedValue({ data: { lessons: [] }, error: null })
    const result = await getUniversityLessons()
    expect(result.can_manage).toBe(false)
  })

  it('sends the exact upsert payload, omitting id on create', async () => {
    invoke.mockResolvedValue({ data: { lesson }, error: null })
    await saveUniversityLesson({
      category: 'getting_started',
      title: 'Add your first client',
      description: 'From empty workspace to a client with a shortlist.',
      video_url: 'https://www.loom.com/share/abc123def456',
      published: true,
    })
    expect(invoke).toHaveBeenCalledWith('platform-university', {
      body: {
        action: 'upsert',
        category: 'getting_started',
        title: 'Add your first client',
        description: 'From empty workspace to a client with a shortlist.',
        video_url: 'https://www.loom.com/share/abc123def456',
        published: true,
      },
    })
  })

  it('targets the lesson by id on edit and delete', async () => {
    invoke.mockResolvedValue({ data: { lesson }, error: null })
    await saveUniversityLesson({
      id: lessonId,
      category: 'clients',
      title: 'Edited',
      description: '',
      video_url: 'https://youtu.be/dQw4w9WgXcQ',
      published: false,
    })
    expect(invoke.mock.calls[0][1].body.id).toBe(lessonId)

    invoke.mockResolvedValue({ data: { success: true }, error: null })
    await deleteUniversityLesson(lessonId)
    expect(invoke).toHaveBeenLastCalledWith('platform-university', {
      body: { action: 'delete', id: lessonId },
    })
  })

  it('sends the whole ordered id list on reorder', async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null })
    await reorderUniversityLessons('clients', [lessonId])
    expect(invoke).toHaveBeenCalledWith('platform-university', {
      body: { action: 'reorder', category: 'clients', ordered_ids: [lessonId] },
    })
  })

  it('embeds via the provider id, never the pasted URL', () => {
    expect(universityEmbedUrl(lesson)).toBe('https://www.loom.com/embed/abc123def456')
    expect(universityEmbedUrl({ provider: 'youtube', video_id: 'dQw4w9WgXcQ' }))
      .toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  })

  it('offers a thumbnail only where the provider has one for free', () => {
    expect(universityThumbnailUrl({ provider: 'youtube', video_id: 'dQw4w9WgXcQ' }))
      .toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(universityThumbnailUrl(lesson)).toBeNull()
  })
})
