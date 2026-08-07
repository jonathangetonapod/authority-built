import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OnboardingTemplateBuilder from '@/components/onboarding/OnboardingTemplateBuilder'
import type { OnboardingTemplate } from '@/services/workspaceOnboarding'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const template: OnboardingTemplate = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  name: 'Podcast Guest Onboarding',
  description: 'Internal description',
  status: 'published',
  definition: {
    schema_version: 1,
    intro_title: 'Let’s build your podcast guest profile',
    intro_body: 'Share the experience and ideas that make you a compelling guest.',
    completion_message: 'Thanks for completing your onboarding.',
    sections: [
      {
        id: 'section_basic',
        title: 'Basic information',
        description: 'How the agency identifies you.',
        questions: [
          {
            id: 'question_name',
            type: 'short_text',
            label: 'Full name',
            description: 'Use your public name.',
            required: true,
            placeholder: 'Jane Smith',
            mapping: 'client.name',
          },
          {
            id: 'question_email',
            type: 'email',
            label: 'Email address',
            description: '',
            required: true,
            placeholder: 'jane@example.com',
            mapping: 'client.email',
          },
        ],
      },
      {
        id: 'section_profile',
        title: 'Professional profile',
        description: 'Context that establishes authority.',
        questions: [
          {
            id: 'question_bio',
            type: 'long_text',
            label: 'Current professional bio',
            description: '',
            required: true,
            placeholder: 'Tell us about your background.',
            mapping: 'client.bio',
          },
        ],
      },
    ],
  },
  reminder_days: [3, 7, 12],
  published_version: 1,
  published_definition: null,
  has_unpublished_changes: false,
  is_default: true,
  created_at: '2026-07-22T00:00:00.000Z',
  updated_at: '2026-07-22T00:00:00.000Z',
  archived_at: null,
}

const renderBuilder = (onSave = vi.fn()) => {
  render(
    <OnboardingTemplateBuilder
      open
      template={template}
      workspaceName="Iveth Gonzalez"
      workspaceLogoUrl="https://cdn.example.com/iveth-logo.webp"
      saving={false}
      onOpenChange={vi.fn()}
      onSave={onSave}
    />,
  )
  return onSave
}

describe('OnboardingTemplateBuilder', () => {
  it('shows one active section and expands only the selected question editor', () => {
    renderBuilder()

    expect(screen.getByRole('button', { name: /Full name/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /Email address/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByDisplayValue('Jane Smith')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('jane@example.com')).not.toBeInTheDocument()
    expect(screen.queryByText('Current professional bio')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Email address/ }))
    expect(screen.getByRole('button', { name: /Email address/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByDisplayValue('Jane Smith')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('jane@example.com')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Professional profile/ }))
    expect(screen.getByText('Current professional bio')).toBeInTheDocument()
    expect(screen.queryByText('Full name')).not.toBeInTheDocument()
  })

  it('separates internal settings and provides the complete interactive client flow', () => {
    renderBuilder()

    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }))
    expect(screen.getByDisplayValue('Podcast Guest Onboarding')).toBeInTheDocument()
    expect(screen.getByText('Clients never see this note.')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Reminder days/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(screen.getByRole('img', { name: 'Iveth Gonzalez logo' })).toHaveAttribute('src', 'https://cdn.example.com/iveth-logo.webp')
    expect(screen.getByText('Secure client intake')).toBeInTheDocument()
    expect(screen.getByText('Preview answers are not saved')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Basic information' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Professional profile' })).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('jane@example.com')).toHaveAttribute('type', 'text')

    fireEvent.change(screen.getByPlaceholderText('Jane Smith'), { target: { value: 'Iveth Gonzalez' } })
    fireEvent.change(screen.getByPlaceholderText('jane@example.com'), { target: { value: 'iveth@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }))

    expect(screen.getByRole('heading', { name: 'Professional profile' })).toBeInTheDocument()
    expect(screen.getByText('Current professional bio')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Tell us about your background.'), { target: { value: 'Founder and podcast guest.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
    expect(screen.getByRole('heading', { name: 'Onboarding submitted' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restart preview' })).toBeInTheDocument()
  })

  it('duplicates a question without duplicating its client mapping and saves the draft', () => {
    const onSave = renderBuilder()

    fireEvent.click(screen.getAllByLabelText('Duplicate question')[0])
    expect(screen.getByText('Full name copy')).toBeInTheDocument()
    expect(screen.getByText('4/100 questions')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(onSave).toHaveBeenCalledTimes(1)

    const [savedDraft, publish, makeDefault] = onSave.mock.calls[0]
    expect(publish).toBe(false)
    expect(makeDefault).toBe(true)
    expect(savedDraft.definition.sections[0].questions).toHaveLength(3)
    expect(savedDraft.definition.sections[0].questions[1].mapping).toBeNull()
    expect(savedDraft.reminder_days).toEqual([])
  })
})
