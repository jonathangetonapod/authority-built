import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PromptRequiredFields } from '@/components/workspace/PromptRequiredFields'

const PROMPT = 'Use {{podcast_name}} and {{episode_transcript}} to pitch {{client_name}}.'

describe('PromptRequiredFields', () => {
  it('offers only the fields the prompt actually names', () => {
    render(<PromptRequiredFields content={PROMPT} required={[]} onChange={vi.fn()} />)

    expect(screen.getByLabelText('Require Podcast name')).toBeInTheDocument()
    expect(screen.getByLabelText('Require Latest episode transcript')).toBeInTheDocument()
    expect(screen.getByLabelText('Require Client name')).toBeInTheDocument()
    // Requiring a field the prompt never reads would block runs to protect a
    // value nothing uses.
    expect(screen.queryByLabelText('Require Audience size')).not.toBeInTheDocument()
    expect(screen.getAllByRole('switch')).toHaveLength(3)
  })

  it('defaults to optional, so nothing changes until an owner turns it on', () => {
    render(<PromptRequiredFields content={PROMPT} required={[]} onChange={vi.fn()} />)
    screen.getAllByRole('switch').forEach((node) => expect(node).not.toBeChecked())
    expect(screen.getAllByText('Optional')).toHaveLength(3)
  })

  it('reports the new set in registry order when one is switched on', () => {
    const onChange = vi.fn()
    render(<PromptRequiredFields content={PROMPT} required={['client_name']} onChange={onChange} />)

    fireEvent.click(screen.getByLabelText('Require Latest episode transcript'))

    // podcast/episode/client is the registry's own order, so the stored set
    // reads the way the list is drawn rather than in click order.
    expect(onChange).toHaveBeenCalledWith(['episode_transcript', 'client_name'])
  })

  it('reports the removal when one is switched off', () => {
    const onChange = vi.fn()
    render(
      <PromptRequiredFields
        content={PROMPT}
        required={['podcast_name', 'episode_transcript']}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByLabelText('Require Podcast name'))

    expect(onChange).toHaveBeenCalledWith(['episode_transcript'])
  })

  it('says when the set is inherited rather than this client’s own', () => {
    render(
      <PromptRequiredFields
        content={PROMPT}
        required={['episode_transcript']}
        onChange={vi.fn()}
        inheritedNote="Inherited from the workspace."
      />,
    )
    expect(screen.getByText('Inherited from the workspace.')).toBeInTheDocument()
    expect(screen.getByLabelText('Require Latest episode transcript')).toBeChecked()
  })

  it('has nothing to offer for a prompt that names no fields', () => {
    render(<PromptRequiredFields content="Summarize the show." required={[]} onChange={vi.fn()} />)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getByText(/names no fields/)).toBeInTheDocument()
  })

  it('ignores a token that is not a registry field', () => {
    render(<PromptRequiredFields content="Keep {{placeholders}} intact." required={[]} onChange={vi.fn()} />)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})
