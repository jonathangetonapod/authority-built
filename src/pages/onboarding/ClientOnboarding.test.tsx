import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ClientOnboardingPage from '@/pages/onboarding/ClientOnboarding'

const { getClientOnboarding } = vi.hoisted(() => ({
  getClientOnboarding: vi.fn(),
}))

vi.mock('@/services/workspaceOnboarding', () => ({
  getClientOnboarding,
  saveClientOnboarding: vi.fn(),
  submitClientOnboarding: vi.fn(),
  uploadClientOnboardingAsset: vi.fn(),
  deleteClientOnboardingAsset: vi.fn(),
}))

const token = '55555555-5555-4555-8555-555555555555.1.private-capability'

describe('ClientOnboarding white-label experience', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getClientOnboarding.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      workspace: { name: 'Iveth Gonzalez', logo_url: 'https://assets.example.test/client-logo.webp' },
      recipient_name: 'Casey',
      status: 'in_progress',
      expires_at: '2026-08-05T00:00:00.000Z',
      current_revision: 0,
      definition: {
        schema_version: 1,
        intro_title: 'Welcome, Casey',
        intro_body: 'Iveth Gonzalez will use this information to prepare your profile.',
        completion_message: 'Thanks. Iveth Gonzalez will review your answers.',
        sections: [{
          id: 'basics',
          title: 'About you',
          description: 'Start with the essentials.',
          questions: [{
            id: 'full_name',
            type: 'short_text',
            label: 'Full name',
            description: '',
            required: true,
            placeholder: 'Jane Smith',
            mapping: 'client.name',
          }, {
            id: 'email',
            type: 'email',
            label: 'Best contact',
            description: '',
            required: false,
            placeholder: 'How should we reach you?',
            mapping: 'client.email',
          }, {
            id: 'website',
            type: 'url',
            label: 'Website',
            description: '',
            required: false,
            placeholder: 'Website or anything helpful',
            mapping: 'client.website',
          }, {
            id: 'date',
            type: 'date',
            label: 'Important date',
            description: '',
            required: false,
            placeholder: 'Any wording is fine',
            mapping: null,
          }],
        }],
      },
      accent_color: '#0F766E',
      answers: {},
      current_section: 0,
      lock_version: 0,
      comments: [],
      assets: [],
    })
  })

  it('renders client-specific branding without exposing the platform identity', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/onboarding/${token}`]}>
            <Routes><Route path="/onboarding/:token" element={<ClientOnboardingPage />} /></Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </HelmetProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'Welcome, Casey' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Iveth Gonzalez logo' })).toHaveAttribute(
      'src',
      'https://assets.example.test/client-logo.webp',
    )
    expect(screen.getByText(/Iveth Gonzalez will use this information/u)).toBeInTheDocument()
    expect(screen.getByText('Hi Casey,')).toBeInTheDocument()
    expect(screen.getByText(/Your progress saves automatically and stays private with Iveth Gonzalez/u)).toBeInTheDocument()
    expect(screen.queryByText(/your agency|Get On A Pod/iu)).not.toBeInTheDocument()
    // Field types now match the question type: the right mobile keyboard for
    // email/url and a real date picker, instead of a generic text box.
    expect(screen.getByPlaceholderText('How should we reach you?')).toHaveAttribute('type', 'email')
    expect(screen.getByPlaceholderText('Website or anything helpful')).toHaveAttribute('type', 'url')
    expect(screen.getByPlaceholderText('Any wording is fine')).toHaveAttribute('type', 'date')
    await waitFor(() => expect(document.title).toBe('Iveth Gonzalez · Client onboarding'))
  })

  it('leaves the loading state and shows a retryable error when the form request is rejected', async () => {
    getClientOnboarding.mockRejectedValueOnce(new Error('This onboarding could not be loaded.'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/onboarding/${token}`]}>
            <Routes><Route path="/onboarding/:token" element={<ClientOnboardingPage />} /></Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </HelmetProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'Onboarding link unavailable' })).toBeInTheDocument()
    expect(screen.getByText('This onboarding could not be loaded.')).toBeInTheDocument()
    expect(screen.queryByText('Opening your secure onboarding…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
