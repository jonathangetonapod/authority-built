import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { PromptVariableTextarea } from '@/components/workspace/PromptVariableTextarea'
import { PROMPT_VARIABLES, PROMPT_VARIABLE_GROUPS } from '@/lib/promptVariables'

const Harness = ({ readOnly }: { readOnly?: boolean }) => {
  const [value, setValue] = useState('')
  return (
    <PromptVariableTextarea
      value={value}
      onChange={setValue}
      ariaLabel="Prompt"
      readOnly={readOnly}
    />
  )
}

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
