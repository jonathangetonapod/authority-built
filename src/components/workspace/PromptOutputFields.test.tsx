import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PromptOutputFields } from '@/components/workspace/PromptOutputFields'

describe('PromptOutputFields', () => {
  it('describes the empty state as the ordinary one, not a gap to fill', () => {
    render(<PromptOutputFields fields={[]} onChange={vi.fn()} />)
    expect(screen.getByText(/writes one block of text/)).toBeInTheDocument()
    expect(screen.getByText(/which is the usual setup/)).toBeInTheDocument()
  })

  // The consequence the panel never stated: naming a field does not add one to
  // the prose, it replaces the prose. The stage is asked for a JSON object
  // with exactly these keys and nothing else, so a research prompt that also
  // asks for a quote bank and audience insights silently stops producing them.
  it('says that naming a field replaces the prose entirely', () => {
    render(
      <PromptOutputFields
        fields={[{ id: 'host_style', label: 'host_style', description: '', type: 'text' }]}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText(/is not produced/)).toBeInTheDocument()
    expect(screen.getByText(/not named here is lost/)).toBeInTheDocument()
  })

  it('counts the fields it will return', () => {
    render(
      <PromptOutputFields
        fields={[
          { id: 'host_style', label: 'host_style', description: '', type: 'text' },
          { id: 'audience', label: 'audience', description: '', type: 'list' },
        ]}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText(/only/)).toBeInTheDocument()
    expect(screen.getByText(/fields below, as JSON/)).toBeInTheDocument()
  })

  // The placeholder read like an existing entry in a plain-text rendering of
  // the page, which is how it came to look as though a field was declared.
  it('marks the name box as an example, not an entry', () => {
    render(<PromptOutputFields fields={[]} onChange={vi.fn()} />)
    expect(screen.getByLabelText('New field name'))
      .toHaveAttribute('placeholder', 'Name a field, e.g. host_style')
  })
})
