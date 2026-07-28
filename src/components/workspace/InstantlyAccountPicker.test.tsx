import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  InstantlyAccountPicker,
  type InstantlyAccountClientLink,
} from '@/components/workspace/InstantlyAccountPicker'
import type { InstantlySendingAccount } from '@/services/workspaceCampaigns'

function account(email: string, status = 1, dailyLimit: number | null = 15): InstantlySendingAccount {
  return { email, first_name: 'Adam', last_name: 'Frey', status, warmup_status: null, daily_limit: dailyLimit }
}

const ACCOUNTS = [
  account('a@tony.co'),
  account('b@tony.co'),
  account('c@dana.co'),
  account('d@free.co'),
  account('e@free.co', 2),
]

const ASSIGNMENTS = new Map<string, InstantlyAccountClientLink[]>([
  ['a@tony.co', [{ client_id: 'client-tony', client_name: 'Tony Baltodano' }]],
  ['b@tony.co', [{ client_id: 'client-tony', client_name: 'Tony Baltodano' }]],
  ['c@dana.co', [{ client_id: 'client-dana', client_name: 'Dana Reed' }]],
])

interface HarnessProps {
  initial?: string[]
  defaultClientId?: string | null
  withAssignments?: boolean
}

const Harness = ({ initial = [], defaultClientId = null, withAssignments = true }: HarnessProps) => {
  const [selected, setSelected] = useState(new Set(initial))
  return (
    <InstantlyAccountPicker
      accounts={ACCOUNTS}
      connected
      selected={selected}
      onChange={setSelected}
      assignments={withAssignments ? ASSIGNMENTS : undefined}
      defaultClientId={defaultClientId}
    />
  )
}

function chooseClient(label: string) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Filter mailboxes by client' }))
  fireEvent.click(screen.getByRole('option', { name: label }))
}

describe('InstantlyAccountPicker', () => {
  it('narrows the mailboxes to the client that sends from them', () => {
    render(<Harness />)
    expect(screen.getByText('5 mailboxes')).toBeInTheDocument()

    chooseClient('Tony Baltodano (2)')

    expect(screen.getByText('2 of 5 mailboxes')).toBeInTheDocument()
    expect(screen.getByLabelText('Use a@tony.co')).toBeInTheDocument()
    expect(screen.queryByLabelText('Use c@dana.co')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Use d@free.co')).not.toBeInTheDocument()
  })

  it('offers the mailboxes no client is using yet', () => {
    render(<Harness />)
    chooseClient('Not connected to a client (2)')

    expect(screen.getByLabelText('Use d@free.co')).toBeInTheDocument()
    expect(screen.getByLabelText('Use e@free.co')).toBeInTheDocument()
    expect(screen.queryByLabelText('Use a@tony.co')).not.toBeInTheDocument()
  })

  it('selects only the mailboxes the filter is showing', () => {
    render(<Harness />)
    chooseClient('Tony Baltodano (2)')

    fireEvent.click(screen.getByRole('button', { name: 'Select these 2' }))

    // Not all five: a filtered "select all" that reached the hidden mailboxes
    // would put a stranger's client on this campaign without saying so.
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    expect(screen.getByLabelText('Use a@tony.co')).toBeChecked()
  })

  it('skips an inactive mailbox when selecting what is shown', () => {
    render(<Harness />)
    chooseClient('Not connected to a client (2)')

    fireEvent.click(screen.getByRole('button', { name: 'Select these 1' }))

    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(screen.getByLabelText('Use d@free.co')).toBeChecked()
    expect(screen.getByLabelText('Use e@free.co')).not.toBeChecked()
  })

  it('says when a selected mailbox is hidden by the filter rather than losing it', () => {
    render(<Harness initial={['c@dana.co']} />)
    chooseClient('Tony Baltodano (2)')

    expect(screen.getByText(/1 selected mailbox is hidden by this filter/)).toBeInTheDocument()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('searches across the mailbox, the person, and the client using it', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Search mailboxes'), { target: { value: 'dana reed' } })

    expect(screen.getByText('1 of 5 mailboxes')).toBeInTheDocument()
    expect(screen.getByLabelText('Use c@dana.co')).toBeInTheDocument()
  })

  it('names the client a mailbox already sends for', () => {
    render(<Harness />)
    const row = screen.getByLabelText('Use a@tony.co').closest('label') as HTMLElement
    expect(within(row).getByText('Tony Baltodano')).toBeInTheDocument()
  })

  it('starts on a client that holds mailboxes', () => {
    render(<Harness defaultClientId="client-dana" />)
    expect(screen.getByText('1 of 5 mailboxes')).toBeInTheDocument()
  })

  it('stays on every mailbox for a client that holds none, rather than opening empty', () => {
    render(<Harness defaultClientId="client-new" />)
    expect(screen.getByText('5 mailboxes')).toBeInTheDocument()
    expect(screen.getByLabelText('Use a@tony.co')).toBeInTheDocument()
  })

  it('drops the client filter entirely when no assignments are known', () => {
    render(<Harness withAssignments={false} />)
    expect(screen.queryByRole('combobox', { name: 'Filter mailboxes by client' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Search mailboxes')).toBeInTheDocument()
  })
})
