import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { PromptVariableTextarea } from '@/components/workspace/PromptVariableTextarea'
import { PROMPT_VARIABLES } from '@/lib/promptVariables'

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
    fireEvent.click(await screen.findByRole('option', { name: /episode_title/ }))
    await waitFor(() => expect(field().value).toBe('Quote {{episode_title}}'))
  })

  it('moves the active option with the arrow keys and inserts on Enter', async () => {
    render(<Harness />)
    fireEvent.change(field(), { target: { value: '/host' } })
    await screen.findByRole('listbox')
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    fireEvent.keyDown(field(), { key: 'Enter' })
    // Second of the id-prefix matches, in registry order.
    await waitFor(() => expect(field().value).toBe('{{host_name}}'))
  })

  it('says how much of the registry the menu is showing', async () => {
    render(<Harness />)
    fireEvent.change(field(), { target: { value: '/' } })
    await screen.findByRole('listbox')
    // A bare slash matches everything, so the menu is a window on the registry
    // rather than a view of it — a screenful must not read as the whole list.
    const shown = screen.getAllByRole('option').length
    expect(shown).toBeGreaterThan(8)
    expect(shown).toBeLessThan(PROMPT_VARIABLES.length)
    expect(screen.getByText(
      `${shown} of ${PROMPT_VARIABLES.length} matches — keep typing to narrow`,
    )).toBeInTheDocument()
  })

  it('counts against the registry once the matches all fit', async () => {
    render(<Harness />)
    fireEvent.change(field(), { target: { value: '/host' } })
    await screen.findByRole('listbox')
    const shown = screen.getAllByRole('option').length
    expect(screen.getByText(`${shown} of ${PROMPT_VARIABLES.length} fields`)).toBeInTheDocument()
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
