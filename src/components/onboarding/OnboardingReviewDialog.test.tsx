import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OnboardingReviewDialog from '@/components/onboarding/OnboardingReviewDialog'
import type { OnboardingInstanceDetail } from '@/services/workspaceOnboarding'

const detail: OnboardingInstanceDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  client_id: '33333333-3333-4333-8333-333333333333',
  template_version_id: '44444444-4444-4444-8444-444444444444',
  template_id: '55555555-5555-4555-8555-555555555555',
  template_name: 'Podcast Guest Onboarding',
  template_version: 1,
  client_name: 'Get On A Pod',
  recipient_name: 'Jonathan',
  recipient_email: 'jonathan@example.com',
  status: 'submitted',
  capability_generation: 1,
  capability_expires_at: '2026-08-06T00:00:00.000Z',
  current_revision: 1,
  created_at: '2026-07-23T00:00:00.000Z',
  updated_at: '2026-07-23T01:00:00.000Z',
  invited_at: '2026-07-23T00:00:00.000Z',
  viewed_at: '2026-07-23T00:10:00.000Z',
  started_at: '2026-07-23T00:20:00.000Z',
  submitted_at: '2026-07-23T01:00:00.000Z',
  changes_requested_at: null,
  approved_at: null,
  revoked_at: null,
  archived_at: null,
  progress_section: 0,
  draft_lock_version: 2,
  open_comment_count: 1,
  profile_status: 'failed',
  definition: {
    schema_version: 1,
    intro_title: 'Welcome',
    intro_body: 'Tell us about yourself.',
    completion_message: 'Thank you.',
    sections: [{
      id: 'about',
      title: 'About you',
      description: 'The essentials.',
      questions: [{
        id: 'website',
        type: 'url',
        label: 'Website',
        description: '',
        required: false,
        placeholder: '',
        mapping: 'client.website',
      }, {
        id: 'story',
        type: 'long_text',
        label: 'Your story',
        description: '',
        required: true,
        placeholder: '',
        mapping: null,
      }, {
        id: 'headshot',
        type: 'image_upload',
        label: 'Headshot',
        description: '',
        required: false,
        placeholder: '',
        mapping: null,
      }],
    }],
  },
  answers: {
    website: 'Search for our company name',
    story: 'First line\nSecond line',
    headshot: '66666666-6666-4666-8666-666666666666',
  },
  revisions: [],
  comments: [{
    id: '77777777-7777-4777-8777-777777777777',
    revision: 1,
    question_id: 'story',
    body: 'This old review note should not clutter the answer view.',
    status: 'open',
    created_at: '2026-07-23T01:05:00.000Z',
    resolved_at: null,
  }],
  profile: {
    revision: 1,
    status: 'failed',
    content: {},
    generation_error: 'AI draft unavailable. Staff can retry or write it manually.',
    generated_at: null,
    updated_at: '2026-07-23T01:01:00.000Z',
  },
  assets: [{
    id: '66666666-6666-4666-8666-666666666666',
    question_id: 'headshot',
    original_name: 'headshot.webp',
    mime_type: 'image/webp',
    byte_size: 1234,
    uploaded_at: '2026-07-23T00:30:00.000Z',
    signed_url: 'https://assets.example.test/headshot.webp',
  }],
  assigned_membership_ids: [],
}

describe('OnboardingReviewDialog', () => {
  it('shows a clear read-only answer view without change-request or pitch-profile controls', () => {
    const onApprove = vi.fn()
    render(
      <OnboardingReviewDialog
        open
        detail={detail}
        canManage
        busy={false}
        onOpenChange={vi.fn()}
        onApprove={onApprove}
        onRequestChanges={vi.fn()}
      />,
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    expect(screen.getByText('Awaiting review')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Submitted answers' })).toBeInTheDocument()
    expect(screen.getByText('3 of 3 answered')).toBeInTheDocument()
    expect(screen.getByText('Search for our company name')).toBeInTheDocument()
    expect(screen.getByText(/First line\s+Second line/u)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /headshot.webp/u })).toHaveAttribute(
      'href',
      'https://assets.example.test/headshot.webp',
    )
    expect(screen.queryByPlaceholderText('Add a question-level change request…')).not.toBeInTheDocument()
    expect(screen.queryByText('Pitch profile draft')).not.toBeInTheDocument()
    expect(screen.queryByText(/AI draft unavailable/u)).not.toBeInTheDocument()
    expect(screen.queryByText(/old review note/u)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Approve onboarding' }))
    expect(onApprove).toHaveBeenCalledTimes(1)
  })

  function renderDialog(onRequestChanges = vi.fn()) {
    render(
      <OnboardingReviewDialog
        open
        detail={detail}
        canManage
        busy={false}
        onOpenChange={vi.fn()}
        onApprove={vi.fn()}
        onRequestChanges={onRequestChanges}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Request changes/u }))
    return onRequestChanges
  }

  it('sends back only the answers that were noted', () => {
    const onRequestChanges = renderDialog()

    fireEvent.change(screen.getByLabelText('Change requested for Website'), {
      target: { value: 'Please give the full legal name.' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Send 1 change back' }))
    expect(onRequestChanges).toHaveBeenCalledWith([
      { question_id: 'website', body: 'Please give the full legal name.' },
    ])
  })

  it('will not send an empty request', () => {
    renderDialog()
    // The edge action refuses fewer than one note, so an empty send would be a
    // round trip that only produces an error.
    expect(screen.getByRole('button', { name: 'Note at least one answer' })).toBeDisabled()
  })

  it('ignores a note that is only whitespace', () => {
    const onRequestChanges = renderDialog()

    fireEvent.change(screen.getByLabelText('Change requested for Website'), {
      target: { value: '   ' },
    })

    expect(screen.getByRole('button', { name: 'Note at least one answer' })).toBeDisabled()
    expect(onRequestChanges).not.toHaveBeenCalled()
  })

  it('says that sending emails the client and reopens their link', () => {
    renderDialog()
    expect(screen.getByRole('status')).toHaveTextContent(/emails Jonathan and reopens their onboarding link/u)
  })

  it('leaves approval out of reach while changes are being written', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Approve onboarding' })).toBeDisabled()
  })
})
