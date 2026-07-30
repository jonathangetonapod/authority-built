import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PromptFieldPreview } from '@/components/workspace/PromptFieldPreview'
import type { PromptPreview } from '@/services/clientShortlist'

const PROMPT = 'Use {{podcast_name}} and {{episode_transcript}} for {{client_name}}.'

/** The values live behind the count now; open it the way an operator would. */
const openFields = () => fireEvent.click(screen.getByRole('button', { name: /filled/ }))

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
  // The values are the point of the panel, so they are on screen without
  // being asked for. What made it long was printing each as a paragraph, and
  // they are one line now — hiding them as well took away the thing worth
  // having.
  it('shows every field and its value once opened', () => {
    render(<PromptFieldPreview content={PROMPT} preview={preview()} podcastName="Operator Weekly" />)
    // The page carries the count; the values are one click behind it, so the
    // list cannot sit between the prompt and Save.
    expect(screen.queryByText('episode_transcript')).not.toBeInTheDocument()

    openFields()
    expect(screen.getByText('episode_transcript')).toBeInTheDocument()
    expect(screen.getByText('Dana Reed')).toBeInTheDocument()
    expect(screen.getByText('Operator Weekly', { selector: 'p' })).toBeInTheDocument()
  })

  it('narrows to the gaps when asked, and back again', () => {
    render(<PromptFieldPreview content={PROMPT} preview={preview()} />)
    openFields()

    fireEvent.click(screen.getByRole('button', { name: /Only the 1 empty/ }))
    expect(screen.queryByText('Dana Reed')).not.toBeInTheDocument()
    expect(screen.getByText('episode_transcript')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Show all fields/ }))
    expect(screen.getByText('Dana Reed')).toBeInTheDocument()
  })

  // Nothing to narrow to, so the control that would narrow it is not offered.
  it('offers no gaps-only view when every field is filled', () => {
    render(<PromptFieldPreview content="Open on {{podcast_name}}." preview={preview()} />)
    openFields()
    expect(screen.getByText('podcast_name')).toBeInTheDocument()
    expect(screen.queryByText(/Only the/)).not.toBeInTheDocument()
  })

  // The values are the thing worth having; they just are not worth having all
  // at once, at a paragraph each.
  it('opens one field to its full value on click', () => {
    render(<PromptFieldPreview content={PROMPT} preview={preview()} />)
    openFields()
    const row = screen.getByText('podcast_name').closest('button')!
    expect(row).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
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
    openFields()
    expect(screen.getByText(/Not on the client record/)).toBeInTheDocument()
  })

  it('says plainly that an empty field reaches the model as “Not available”', () => {
    render(<PromptFieldPreview content={PROMPT} preview={preview()} />)
    openFields()
    expect(screen.getByText(/This podcast has none/)).toBeInTheDocument()
  })

  it('names the stage that will write a field, when a stage writes it', () => {
    render(
      <PromptFieldPreview
        content="Summarize {{research_report}}."
        preview={preview({ fields: { research_report: { value: null, truncated: false } }, researched: false })}
      />,
    )
    openFields()
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
    openFields()
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
    openFields()
    expect(screen.getByText(/this podcast skips the stage/)).toBeInTheDocument()
  })

  it('leaves an optional empty field as a degradation', () => {
    render(
      <PromptFieldPreview
        content="Quote {{episode_transcript}}."
        preview={preview({ fields: { episode_transcript: { value: null, truncated: false } } })}
      />,
    )
    openFields()
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

