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
    expect(screen.getByText(/Not available for this podcast/)).toBeInTheDocument()
  })

  it('names the stage that will write a field, when a stage writes it', () => {
    render(
      <PromptFieldPreview
        content="Summarize {{research_report}}."
        preview={preview({ fields: { research_report: { value: null, truncated: false } }, researched: false })}
      />,
    )
    expect(screen.getByText(/written by the podcast_research stage/)).toBeInTheDocument()
  })

  // An episode field comes from the stored Podscan capture, not from a prompt.
  // Before research had run, every empty field claimed a stage would write it,
  // which sent the operator to run research when the fix was to capture
  // episodes. The registry knows which fields a stage produces; ask it.
  it('does not claim a stage will write a field no stage produces', () => {
    render(
      <PromptFieldPreview
        content="Quote {{episode_transcript}}."
        preview={preview({ fields: { episode_transcript: { value: null, truncated: false } }, researched: false })}
      />,
    )
    expect(screen.queryByText(/written by/)).not.toBeInTheDocument()
    expect(screen.getByText(/Not available for this podcast/)).toBeInTheDocument()
  })

  // The field being blank is only half of it: the instructions written around
  // it still run, against "Not available".
  it('warns that instructions built on an empty field still run', () => {
    render(<PromptFieldPreview content={PROMPT} preview={preview()} />)
    expect(screen.getByText(/1 field this prompt names is empty/)).toBeInTheDocument()
    expect(screen.getByText(/quote, summarise or count/)).toBeInTheDocument()
    expect(screen.getByText(/\{\{episode_transcript\}\}/)).toBeInTheDocument()
  })

  it('says nothing about empty fields when every field is filled', () => {
    render(
      <PromptFieldPreview
        content="Open on {{podcast_name}}."
        preview={preview()}
      />,
    )
    expect(screen.queryByText(/this prompt names is empty/)).not.toBeInTheDocument()
    expect(screen.queryByText(/prompt names are empty/)).not.toBeInTheDocument()
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
