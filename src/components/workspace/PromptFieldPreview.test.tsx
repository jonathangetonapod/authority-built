import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PromptFieldPreview } from '@/components/workspace/PromptFieldPreview'
import type { PromptPreview } from '@/services/clientShortlist'

const PROMPT = 'Use {{podcast_name}} and {{episode_transcript}} for {{client_name}}.'

const preview = (overrides: Partial<PromptPreview> = {}): PromptPreview => ({
  fields: {
    podcast_name: { value: 'Operator Weekly', truncated: false },
    episode_transcript: { value: null, truncated: false },
    client_name: { value: 'Dana Reed', truncated: false },
  },
  transcript_episode_title: null,
  researched: true,
  ...overrides,
})

describe('PromptFieldPreview', () => {
  it('shows the real value of each field the prompt names', () => {
    render(<PromptFieldPreview content={PROMPT} preview={preview()} podcastName="Operator Weekly" />)

    expect(screen.getByText('Operator Weekly', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('Dana Reed')).toBeInTheDocument()
    expect(screen.getByText('2 of 3 filled')).toBeInTheDocument()
  })

  it('says plainly that an empty field reaches the model as “Not available”', () => {
    render(<PromptFieldPreview content={PROMPT} preview={preview()} />)
    expect(screen.getByText(/Not available — the model is told exactly that/)).toBeInTheDocument()
  })

  it('distinguishes a field an earlier stage has not written yet', () => {
    render(
      <PromptFieldPreview
        content="Summarize {{research_report}}."
        preview={preview({ fields: { research_report: { value: null, truncated: false } }, researched: false })}
      />,
    )
    expect(screen.getByText(/written by an earlier stage/)).toBeInTheDocument()
  })

  it('warns when the transcript belongs to an earlier episode', () => {
    render(
      <PromptFieldPreview
        content={PROMPT}
        preview={preview({ transcript_episode_title: 'The one from June' })}
      />,
    )
    // Quoting it as the latest episode is the misattribution this prevents.
    expect(screen.getByText(/The one from June/)).toBeInTheDocument()
  })

  it('stays out of the way for a prompt that names no fields', () => {
    const { container } = render(<PromptFieldPreview content="Summarize the show." preview={preview()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('only offers real values once a podcast is in context', () => {
    render(<PromptFieldPreview content={PROMPT} preview={null} />)
    expect(screen.getByText(/Open this from a podcast/)).toBeInTheDocument()
  })
})
