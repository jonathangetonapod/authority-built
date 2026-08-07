import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceUniversity from '@/pages/app/WorkspaceUniversity'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import {
  getUniversityLessons,
  saveUniversityLesson,
  type UniversityLesson,
} from '@/services/universityLessons'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({
    children,
    platformWorkspace,
  }: {
    children: React.ReactNode
    platformWorkspace?: { baseHref?: string }
  }) => <div data-testid="workspace-layout" data-base-href={platformWorkspace?.baseHref}>{children}</div>,
}))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn() }))
vi.mock('@/services/universityLessons', async (importOriginal) => ({
  // The embed/thumbnail helpers are pure; only the network calls are mocked.
  ...(await importOriginal<typeof import('@/services/universityLessons')>()),
  getUniversityLessons: vi.fn(),
  saveUniversityLesson: vi.fn(),
  deleteUniversityLesson: vi.fn(),
  reorderUniversityLessons: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedLessons = vi.mocked(getUniversityLessons)
const mockedSave = vi.mocked(saveUniversityLesson)
const mockedAdminWorkspace = vi.mocked(getAdminWorkspaceView)

const platformWorkspaceId = '99999999-9999-4999-8999-999999999999'

const lesson = (overrides: Partial<UniversityLesson> = {}): UniversityLesson => ({
  id: '33333333-3333-4333-8333-333333333333',
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
  ...overrides,
})

const renderPage = (platformId?: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WorkspaceUniversity platformWorkspaceId={platformId} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceUniversity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: 'user-1' },
      workspace: { id: '11111111-1111-4111-8111-111111111111', name: 'Agency' },
    } as never)
    mockedAdminWorkspace.mockResolvedValue({
      workspace: { id: platformWorkspaceId, name: 'Lindsay Agency', logo_path: null, logo_updated_at: null },
    } as never)
  })

  it('groups lessons under their module and plays one in an embedded player', async () => {
    mockedLessons.mockResolvedValue({
      lessons: [
        lesson(),
        lesson({ id: '44444444-4444-4444-8444-444444444444', category: 'master_inbox', title: 'Review AI drafts', provider: 'youtube', video_id: 'dQw4w9WgXcQ', video_url: 'https://youtu.be/dQw4w9WgXcQ' }),
      ],
      can_manage: false,
    })
    renderPage()

    expect(await screen.findByText('Getting started')).toBeInTheDocument()
    expect(screen.getByText('Master Inbox')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Play Add your first client' }))
    const frame = await screen.findByTitle('Add your first client')
    // The pasted URL is never the iframe source — only the derived embed is.
    expect(frame).toHaveAttribute('src', 'https://www.loom.com/embed/abc123def456')
  })

  it('offers no authoring controls unless the server says so', async () => {
    mockedLessons.mockResolvedValue({ lessons: [lesson()], can_manage: false })
    renderPage()
    await screen.findByText('Add your first client')
    expect(screen.queryByRole('button', { name: /Add lesson/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit Add your first client/ })).not.toBeInTheDocument()
  })

  it('lets the platform owner add a lesson from a pasted link', async () => {
    mockedLessons.mockResolvedValue({ lessons: [], can_manage: true })
    mockedSave.mockResolvedValue(lesson())
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Add lesson/ }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Connect Instantly' } })
    fireEvent.change(screen.getByLabelText('Video link'), { target: { value: 'https://www.loom.com/share/abc123def456' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'mailboxes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add lesson' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith({
      id: null,
      category: 'mailboxes',
      title: 'Connect Instantly',
      description: '',
      video_url: 'https://www.loom.com/share/abc123def456',
      published: true,
    }))
  })

  it('shows drafts with a badge to the author, and jumps to the module a lesson teaches', async () => {
    mockedLessons.mockResolvedValue({
      lessons: [lesson({ category: 'master_inbox', published: false, title: 'Review AI drafts' })],
      can_manage: true,
    })
    renderPage(platformWorkspaceId)

    expect(await screen.findByText('Draft')).toBeInTheDocument()
    // Module links are baseHref-aware: from the platform view they stay
    // inside the selected workspace instead of jumping to the viewer's own.
    const moduleLink = screen.getByRole('link', { name: 'Open the module' })
    expect(moduleLink).toHaveAttribute(
      'href',
      `/app/workspaces/${platformWorkspaceId}/master-inbox`,
    )
  })

  it('searches across titles and says when nothing matches', async () => {
    mockedLessons.mockResolvedValue({ lessons: [lesson()], can_manage: false })
    renderPage()
    await screen.findByText('Add your first client')

    fireEvent.change(screen.getByLabelText('Search lessons'), { target: { value: 'zebra' } })
    expect(screen.getByText('No lessons match that search.')).toBeInTheDocument()
    expect(screen.queryByText('Add your first client')).not.toBeInTheDocument()
  })
})
