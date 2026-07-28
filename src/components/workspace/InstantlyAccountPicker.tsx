import { useEffect, useMemo, useRef, useState } from 'react'
import { Mail, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { InstantlySendingAccount } from '@/services/workspaceCampaigns'

export interface InstantlyAccountClientLink {
  client_id: string
  client_name: string
}

interface InstantlyAccountPickerProps {
  accounts: InstantlySendingAccount[]
  connected: boolean
  selected: Set<string>
  onChange: (accounts: Set<string>) => void
  disabled?: boolean
  className?: string
  /**
   * Mailbox email -> the clients whose campaigns already send from it. A mailbox
   * belongs to a client by being on that client's campaign, so this is derived
   * from the campaign sender lists rather than a second record of ownership.
   */
  assignments?: Map<string, InstantlyAccountClientLink[]>
  /** Preselect this client in the filter, when they actually hold mailboxes. */
  defaultClientId?: string | null
}

const ALL_CLIENTS = 'all'
const NO_CLIENT = 'unassigned'

function accountName(account: InstantlySendingAccount): string {
  return [account.first_name, account.last_name].filter(Boolean).join(' ').trim()
}

export function InstantlyAccountPicker({
  accounts,
  connected,
  selected,
  onChange,
  disabled = false,
  className = 'max-h-64',
  assignments,
  defaultClientId = null,
}: InstantlyAccountPickerProps) {
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState<string>(ALL_CLIENTS)

  const linksFor = useMemo(
    () => (email: string): InstantlyAccountClientLink[] => assignments?.get(email) || [],
    [assignments],
  )

  const sortedAccounts = useMemo(() => [...accounts].sort((left, right) => (
    Number(right.status === 1) - Number(left.status === 1)
    || left.email.localeCompare(right.email)
  )), [accounts])

  // Only clients that actually hold a mailbox are offered. A client with none
  // would filter to an empty list, which reads as a broken picker.
  const clientOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; count: number }>()
    let unassigned = 0
    for (const account of sortedAccounts) {
      const links = linksFor(account.email)
      if (links.length === 0) {
        unassigned += 1
        continue
      }
      for (const link of links) {
        const existing = byId.get(link.client_id)
        if (existing) existing.count += 1
        else byId.set(link.client_id, { id: link.client_id, name: link.client_name, count: 1 })
      }
    }
    return {
      clients: Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name)),
      unassigned,
    }
  }, [sortedAccounts, linksFor])

  // Follow the client the caller is working on, but never into an empty list.
  const appliedDefault = useRef<string | null>(null)
  useEffect(() => {
    if (appliedDefault.current === defaultClientId) return
    appliedDefault.current = defaultClientId
    const holdsMailboxes = defaultClientId
      && clientOptions.clients.some((client) => client.id === defaultClientId)
    setClientFilter(holdsMailboxes ? defaultClientId : ALL_CLIENTS)
  }, [defaultClientId, clientOptions.clients])

  const query = search.trim().toLowerCase()
  const visibleAccounts = useMemo(() => sortedAccounts.filter((account) => {
    const links = linksFor(account.email)
    if (clientFilter === NO_CLIENT && links.length > 0) return false
    if (clientFilter !== ALL_CLIENTS
      && clientFilter !== NO_CLIENT
      && !links.some((link) => link.client_id === clientFilter)) return false
    if (!query) return true
    return account.email.toLowerCase().includes(query)
      || accountName(account).toLowerCase().includes(query)
      || links.some((link) => link.client_name.toLowerCase().includes(query))
  }), [sortedAccounts, clientFilter, query, linksFor])

  const accountEmails = new Set(sortedAccounts.map((account) => account.email))
  const missingSelections = Array.from(selected)
    .filter((email) => !accountEmails.has(email))
    .sort((left, right) => left.localeCompare(right))
  const activeAccounts = sortedAccounts.filter((account) => account.status === 1)
  const visibleActiveAccounts = visibleAccounts.filter((account) => account.status === 1)
  const selectedCapacity = activeAccounts.reduce((total, account) => (
    selected.has(account.email) ? total + (account.daily_limit || 0) : total
  ), 0)
  const filtered = clientFilter !== ALL_CLIENTS || query.length > 0
  // A mailbox selected but hidden still sends. Saying so keeps the count in the
  // header from reading as a mistake, and stops Clear looking like a no-op.
  const hiddenSelected = filtered
    ? sortedAccounts.filter((account) => (
      selected.has(account.email) && !visibleAccounts.includes(account)
    )).length
    : 0

  const setAccount = (email: string, checked: boolean) => {
    const next = new Set(selected)
    if (checked) next.add(email)
    else next.delete(email)
    onChange(next)
  }

  const selectAllShown = () => {
    const next = new Set(selected)
    for (const account of visibleActiveAccounts) next.add(account.email)
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Label>Accounts to use</Label>
          <p className="mt-1 text-xs text-muted-foreground">Select one or more accounts to send emails from.</p>
        </div>
        {connected && sortedAccounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{selected.size} selected</Badge>
            {selectedCapacity > 0 && <Badge variant="outline">{selectedCapacity.toLocaleString()}/day</Badge>}
          </div>
        )}
      </div>

      {!connected ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          Connect Instantly to choose campaign mailboxes.
        </div>
      ) : sortedAccounts.length === 0 && missingSelections.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          No mailboxes were found in the connected Instantly workspace. Refresh the connection after adding an account.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search mailboxes"
                aria-label="Search mailboxes"
                className="pl-9"
                disabled={disabled}
              />
            </div>
            {assignments && (clientOptions.clients.length > 0 || clientOptions.unassigned > 0) && (
              <Select value={clientFilter} onValueChange={setClientFilter} disabled={disabled}>
                <SelectTrigger className="sm:w-64" aria-label="Filter mailboxes by client">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CLIENTS}>All clients ({sortedAccounts.length})</SelectItem>
                  {clientOptions.unassigned > 0 && (
                    <SelectItem value={NO_CLIENT}>Not connected to a client ({clientOptions.unassigned})</SelectItem>
                  )}
                  {clientOptions.clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>{client.name} ({client.count})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className={`overflow-y-auto rounded-xl border ${className}`}>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background/95 px-3 py-2 backdrop-blur">
              <p className="text-xs font-medium text-muted-foreground">
                {filtered
                  ? `${visibleAccounts.length} of ${sortedAccounts.length} mailboxes`
                  : `${sortedAccounts.length} mailbox${sortedAccounts.length === 1 ? '' : 'es'}`}
              </p>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={disabled || visibleActiveAccounts.length === 0}
                  onClick={selectAllShown}
                >
                  {filtered ? `Select these ${visibleActiveAccounts.length}` : 'Select all active'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={disabled || selected.size === 0}
                  onClick={() => onChange(new Set())}
                >
                  Clear
                </Button>
              </div>
            </div>

            {hiddenSelected > 0 && (
              <p className="border-b bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
                {hiddenSelected} selected mailbox{hiddenSelected === 1 ? ' is' : 'es are'} hidden by this filter and will still send. Clear removes all {selected.size}.
              </p>
            )}

            <div className="divide-y">
              {visibleAccounts.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No mailbox matches this filter.</p>
              )}
              {visibleAccounts.map((account) => {
                const active = account.status === 1
                const checked = selected.has(account.email)
                const name = accountName(account)
                const links = linksFor(account.email)
                return (
                  <label
                    key={account.email}
                    className={`flex items-center gap-3 px-3 py-3 transition-colors ${active ? 'cursor-pointer hover:bg-muted/30' : checked ? 'cursor-pointer bg-amber-50/40' : 'cursor-not-allowed bg-muted/15 text-muted-foreground'}`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => setAccount(account.email, value === true)}
                      disabled={disabled || (!active && !checked)}
                      aria-label={`Use ${account.email}`}
                    />
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Mail className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{name || account.email}</p>
                      {name && <p className="truncate text-xs text-muted-foreground">{account.email}</p>}
                      {links.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {links.map((link) => (
                            <Badge key={link.client_id} variant="secondary" className="rounded-full text-[10px] font-normal">
                              {link.client_name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="outline" className={active ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : undefined}>{active ? 'Active' : 'Unavailable'}</Badge>
                      {account.daily_limit !== null && <span className="text-[11px] text-muted-foreground">{account.daily_limit.toLocaleString()}/day</span>}
                    </div>
                  </label>
                )
              })}

              {missingSelections.map((email) => (
                <label key={email} className="flex cursor-pointer items-center gap-3 bg-amber-50/40 px-3 py-3">
                  <Checkbox checked onCheckedChange={(value) => setAccount(email, value === true)} disabled={disabled} aria-label={`Use ${email}`} />
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><Mail className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{email}</p><p className="text-xs text-amber-800">No longer returned by Instantly</p></div>
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Remove</Badge>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
