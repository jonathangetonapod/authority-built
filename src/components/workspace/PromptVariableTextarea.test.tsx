import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PromptVariableTextarea } from '@/components/workspace/PromptVariableTextarea'
import { PROMPT_VARIABLES, PROMPT_VARIABLE_GROUPS } from '@/lib/promptVariables'

const Harness = ({
  readOnly,
  availability,
  requiredVariableIds,
  onToggleRequired,
  initial = '',
}: {
  readOnly?: boolean
  availability?: Record<string, boolean> | null
  requiredVariableIds?: string[]
  onToggleRequired?: (id: string, next: boolean) => void
  initial?: string
}) => {
  const [value, setValue] = useState(initial)
  return (
    <PromptVariableTextarea
      value={value}
      onChange={setValue}
      ariaLabel="Prompt"
      readOnly={readOnly}
      availability={availability}
      requiredVariableIds={requiredVariableIds}
      onToggleRequired={onToggleRequired}
    />
  )
}

/**
 * The coloured layer mirrors the prompt. Its text is hidden from the a11y
 * tree piece by piece, but the layer itself is not: the switches on it are
 * real controls that have to stay reachable.
 */
const highlightLayer = () => document.querySelector('div.absolute.select-none')
const tokenSpan = (token: string) =>
  Array.from(highlightLayer()?.querySelectorAll('span') ?? [])
    .find((node) => node.textContent === token)

const field = () => screen.getByLabelText('Prompt') as HTMLTextAreaElement

/**
 * By text rather than by accessible name: the matched substring is split into
 * its own element, which changes how the name is computed but not what the row
 * says.
 */
const rowFor = (variableId: string) => {
  const row = screen.getAllByRole('option').find((node) => node.textContent?.startsWith(variableId))
  if (!row) throw new Error(`no option for ${variableId}`)
  return row
}

describe('PromptVariableTextarea', () => {
  it('rests as one line of hint text, with the registry a click away', async () => {
    render(<Harness />)
    // No open list: what used to be 81 chips above the field is now a hint.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Search prompt variables')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: `Browse ${PROMPT_VARIABLES.length} fields` }))
    fireEvent.change(field(), { target: { value: 'Ground this in' } })
    field().setSelectionRange(14, 14)
    fireEvent.click(await screen.findByRole('button', { name: 'Insert Audience size' }))
    await waitFor(() => expect(field().value).toBe('Ground this in {{audience_size}}'))
  })

  it('opens at the caret on a slash and inserts the token', async () => {
    render(<Harness />)
    fireEvent.change(field(), { target: { value: 'Then /host' } })
    fireEvent.click((await screen.findAllByRole('option'))[0])
    await waitFor(() => expect(field().value).toBe('Then {{host_report}}'))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens on the token syntax and does not double the braces', async () => {
    render(<Harness />)
    fireEvent.change(field(), { target: { value: 'Quote {{ep' } })
    await screen.findByRole('listbox')
    fireEvent.click(rowFor('episode_title'))
    await waitFor(() => expect(field().value).toBe('Quote {{episode_title}}'))
  })

  it('moves the active option with the arrow keys and inserts on Enter', async () => {
    render(<Harness />)
    fireEvent.change(field(), { target: { value: '/host' } })
    await screen.findByRole('listbox')
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    fireEvent.keyDown(field(), { key: 'Enter' })
    // Second row of the menu as drawn: the arrows walk the visible order.
    await waitFor(() => expect(field().value).toBe('{{host_name}}'))
  })

  it('holds the whole registry, grouped, with nothing capped away', async () => {
    render(<Harness />)
    fireEvent.change(field(), { target: { value: '/' } })
    await screen.findByRole('listbox')

    // A bare slash matches everything, and everything is what the menu holds.
    expect(screen.getAllByRole('option')).toHaveLength(PROMPT_VARIABLES.length)
    expect(screen.getByText(`All ${PROMPT_VARIABLES.length} fields`)).toBeInTheDocument()

    // Structure, so the tail of the registry is reachable rather than hidden:
    // every group the registry defines is a heading in the menu.
    expect(PROMPT_VARIABLE_GROUPS.map((group) => group.label)).toEqual(
      screen.getAllByRole('group').map((node) => node.getAttribute('aria-label')),
    )
  })

  it('narrows to the matching groups and counts against the registry', async () => {
    render(<Harness />)
    fireEvent.change(field(), { target: { value: '/host' } })
    await screen.findByRole('listbox')
    const shown = screen.getAllByRole('option').length
    expect(shown).toBeLessThan(PROMPT_VARIABLES.length)
    expect(screen.getByText(`${shown} of ${PROMPT_VARIABLES.length} fields`)).toBeInTheDocument()
    // The podcast column, the episode list and the run result all match "host",
    // and the headings are what tell them apart. The run group leads because
    // its host_report is the best match — grouping must not bury it.
    expect(screen.getAllByRole('group').map((node) => node.getAttribute('aria-label')))
      .toEqual(['Produced during the run', 'Podcast · Podscan', 'Latest episode'])
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('host_report')
  })

  it('shows where a row matched, including rows that matched only on their description', async () => {
    render(<Harness />)
    fireEvent.change(field(), { target: { value: '/host' } })
    await screen.findByRole('listbox')

    // Matched in the id.
    expect(rowFor('host_report').querySelector('mark')).toHaveTextContent('host')
    // Matched in the description alone — reply_subject has no "host" in its id,
    // and without the mark its presence in the menu is unexplained.
    const reply = rowFor('reply_subject')
    expect(reply).toHaveTextContent('Subject of the host reply')
    expect(reply.querySelector('mark')).toHaveTextContent('host')
  })

  it('never offers a field the stage being edited writes itself', async () => {
    render(
      <PromptVariableTextarea
        value=""
        onChange={() => {}}
        ariaLabel="Prompt"
        omitVariableIds={['research_report']}
      />,
    )
    fireEvent.change(field(), { target: { value: '/research' } })
    await screen.findByRole('listbox')
    const shown = screen.getAllByRole('option').map((node) => node.textContent ?? '')
    expect(shown.some((text) => text.startsWith('research_report'))).toBe(false)
  })

  it('dismisses on Escape', async () => {
    render(<Harness />)
    fireEvent.change(field(), { target: { value: 'Use {{aud' } })
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('stays closed on a slash inside prose', () => {
    render(<Harness />)
    fireEvent.change(field(), { target: { value: 'Give the role/title' } })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('offers nothing to a viewer who cannot edit the prompt', () => {
    render(<Harness readOnly />)
    fireEvent.change(field(), { target: { value: '/host' } })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Browse/ })).toBeDisabled()
  })
})

describe('PromptVariableTextarea field colouring', () => {
  const availability = { podcast_name: true, itunes_rating: false }

  it('leaves the prompt uncoloured when no podcast is in context', () => {
    render(<Harness initial="Use {{podcast_name}}." />)
    // Not "everything is empty" — nothing is claimed either way.
    expect(highlightLayer()).toBeNull()
    expect(screen.queryByText(/have no value for this podcast/)).not.toBeInTheDocument()
  })

  it('marks a field this podcast has, and one it does not', () => {
    render(<Harness availability={availability} initial="Open on {{podcast_name}} ({{itunes_rating}})." />)
    expect(tokenSpan('{{podcast_name}}')?.className).toContain('text-emerald-700')
    expect(tokenSpan('{{itunes_rating}}')?.className).toContain('text-amber-700')
    expect(screen.getByText(/reach the model as/)).toBeInTheDocument()
  })

  // Empty and required stops the run; empty and optional only degrades it.
  // The stronger warning is reserved for the one that costs a run.
  it('separates a field that blocks the run from one that only degrades it', () => {
    render(
      <Harness
        availability={availability}
        requiredVariableIds={['itunes_rating']}
        initial="Open on {{podcast_name}} ({{itunes_rating}})."
      />,
    )
    expect(tokenSpan('{{itunes_rating}}')?.className).toContain('text-red-700')
    expect(screen.getByText(/skips the stage entirely/)).toBeInTheDocument()
  })

  it('says nothing about blocking when no empty field is required', () => {
    render(<Harness availability={availability} initial="Open on {{itunes_rating}}." />)
    expect(screen.queryByText(/skips the stage entirely/)).not.toBeInTheDocument()
  })

  // The filler substitutes only registered tokens, so prose written in
  // placeholder syntax must not be coloured as though it were a field.
  it('leaves an unregistered token as prose', () => {
    render(<Harness availability={availability} initial="No unfilled {{placeholders}} may appear." />)
    expect(tokenSpan('{{placeholders}}')).toBeUndefined()
    expect(highlightLayer()?.textContent).toContain('{{placeholders}}')
  })

  // A field absent from the preview is one no stage has written yet. On this
  // run it is empty, and the model will be told exactly that.
  it('treats a field the preview does not mention as empty', () => {
    render(<Harness availability={availability} initial="Cite {{research_report}}." />)
    expect(tokenSpan('{{research_report}}')?.className).toContain('text-amber-700')
  })

  it('keeps the coloured layer in step with the prompt as it is edited', () => {
    render(<Harness availability={availability} />)
    fireEvent.change(field(), { target: { value: 'Rated {{itunes_rating}}.' } })
    expect(highlightLayer()?.textContent).toContain('Rated {{itunes_rating}}.')
    expect(tokenSpan('{{itunes_rating}}')?.className).toContain('text-amber-700')
  })
})

describe('PromptVariableTextarea field colouring in the pickers', () => {
  const availability = { podcast_name: true, itunes_rating: false }

  it('marks each row in the insert menu before you pick it', async () => {
    render(<Harness availability={availability} />)
    fireEvent.change(field(), { target: { value: 'Use {{podcast_nam' } })
    await screen.findByRole('listbox')
    expect(rowFor('podcast_name').textContent).toContain('has a value')

    fireEvent.change(field(), { target: { value: 'Use {{itunes_rat' } })
    await screen.findByRole('listbox')
    expect(rowFor('itunes_rating').textContent).toContain('empty')
  })

  it('marks each chip in the browse palette', () => {
    render(<Harness availability={availability} />)
    fireEvent.click(screen.getByRole('button', { name: `Browse ${PROMPT_VARIABLES.length} fields` }))
    expect(screen.getByLabelText(/Insert Podcast name — has a value/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Insert Apple rating — empty, reaches the model as Not available/)).toBeInTheDocument()
  })

  // With no podcast open there is nothing to report, and a list painted red
  // would claim the podcast lacks fields rather than that none is selected.
  it('says nothing about availability when no podcast is in context', async () => {
    render(<Harness />)
    fireEvent.change(field(), { target: { value: 'Use {{podcast_nam' } })
    await screen.findByRole('listbox')
    expect(rowFor('podcast_name').textContent).not.toContain('has a value')
    expect(rowFor('podcast_name').textContent).not.toContain('empty')
  })
})

describe('PromptVariableTextarea requirement switch on the token', () => {
  const availability = { podcast_name: true, itunes_rating: false }

  it('requires a field from the token itself', () => {
    const toggle = vi.fn()
    render(
      <Harness
        availability={availability}
        onToggleRequired={toggle}
        initial="Rated {{itunes_rating}}."
      />,
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Require itunes_rating' }))
    expect(toggle).toHaveBeenCalledWith('itunes_rating', true)
  })

  it('reports the current state on the switch', () => {
    render(
      <Harness
        availability={availability}
        requiredVariableIds={['itunes_rating']}
        onToggleRequired={vi.fn()}
        initial="Rated {{itunes_rating}}."
      />,
    )
    expect(screen.getByRole('switch', { name: 'Require itunes_rating' }))
      .toHaveAttribute('aria-checked', 'true')
  })

  // Without a handler the layer stays purely decorative, which is what keeps
  // it in step with the caret for a reader who cannot change anything.
  it('shows no switch where requirements cannot be changed', () => {
    render(<Harness availability={availability} initial="Rated {{itunes_rating}}." />)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})

describe('PromptVariableTextarea switch state', () => {
  // The switch used to read its state off the token's severity, and severity
  // answers "filled" before it ever looks at requiredness — so on a prompt
  // where every field had a value, every switch was stuck off and clicking
  // one did nothing visible.
  it('shows a filled field as required when it is required', () => {
    render(
      <Harness
        availability={{ podcast_name: true }}
        requiredVariableIds={['podcast_name']}
        onToggleRequired={vi.fn()}
        initial="Open on {{podcast_name}}."
      />,
    )
    expect(screen.getByRole('switch', { name: 'Require podcast_name' }))
      .toHaveAttribute('aria-checked', 'true')
  })

  it('turns a filled field on from off', () => {
    const toggle = vi.fn()
    render(
      <Harness
        availability={{ podcast_name: true }}
        onToggleRequired={toggle}
        initial="Open on {{podcast_name}}."
      />,
    )
    const control = screen.getByRole('switch', { name: 'Require podcast_name' })
    expect(control).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(control)
    expect(toggle).toHaveBeenCalledWith('podcast_name', true)
  })
})
