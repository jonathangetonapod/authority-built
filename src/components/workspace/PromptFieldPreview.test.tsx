import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
  // One list, every field the prompt names. A switch you cannot see is a
  // switch nobody finds, so nothing is folded away.
  it('shows every field the prompt names, filled or not', () => {
    render(<PromptFieldPreview content={PROMPT} preview={preview()} podcastName="Operator Weekly" />)

    expect(screen.getByText('2 of 3 filled')).toBeInTheDocument()
    expect(screen.getByText('Dana Reed')).toBeInTheDocument()
    expect(screen.getByText('Operator Weekly', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('episode_transcript')).toBeInTheDocument()
  })

  // A failed read named the wrong cause: it claimed no podcast was open.
  it('separates a failed read from having no podcast open', () => {
    const retry = vi.fn()
    render(<PromptFieldPreview content={PROMPT} preview={null} error onRetry={retry} />)
    expect(screen.getByText(/could not be read/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalled()
    expect(screen.queryByText(/Open this from a podcast/)).not.toBeInTheDocument()
  })

  // A client field is empty for every podcast, not for this one.
  it('points a missing client field at the client record', () => {
    render(
      <PromptFieldPreview
        content="Introduce {{client_bio}}."
        preview={preview({ fields: { client_bio: { value: null, truncated: false } } })}
      />,
    )
    expect(screen.getByText(/Not on the client record/)).toBeInTheDocument()
  })

  it('says plainly that an empty field reaches the model as “Not available”', () => {
    render(<PromptFieldPreview content={PROMPT} preview={preview()} />)
    expect(screen.getByText(/This podcast has none/)).toBeInTheDocument()
  })

  it('names the stage that will write a field, when a stage writes it', () => {
    render(
      <PromptFieldPreview
        content="Summarize {{research_report}}."
        preview={preview({ fields: { research_report: { value: null, truncated: false } }, researched: false })}
      />,
    )
    expect(screen.getByText(/Written by podcast_research, which has not run/)).toBeInTheDocument()
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
    expect(screen.queryByText(/Written by/)).not.toBeInTheDocument()
    expect(screen.getByText(/This podcast has none/)).toBeInTheDocument()
  })

  // The field being blank is only half of it: the instructions written around
  // it still run, against "Not available".
  it('warns that instructions built on an empty field still run', () => {
    render(<PromptFieldPreview content={PROMPT} preview={preview()} />)
    expect(screen.getByText(/quote or summarise/)).toBeInTheDocument()
    expect(screen.getByText(/will be written from/)).toBeInTheDocument()
  })

  it('says nothing about empty fields when every field is filled', () => {
    render(
      <PromptFieldPreview
        content="Open on {{podcast_name}}."
        preview={preview()}
      />,
    )
    expect(screen.queryByText(/quote or summarise/)).not.toBeInTheDocument()
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

describe('PromptFieldPreview severity', () => {
  // One field, one severity. Before this the same field could read as blocking
  // in the prompt above and merely empty in the list below.
  it('marks a required empty field as blocking, not merely empty', () => {
    render(
      <PromptFieldPreview
        content="Quote {{episode_transcript}}."
        preview={preview({ fields: { episode_transcript: { value: null, truncated: false } } })}
        requiredVariableIds={['episode_transcript']}
      />,
    )
    expect(screen.getByText(/this podcast skips the stage/)).toBeInTheDocument()
  })

  it('leaves an optional empty field as a degradation', () => {
    render(
      <PromptFieldPreview
        content="Quote {{episode_transcript}}."
        preview={preview({ fields: { episode_transcript: { value: null, truncated: false } } })}
      />,
    )
    expect(screen.queryByText(/this podcast skips the stage/)).not.toBeInTheDocument()
  })
})

describe('PromptFieldPreview episode refresh', () => {
  const refreshable = preview({
    fields: {
      episode_transcript: { value: null, truncated: false },
      podcast_name: { value: 'Operator Weekly', truncated: false },
    },
  })

  it('offers a Podscan read when an episode field is empty', () => {
    const refresh = vi.fn()
    render(
      <PromptFieldPreview
        content="Quote {{episode_transcript}} from {{podcast_name}}."
        preview={refreshable}
        onRefreshEpisodes={refresh}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Fetch episodes from Podscan/ }))
    expect(refresh).toHaveBeenCalled()
    expect(screen.getByText(/only if Podscan answers/)).toBeInTheDocument()
  })

  // Asking Podscan cannot fill a client bio or an unrun stage, so charging a
  // credit to find that out would be taking money for nothing.
  it('does not offer it when the gap is not an episode field', () => {
    render(
      <PromptFieldPreview
        content="Introduce {{client_bio}}."
        preview={preview({ fields: { client_bio: { value: null, truncated: false } } })}
        onRefreshEpisodes={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /Podscan/ })).not.toBeInTheDocument()
  })

  it('does not offer it when every field is filled', () => {
    render(
      <PromptFieldPreview
        content="Open on {{podcast_name}}."
        preview={refreshable}
        onRefreshEpisodes={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /Podscan/ })).not.toBeInTheDocument()
  })
})

