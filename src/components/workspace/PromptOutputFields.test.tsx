import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PromptOutputFields } from '@/components/workspace/PromptOutputFields'

describe('PromptOutputFields', () => {
  it('describes the empty state as the ordinary one, not a gap to fill', () => {
    render(<PromptOutputFields fields={[]} onChange={vi.fn()} />)
    expect(screen.getByText(/this stage writes a report/i)).toBeInTheDocument()
    expect(screen.getByText(/most stages stay this way/i)).toBeInTheDocument()
    // What it is for, before how it works.
    expect(screen.getByText(/pulls one value out instead/i)).toBeInTheDocument()
    // Naming a field used to replace the report the later stages read, so this
    // said so in amber. The stage writes both now, and the copy has to stop
    // warning about a cost that is no longer charged.
    expect(screen.getByText(/nothing is lost by doing it/i)).toBeInTheDocument()
  })

  // The consequence the panel never stated: naming a field does not add one to
  // the prose, it replaces the prose. The stage is asked for a JSON object
  // with exactly these keys and nothing else, so a research prompt that also
  // asks for a quote bank and audience insights silently stops producing them.
  it('says the report survives, because it now does', () => {
    render(
      <PromptOutputFields
        fields={[{ id: 'host_style', label: 'host_style', description: '', type: 'text' }]}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText(/writes its report as usual/i)).toBeInTheDocument()
    expect(screen.getByText(/still read the whole report/i)).toBeInTheDocument()
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
        expect(screen.getByText(/2 values below/i)).toBeInTheDocument()
  })

  // The placeholder read like an existing entry in a plain-text rendering of
  // the page, which is how it came to look as though a field was declared.
  it('marks the name box as an example, not an entry', () => {
    render(<PromptOutputFields fields={[]} onChange={vi.fn()} />)
    expect(screen.getByLabelText('New field name'))
      .toHaveAttribute('placeholder', 'Name a value to pull out, e.g. host_style')
  })
})
