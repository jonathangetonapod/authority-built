import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientSdrPromptsCard } from '@/components/workspace/ClientSdrPromptsCard'
import {
  getClientPromptRequirements,
  getClientSdrPrompts,
  getWorkspacePromptModels,
  getWorkspacePromptRequirements,
  getWorkspaceResearchPromptOverrides,
  resetClientSdrPrompt,
  setClientPromptRequirements,
  setClientSdrPrompt,
  setWorkspacePromptModel,
} from '@/services/workspaceCampaigns'
import { RESEARCH_PROMPT_DEFAULTS_BY_ID } from '@/lib/researchPromptDefaults'

vi.mock('@/services/workspaceCampaigns', () => ({
  getClientPromptRequirements: vi.fn(),
  getClientSdrPrompts: vi.fn(),
  getWorkspacePromptModels: vi.fn(),
  getWorkspacePromptRequirements: vi.fn(),
  getWorkspaceResearchPromptOverrides: vi.fn(),
  resetClientSdrPrompt: vi.fn(),
  setClientPromptRequirements: vi.fn(),
  setClientSdrPrompt: vi.fn(),
  setWorkspacePromptModel: vi.fn(),
}))

const mockedPrompts = vi.mocked(getClientSdrPrompts)
const mockedModels = vi.mocked(getWorkspacePromptModels)
const mockedOverrides = vi.mocked(getWorkspaceResearchPromptOverrides)
const mockedSetModel = vi.mocked(setWorkspacePromptModel)

const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const SHIPPED = RESEARCH_PROMPT_DEFAULTS_BY_ID.inbox_reply.model

const renderCard = (canManage = true) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ClientSdrPromptsCard
      workspaceId={workspaceId}
      clientId={clientId}
      clientName="Dallas Fontaine"
      canManage={canManage}
    />
  </QueryClientProvider>,
)

/** Opens a stage's editor by its heading button. */
const openStage = async (title: string) => {
  fireEvent.click(await screen.findByText(title))
}

describe('ClientSdrPromptsCard inbox model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedPrompts.mockResolvedValue({})
    mockedOverrides.mockResolvedValue({})
    mockedModels.mockResolvedValue([
      { id: 'claude-opus-5', label: 'Opus 5', contextTokens: null, maxOutputTokens: null, thinksByDefault: false },
    ])
    vi.mocked(getWorkspacePromptRequirements).mockResolvedValue({})
    vi.mocked(getClientPromptRequirements).mockResolvedValue({})
    vi.mocked(setClientSdrPrompt).mockResolvedValue(undefined)
    vi.mocked(resetClientSdrPrompt).mockResolvedValue(undefined)
    vi.mocked(setClientPromptRequirements).mockResolvedValue(undefined)
    mockedSetModel.mockResolvedValue(undefined)
  })

  it('offers the model on the reply stage, defaulting to the shipped one', async () => {
    renderCard()
    await openStage('Reply instructions')

    const picker = await screen.findByLabelText('Model the inbox runs on')
    // Empty value, not the default's id: a workspace that never chose should
    // move with us if we change the shipped default.
    expect((picker as HTMLSelectElement).value).toBe('')
    expect(screen.getByRole('option', { name: `Default (${SHIPPED})` })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Opus 5 — claude-opus-5' })).toBeInTheDocument()
    })
  })

  it('saves the choice against the reply stage, which owns the call', async () => {
    renderCard()
    await openStage('Reply instructions')

    const picker = await screen.findByLabelText('Model the inbox runs on')
    await waitFor(() => expect(picker).not.toBeDisabled())
    fireEvent.change(picker, { target: { value: 'claude-opus-5' } })

    await waitFor(() => {
      expect(mockedSetModel).toHaveBeenCalledWith(workspaceId, 'inbox_reply', 'claude-opus-5')
    })
  })

  it('returns to the shipped default rather than pinning its id', async () => {
    mockedOverrides.mockResolvedValue({ inbox_reply: { content: null, model: 'claude-opus-5', updated_at: null } })
    renderCard()
    await openStage('Reply instructions')

    const picker = await screen.findByLabelText('Model the inbox runs on')
    await waitFor(() => expect((picker as HTMLSelectElement).value).toBe('claude-opus-5'))
    fireEvent.change(picker, { target: { value: '' } })

    await waitFor(() => {
      expect(mockedSetModel).toHaveBeenCalledWith(workspaceId, 'inbox_reply', null)
    })
  })

  it('says the model is a workspace setting, not one for this client', async () => {
    renderCard()
    await openStage('Reply instructions')

    // The rest of this card is per-client, so a model picker sitting on it
    // reads as per-client unless it says otherwise.
    expect(
      await screen.findByText(/workspace setting — it applies to every client, not just Dallas Fontaine/),
    ).toBeInTheDocument()
  })

  it('gives the nudge stage no picker, because it has no call of its own', async () => {
    mockedOverrides.mockResolvedValue({ inbox_reply: { content: null, model: 'claude-opus-5', updated_at: null } })
    renderCard()
    await openStage('Follow-up nudges')

    expect(screen.queryByLabelText('Model the inbox runs on')).not.toBeInTheDocument()
    // It still has to say what it runs on, or the absence reads as an oversight.
    expect(await screen.findByText(/written in the same model call as the reply/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/\(claude-opus-5\)/)).toBeInTheDocument())
  })

  it('does not read the model list for a member who cannot change it', async () => {
    renderCard(false)
    await openStage('Reply instructions')

    const picker = await screen.findByLabelText('Model the inbox runs on')
    expect(picker).toBeDisabled()
    // A provider round trip for a control nobody can use.
    expect(mockedModels).not.toHaveBeenCalled()
  })

  it('reads the model list only once an inbox stage is open', async () => {
    renderCard()
    // The card lands closed; most visits never touch the model.
    await screen.findByText('Reply instructions')
    expect(mockedModels).not.toHaveBeenCalled()

    await openStage('Reply instructions')
    await waitFor(() => expect(mockedModels).toHaveBeenCalledWith(workspaceId))
  })
})
